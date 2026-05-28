import jwt from "jsonwebtoken";
import pool from "../db/pool.js";
import {
  areAllPermissionValuesFalse,
  getDefaultPermissionsForRole,
  getEffectivePermissions,
  hasPermission,
  isUnknownRole,
  normalizePermissionRecord,
  normalizeUserRole,
  ROLES,
  sanitizePermissionOverrides,
  sanitizeLeadCollectionForUser,
  sanitizeLeadForUser,
} from "../auth/permissions.js";

export {
  areAllPermissionValuesFalse,
  getDefaultPermissionsForRole,
  getEffectivePermissions,
  isUnknownRole,
  normalizePermissionRecord,
  normalizeUserRole,
  ROLES,
  sanitizePermissionOverrides,
  sanitizeLeadCollectionForUser,
  sanitizeLeadForUser,
};

export function hasPermissionForRole(rawRole, permissionName) {
  if (rawRole && typeof rawRole === "object") {
    return hasPermission(rawRole, permissionName);
  }
  return hasPermission({ role: rawRole }, permissionName);
}

function buildAuthenticatedUser(row) {
  const normalizedRole = normalizeUserRole(row.role);
  const userProfile = {
    id: row.id,
    email: row.email,
    role: normalizedRole,
    rawRole: row.role,
    username: row.username,
    name: [row.first_name, row.last_name].filter(Boolean).join(" ").trim() || row.username,
    is_active: row.is_active,
    permissions: sanitizePermissionOverrides(row.permissions),
  };

  return {
    ...userProfile,
    effectivePermissions: getEffectivePermissions(userProfile),
  };
}

export const authMiddleware = (req, res, next) => {
  const JWT_SECRET = process.env.JWT_SECRET;

  (async () => {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const token = authHeader.split(" ")[1];

      if (!JWT_SECRET) {
        throw new Error("JWT_SECRET not configured");
      }

      const decoded = jwt.verify(token, JWT_SECRET);
      const userResult = await pool.query(
        `SELECT id, email, role, is_active, username, first_name, last_name, permissions
         FROM users
         WHERE id = $1
         LIMIT 1`,
        [decoded.id]
      );

      if (userResult.rowCount === 0) {
        return res.status(401).json({ error: "User no longer exists" });
      }

      const dbUser = userResult.rows[0];

      if (dbUser.is_active === false) {
        return res.status(403).json({ error: "Your account is inactive" });
      }

      if (isUnknownRole(dbUser.role)) {
        return res.status(403).json({ error: "Your account role is not recognized" });
      }

      req.user = buildAuthenticatedUser(dbUser);
      return next();
    } catch (error) {
      console.error("Auth error:", error?.message || error);
      return res.status(401).json({ error: "Invalid or expired token" });
    }
  })();
};

export const requireRole = (role) => {
  return (req, res, next) => {
    if (normalizeUserRole(req.user?.role) !== normalizeUserRole(role)) {
      return res.status(403).json({ error: "Access denied" });
    }
    return next();
  };
};

export const requirePermission = (permissionName) => {
  return (req, res, next) => {
    if (!hasPermission(req.user, permissionName)) {
      return res.status(403).json({ error: "Access denied" });
    }
    return next();
  };
};

export function canManageTargetUser(actor, targetUser) {
  const actorRole = normalizeUserRole(actor?.role);
  const targetRole = normalizeUserRole(targetUser?.role);

  if (actorRole === ROLES.MAIN_ADMIN) {
    return true;
  }

  if (actorRole === ROLES.MANAGER) {
    return targetRole === ROLES.L1 || targetRole === ROLES.L2;
  }

  return false;
}

export function canAssignRole(actor, targetRole) {
  const actorRole = normalizeUserRole(actor?.role);
  const normalizedTargetRole = normalizeUserRole(targetRole);

  if (actorRole === ROLES.MAIN_ADMIN) {
    return Boolean(normalizedTargetRole);
  }

  if (actorRole === ROLES.MANAGER) {
    return normalizedTargetRole === ROLES.L1 || normalizedTargetRole === ROLES.L2;
  }

  return false;
}
