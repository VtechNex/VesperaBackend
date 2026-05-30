import bcrypt from "bcrypt";
import pool from "../db/pool.js";
import {
  areAllPermissionValuesFalse,
  canAssignRole,
  canManageTargetUser,
  getDefaultPermissionsForRole,
  getEffectivePermissions,
  normalizeUserRole,
  ROLES,
  sanitizePermissionOverrides,
} from "../middleware/security.js";
import {
  badRequest,
  validateManagedUserPayload,
  validatePermissionPayload,
} from "../utils/validation.js";
import {
  createUserCreatedNotification,
  createUserPermissionUpdateNotification,
} from "../services/notificationService.js";

function getStoredPermissionsForRole(role, permissions) {
  const normalizedRole = normalizeUserRole(role);
  if (normalizedRole === ROLES.MAIN_ADMIN || normalizedRole === ROLES.MANAGER) {
    return {};
  }

  return {
    ...getDefaultPermissionsForRole(normalizedRole),
    ...sanitizePermissionOverrides(permissions),
  };
}

function sanitizeManagedUser(row) {
  const role = normalizeUserRole(row.role);
  const permissions = sanitizePermissionOverrides(row.permissions);

  return {
    id: row.id,
    uid: row.id,
    username: row.username,
    email: row.email,
    role,
    rawRole: row.role,
    is_active: row.is_active,
    isActive: row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    name: [row.first_name, row.last_name].filter(Boolean).join(" ").trim() || row.username,
    first_name: row.first_name || "",
    last_name: row.last_name || "",
    firstName: row.first_name || "",
    lastName: row.last_name || "",
    permissions,
    effectivePermissions: getEffectivePermissions({ role, permissions }),
  };
}

