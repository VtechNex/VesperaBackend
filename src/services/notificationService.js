import pool from "../db/pool.js";
import {
  getEffectivePermissions,
  hasPermission,
  normalizeUserRole,
  sanitizePermissionOverrides,
  ROLES,
} from "../auth/permissions.js";

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;

function normalizeBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1";
  }
  return false;
}

function normalizePagination(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.floor(parsed));
}

function buildLeadName(lead = {}) {
  const fullName = [lead.fname, lead.lname].filter(Boolean).join(" ").trim();
  return fullName || lead.name || "Lead";
}

function mapUser(row) {
  const role = normalizeUserRole(row.role);
  const permissions = sanitizePermissionOverrides(row.permissions);
  return {
    id: row.id,
    role,
    is_active: row.is_active,
    permissions,
    effectivePermissions: getEffectivePermissions({ role, permissions }),
  };
}

async function loadActiveUsers() {
  const result = await pool.query(
    `SELECT id, role, is_active, permissions
     FROM users
     WHERE is_active = TRUE`
  );

  return result.rows.map(mapUser);
}

async function loadActiveUsersByRoles(roleNames = []) {
  if (!roleNames.length) return [];
  const result = await pool.query(
    `SELECT id, role, is_active, permissions
     FROM users
     WHERE is_active = TRUE
       AND role = ANY($1::text[])`,
    [roleNames]
  );

  return result.rows.map(mapUser);
}

function sanitizeNotificationMetadata(metadata = {}, userProfile) {
  if (!metadata || typeof metadata !== "object") {
    return {};
  }

  const nextMetadata = { ...metadata };

  if (!hasPermission(userProfile, "canViewLeadPhone")) {
    delete nextMetadata.leadPhone;
    delete nextMetadata.contactPhone;
  }

  return nextMetadata;
}

function sanitizeNotificationRow(row, userProfile) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    entityType: row.entity_type,
    entityId: row.entity_id,
    recipientUserId: row.recipient_user_id,
    recipientRole: row.recipient_role,
    isGlobal: row.is_global,
    isRead: row.is_read,
    readAt: row.read_at,
    createdAt: row.created_at,
    createdBy: row.created_by,
    metadata: sanitizeNotificationMetadata(row.metadata || {}, userProfile),
  };
}

async function notificationExists({ recipientUserId, type, entityType, entityId, dedupeKey }) {
  if (!dedupeKey || !recipientUserId) return false;

  const result = await pool.query(
    `SELECT 1
     FROM notifications
     WHERE recipient_user_id = $1
       AND type = $2
       AND entity_type IS NOT DISTINCT FROM $3
       AND entity_id IS NOT DISTINCT FROM $4
       AND COALESCE(metadata->>'dedupeKey', '') = $5
       AND is_read = FALSE
     LIMIT 1`,
    [recipientUserId, type, entityType || null, entityId == null ? null : String(entityId), dedupeKey]
  );

  return result.rowCount > 0;
}

export async function createNotification({
  type,
  title,
  message,
  entityType = null,
  entityId = null,
  recipientUserId = null,
  recipientRole = null,
  isGlobal = false,
  createdBy = null,
  metadata = {},
  dedupeKey = "",
}) {
  if (!recipientUserId && !recipientRole && !isGlobal) {
    return null;
  }

  if (await notificationExists({ recipientUserId, type, entityType, entityId, dedupeKey })) {
    return null;
  }

  const notificationMetadata = dedupeKey
    ? { ...metadata, dedupeKey }
    : metadata;

  const result = await pool.query(
    `INSERT INTO notifications (
       type, title, message, entity_type, entity_id, recipient_user_id, recipient_role,
       is_global, is_read, created_by, metadata
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE, $9, $10::jsonb)
     RETURNING *`,
    [
      type,
      title,
      message,
      entityType,
      entityId == null ? null : String(entityId),
      recipientUserId,
      recipientRole,
      isGlobal,
      createdBy,
      JSON.stringify(notificationMetadata || {}),
    ]
  );

  return result.rows[0] || null;
}

export async function createNotificationsForUsers(userIds = [], payload) {
  const uniqueUserIds = [...new Set(userIds.filter(Boolean).map(String))];
  if (!uniqueUserIds.length) return [];

  const created = [];
  for (const recipientUserId of uniqueUserIds) {
    const notification = await createNotification({
      ...payload,
      recipientUserId,
      recipientRole: payload.recipientRole || null,
      isGlobal: Boolean(payload.isGlobal),
    });
    if (notification) {
      created.push(notification);
    }
  }

  return created;
}

export async function createGlobalNotificationForActiveUsers(payload, permissionName = "canViewDashboard") {
  const activeUsers = await loadActiveUsers();
  const recipients = activeUsers
    .filter((user) => !permissionName || Boolean(user.effectivePermissions?.[permissionName]))
    .map((user) => user.id);

  return createNotificationsForUsers(recipients, {
    ...payload,
    isGlobal: true,
  });
}

export async function createLeadNotification(lead, actorUserId = null) {
  const leadName = buildLeadName(lead);

  return createGlobalNotificationForActiveUsers(
    {
      type: "lead_created",
      title: "New Lead Added",
      message: `A new lead has been added: ${leadName}`,
      entityType: "lead",
      entityId: lead.id,
      createdBy: actorUserId,
      metadata: {
        leadName,
        leadStage: lead.lead_stage || lead.leadStage || "",
        listId: lead.list_id || null,
      },
    },
    "canViewLeads"
  );
}