async function loadUserById(id) {
  const result = await pool.query(
    `SELECT id, username, email, role, is_active, created_at, updated_at, created_by, updated_by,
            first_name, last_name, permissions
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [id]
  );

  return result.rows[0] || null;
}

function assertActorCanAssignRole(actor, targetRole) {
  if (!canAssignRole(actor, targetRole)) {
    throw new Error("You are not allowed to assign this role.");
  }
}

function assertActorCanManageExistingUser(actor, targetUser) {
  if (!canManageTargetUser(actor, targetUser)) {
    throw new Error("You are not allowed to manage this user.");
  }
}

function assertNoSelfEscalation(actor, targetUserId, targetRole, permissions) {
  if (String(actor?.id) !== String(targetUserId)) {
    return;
  }

  const actorRole = normalizeUserRole(actor?.role);
  const requestedRole = normalizeUserRole(targetRole);

  if (requestedRole !== actorRole) {
    throw new Error("You cannot change your own role.");
  }

  const currentPermissions = getEffectivePermissions(actor);
  const requestedPermissions = getEffectivePermissions({
    role: requestedRole,
    permissions: permissions || actor?.permissions,
  });

  for (const [permissionKey, isEnabled] of Object.entries(currentPermissions)) {
    if (isEnabled && !requestedPermissions[permissionKey]) {
      throw new Error("You cannot reduce or change your own critical permissions.");
    }
  }
}

function assertNoSelfDeactivation(actor, targetUserId, isActive) {
  if (String(actor?.id) === String(targetUserId) && isActive === false) {
    throw new Error("You cannot deactivate your own account.");
  }
}

async function emitNotificationSafely(task, label) {
  try {
    await task();
  } catch (error) {
    console.error(`[notifications] ${label} failed`, error);
  }
}

export const createUser = async (req, res) => {
  try {
    const payload = validateManagedUserPayload(req.body, { requirePassword: true });
    const requestedPermissions = validatePermissionPayload(req.body.permissions || {});
    const normalizedRole = normalizeUserRole(payload.role || ROLES.L2);

    assertActorCanAssignRole(req.user, normalizedRole);

    const hashedPassword = await bcrypt.hash(payload.password, 10);
    const storedPermissions = getStoredPermissionsForRole(normalizedRole, requestedPermissions);

    const result = await pool.query(
      `INSERT INTO users (
         username, email, password, role, first_name, last_name, is_active, permissions, created_by, updated_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10)
       RETURNING id, username, email, role, is_active, created_at, updated_at, created_by, updated_by,
                 first_name, last_name, permissions`,
      [
        payload.username,
        payload.email,
        hashedPassword,
        normalizedRole,
        payload.firstName,
        payload.lastName,
        payload.isActive,
        JSON.stringify(storedPermissions),
        req.user.id,
        req.user.id,
      ]
    );

    const createdUser = sanitizeManagedUser(result.rows[0]);

    await emitNotificationSafely(
      () =>
        createUserCreatedNotification(createdUser.id, {
          actorUserId: req.user.id,
          role: createdUser.role,
        }),
      "createUserCreatedNotification"
    );

    return res.status(201).json({
      success: true,
      data: createdUser,
    });
  } catch (error) {
    console.error(error);
    if (error instanceof Error) {
      if (
        error.message.includes("required") ||
        error.message.includes("valid") ||
        error.message.includes("Password") ||
        error.message.includes("Permissions") ||
        error.message.includes("allowed")
      ) {
        return badRequest(res, error.message);
      }
    }
    if (error.code === "23505") {
      return res.status(409).json({ success: false, message: "Username or email already exists" });
    }
    return res.status(500).json({ success: false, message: "User creation failed" });
  }
};

export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const payload = validateManagedUserPayload(req.body, { requirePassword: false });
    const requestedPermissions = validatePermissionPayload(req.body.permissions || {});
    const normalizedRole = normalizeUserRole(payload.role || ROLES.L2);
    const existingUser = await loadUserById(id);

    if (!existingUser) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    assertActorCanManageExistingUser(req.user, existingUser);
    assertActorCanAssignRole(req.user, normalizedRole);
    assertNoSelfEscalation(req.user, id, normalizedRole, requestedPermissions);
    assertNoSelfDeactivation(req.user, id, payload.isActive);

    if (normalizeUserRole(existingUser.role) === ROLES.MAIN_ADMIN && normalizeUserRole(req.user.role) !== ROLES.MAIN_ADMIN) {
      return res.status(403).json({ success: false, message: "Only MAIN_ADMIN can manage another MAIN_ADMIN." });
    }

    const storedPermissions = getStoredPermissionsForRole(normalizedRole, requestedPermissions);

    const result = await pool.query(
      `UPDATE users
       SET username = $1,
           email = $2,
           role = $3,
           is_active = COALESCE($4, is_active),
           first_name = COALESCE($5, first_name),
           last_name = COALESCE($6, last_name),
           permissions = $7::jsonb,
           updated_by = $8,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $9
       RETURNING id, username, email, role, is_active, created_at, updated_at, created_by, updated_by,
                 first_name, last_name, permissions`,
      [
        payload.username,
        payload.email,
        normalizedRole,
        payload.isActive,
        payload.firstName,
        payload.lastName,
        JSON.stringify(storedPermissions),
        req.user.id,
        id,
      ]
    );

    const updatedUser = sanitizeManagedUser(result.rows[0]);

    await emitNotificationSafely(
      () =>
        createUserPermissionUpdateNotification(updatedUser.id, {
          actorUserId: req.user.id,
          role: updatedUser.role,
          isActive: updatedUser.isActive,
        }),
      "createUserPermissionUpdateNotification"
    );

    return res.json({ success: true, data: updatedUser });
  } catch (error) {
    console.error(error);
    if (error instanceof Error) {
      if (
        error.message.includes("required") ||
        error.message.includes("valid") ||
        error.message.includes("allowed") ||
        error.message.includes("critical") ||
        error.message.includes("cannot")
      ) {
        return badRequest(res, error.message);
      }
    }
    if (error.code === "23505") {
      return res.status(409).json({ success: false, message: "Username or email already exists" });
    }
    return res.status(500).json({ success: false, message: "User update failed" });
  }
};

export const deactiveUser = async (req, res) => {
  try {
    const { id } = req.params;
    const existingUser = await loadUserById(id);

    if (!existingUser) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    assertActorCanManageExistingUser(req.user, existingUser);
    assertNoSelfEscalation(req.user, id, existingUser.role, existingUser.permissions);
    assertNoSelfDeactivation(req.user, id, false);

    await pool.query(
      `UPDATE users
       SET is_active = false,
           updated_by = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [req.user.id, id]
    );

    await emitNotificationSafely(
      () =>
        createUserPermissionUpdateNotification(id, {
          actorUserId: req.user.id,
          isActive: false,
        }),
      "createUserPermissionUpdateNotification"
    );

    return res.json({ success: true, message: "User deactivated successfully" });
  } catch (error) {
    console.error(error);
    if (error instanceof Error) {
      return badRequest(res, error.message);
    }
    return res.status(500).json({ success: false, message: "User deactivation failed" });
  }
};

export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const existingUser = await loadUserById(id);

    if (!existingUser) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    assertActorCanManageExistingUser(req.user, existingUser);

    if (String(req.user.id) === String(id)) {
      return badRequest(res, "You cannot delete your own account.");
    }

    const result = await pool.query(`DELETE FROM users WHERE id = $1`, [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.json({ success: true, message: "User deleted successfully" });
  } catch (error) {
    console.error(error);
    if (error instanceof Error) {
      return badRequest(res, error.message);
    }
    return res.status(500).json({ success: false, message: "User deletion failed" });
  }
};

export const getUserById = async (req, res) => {
  try {
    const row = await loadUserById(req.params.id);

    if (!row) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (!canManageTargetUser(req.user, row) && String(req.user.id) !== String(row.id)) {
      return res.status(403).json({ success: false, message: "You are not allowed to view this user." });
    }

    return res.json({ success: true, data: sanitizeManagedUser(row) });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Failed to fetch user" });
  }
};

export const getAllUsers = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, username, email, role, is_active, created_at, updated_at, created_by, updated_by,
              first_name, last_name, permissions
       FROM users
       ORDER BY created_at DESC`
    );

    const actorRole = normalizeUserRole(req.user.role);
    const rows =
      actorRole === ROLES.MAIN_ADMIN
        ? result.rows
        : result.rows.filter((row) => {
            const targetRole = normalizeUserRole(row.role);
            return targetRole !== ROLES.MAIN_ADMIN;
          });

    return res.json({ success: true, data: rows.map(sanitizeManagedUser) });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Failed to fetch users" });
  }
};