export async function createLeadAssignedNotification(lead, actorUserId = null) {
  const assigneeId = lead.assigned_to || lead.assignedTo;
  if (!assigneeId) return [];

  const leadName = buildLeadName(lead);
  return createNotificationsForUsers([assigneeId], {
    type: "lead_assigned",
    title: "Lead Assigned",
    message: `A lead has been assigned to you: ${leadName}`,
    entityType: "lead",
    entityId: lead.id,
    createdBy: actorUserId,
    metadata: {
      leadName,
      leadStage: lead.lead_stage || lead.leadStage || "",
    },
  });
}

export async function createLeadStageUpdatedNotification(lead, previousStage, actorUserId = null) {
  const leadName = buildLeadName(lead);
  const nextStage = lead.lead_stage || lead.leadStage || "Updated";

  return createGlobalNotificationForActiveUsers(
    {
      type: "lead_stage_updated",
      title: "Lead Stage Updated",
      message: `${leadName} moved from ${previousStage || "Unknown"} to ${nextStage}`,
      entityType: "lead",
      entityId: lead.id,
      createdBy: actorUserId,
      metadata: {
        leadName,
        previousStage: previousStage || "",
        nextStage,
      },
    },
    "canViewLeads"
  );
}

export async function createFollowUpNotification(lead) {
  const leadName = buildLeadName(lead);
  const dueAt = lead.follow_up_date ? new Date(lead.follow_up_date).toISOString() : "";
  const dedupeKey = `followup:${lead.id}:${dueAt}`;

  if (lead.assigned_to) {
    return createNotificationsForUsers([lead.assigned_to], {
      type: "follow_up_due",
      title: "Follow-up Reminder",
      message: `Follow-up due for ${leadName}`,
      entityType: "lead",
      entityId: lead.id,
      metadata: {
        leadName,
        followUpDate: lead.follow_up_date || null,
        dedupeKey,
      },
      dedupeKey,
    });
  }

  const fallbackUsers = await loadActiveUsersByRoles([ROLES.MAIN_ADMIN, ROLES.MANAGER]);
  const recipients = fallbackUsers.map((user) => user.id);

  return createNotificationsForUsers(recipients, {
    type: "follow_up_due",
    title: "Follow-up Reminder",
    message: `Follow-up due for ${leadName}`,
    entityType: "lead",
    entityId: lead.id,
    metadata: {
      leadName,
      followUpDate: lead.follow_up_date || null,
      dedupeKey,
    },
    dedupeKey,
  });
}

export async function createUserPermissionUpdateNotification(targetUserId, { actorUserId = null, role, isActive } = {}) {
  if (!targetUserId) return [];

  const messageParts = ["Your account access was updated."];
  if (role) {
    messageParts.push(`Role: ${role}.`);
  }
  if (typeof isActive === "boolean") {
    messageParts.push(isActive ? "Your account is active." : "Your account is inactive.");
  }

  return createNotificationsForUsers([targetUserId], {
    type: "user_access_updated",
    title: "Access Updated",
    message: messageParts.join(" "),
    entityType: "user",
    entityId: targetUserId,
    createdBy: actorUserId,
    metadata: {
      role: role || "",
      isActive: typeof isActive === "boolean" ? isActive : null,
    },
  });
}

export async function createUserCreatedNotification(targetUserId, { actorUserId = null, role } = {}) {
  if (!targetUserId) return [];

  return createNotificationsForUsers([targetUserId], {
    type: "user_account_created",
    title: "Account Created",
    message: "Your admin panel account is ready to use.",
    entityType: "user",
    entityId: targetUserId,
    createdBy: actorUserId,
    metadata: {
      role: role || "",
    },
  });
}

export async function getNotificationsForUser(userProfile, query = {}) {
  const page = normalizePagination(query.page, 1);
  const requestedLimit = normalizePagination(query.limit, DEFAULT_PAGE_SIZE);
  const limit = Math.min(requestedLimit, MAX_PAGE_SIZE);
  const unreadOnly = normalizeBoolean(query.unreadOnly);
  const offset = (page - 1) * limit;

  const whereClauses = ["recipient_user_id = $1"];
  const values = [userProfile.id];

  if (unreadOnly) {
    whereClauses.push("is_read = FALSE");
  }

  const whereClause = `WHERE ${whereClauses.join(" AND ")}`;
  const [countResult, dataResult] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS total FROM notifications ${whereClause}`, values),
    pool.query(
      `SELECT *
       FROM notifications
       ${whereClause}
       ORDER BY created_at DESC, id DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset]
    ),
  ]);

  const total = Number(countResult.rows[0]?.total || 0);
  const totalPages = total > 0 ? Math.ceil(total / limit) : 0;

  return {
    data: dataResult.rows.map((row) => sanitizeNotificationRow(row, userProfile)),
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
  };
}

export async function getUnreadNotificationCount(userId) {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM notifications
     WHERE recipient_user_id = $1
       AND is_read = FALSE`,
    [userId]
  );

  return Number(result.rows[0]?.total || 0);
}

export async function markNotificationRead(notificationId, userId) {
  const result = await pool.query(
    `UPDATE notifications
     SET is_read = TRUE,
         read_at = CURRENT_TIMESTAMP
     WHERE id = $1
       AND recipient_user_id = $2
     RETURNING *`,
    [notificationId, userId]
  );

  return result.rows[0] || null;
}

export async function markAllNotificationsRead(userId) {
  const result = await pool.query(
    `UPDATE notifications
     SET is_read = TRUE,
         read_at = CURRENT_TIMESTAMP
     WHERE recipient_user_id = $1
       AND is_read = FALSE`,
    [userId]
  );

  return Number(result.rowCount || 0);
}
