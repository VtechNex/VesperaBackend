import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import pool from "../src/db/pool.js";

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;
const TEMP_PASSWORD = "TempPass@123";
const TEMP_PREFIX = `rbac_hardening_${Date.now()}`;

const baseUrl = process.env.TEST_API_BASE || "http://127.0.0.1:5000";
let stableUsers;
let createdUserIds = [];
let createdLeadIds = [];
let createdListIds = [];
let createdNotificationIds = [];

function buildToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: "1d" }
  );
}

async function apiRequest(path, { method = "GET", token, body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  return { response, data };
}

async function getStableUsers() {
  const { rows } = await pool.query(
    `SELECT id, email, username, role
     FROM users
     WHERE lower(role) IN ('main_admin', 'manager', 'l1', 'l2', 'admin', 'owner', 'l1', 'l2', 'manager')
     ORDER BY created_at ASC`
  );

  const findByRole = (roleNames) => rows.find((row) => roleNames.includes(String(row.role).toLowerCase()));

  return {
    mainAdmin: findByRole(["main_admin", "admin", "owner", "superadmin"]),
    manager: findByRole(["manager"]),
    l1: findByRole(["l1"]),
    l2: findByRole(["l2"]),
  };
}

async function createManagedUser(actorToken, payload) {
  const { response, data } = await apiRequest("/api/admin/users", {
    method: "POST",
    token: actorToken,
    body: payload,
  });

  if (response.ok && data?.data?.id) {
    createdUserIds.push(data.data.id);
  }

  return { response, data };
}

async function getFirstListId(token) {
  const listsResponse = await apiRequest("/api/lists", { token });
  assert.equal(listsResponse.response.status, 200);
  const targetList = listsResponse.data?.data?.[0];
  assert.ok(targetList?.id, "At least one list is required for RBAC verification");
  return targetList.id;
}

async function createLeadForExport(token, overrides = {}) {
  const listId = await getFirstListId(token);
  const uniqueSuffix = Date.now();
  const payload = {
    list_id: listId,
    fname: "Export",
    lname: "Verification",
    mobile: `98${String(uniqueSuffix).slice(-8)}`,
    email: `${TEMP_PREFIX}_lead_${uniqueSuffix}@vespera.local`,
    ...overrides,
  };

  const createLeadResponse = await apiRequest("/api/leads", {
    method: "POST",
    token,
    body: payload,
  });
  assert.equal(createLeadResponse.response.status, 201);
  const leadId = createLeadResponse.data?.data?.id;
  assert.ok(leadId, "Lead creation should return an id");
  createdLeadIds.push(leadId);
  return { leadId, payload };
}

async function cleanupArtifacts() {
  if (createdNotificationIds.length) {
    await pool.query(`DELETE FROM notifications WHERE id = ANY($1::bigint[])`, [createdNotificationIds]);
  }
  if (createdLeadIds.length) {
    await pool.query(`DELETE FROM leads WHERE id = ANY($1::bigint[])`, [createdLeadIds]);
  }
  if (createdListIds.length) {
    await pool.query(`DELETE FROM lists WHERE id = ANY($1::bigint[])`, [createdListIds]);
  }
  if (createdUserIds.length) {
    await pool.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [createdUserIds]);
  }
}

async function createNotificationRecord(payload) {
  const result = await pool.query(
    `INSERT INTO notifications (
       type, title, message, entity_type, entity_id, recipient_user_id, recipient_role,
       is_global, is_read, created_by, metadata
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE, $9, $10::jsonb)
     RETURNING id`,
    [
      payload.type,
      payload.title,
      payload.message,
      payload.entityType || null,
      payload.entityId == null ? null : String(payload.entityId),
      payload.recipientUserId,
      payload.recipientRole || null,
      Boolean(payload.isGlobal),
      payload.createdBy || null,
      JSON.stringify(payload.metadata || {}),
    ]
  );

  const id = result.rows[0]?.id;
  if (id) {
    createdNotificationIds.push(id);
  }
  return id;
}

test.before(async () => {
  stableUsers = await getStableUsers();
  assert.ok(stableUsers.mainAdmin, "MAIN_ADMIN QA user is required");
  assert.ok(stableUsers.manager, "MANAGER QA user is required");
  assert.ok(stableUsers.l1, "L1 QA user is required");
  assert.ok(stableUsers.l2, "L2 QA user is required");
});

test.after(async () => {
  await cleanupArtifacts();
  await pool.end();
});

test("RBAC integration hardening", async (t) => {
  const mainAdminToken = buildToken(stableUsers.mainAdmin);
  const managerToken = buildToken(stableUsers.manager);

  await t.test("MAIN_ADMIN has full effective access", async () => {
    const { response, data } = await apiRequest("/api/auth/me", { token: mainAdminToken });
    assert.equal(response.status, 200);
    const permissions = data?.data?.effectivePermissions;
    assert.ok(permissions);
    for (const [permissionKey, value] of Object.entries(permissions)) {
      assert.equal(value, true, `${permissionKey} should be true for MAIN_ADMIN`);
    }

    const adminUsers = await apiRequest("/api/admin/users", { token: mainAdminToken });
    assert.equal(adminUsers.response.status, 200);
  });

  await t.test("MANAGER can manage only L1/L2", async () => {
    const tempL2Payload = {
      firstName: "Temp",
      lastName: "L2",
      username: `${TEMP_PREFIX}_manager_l2`,
      email: `${TEMP_PREFIX}_manager_l2@vespera.local`,
      password: TEMP_PASSWORD,
      role: "L2",
      isActive: true,
      permissions: {
        canViewDashboard: true,
        canViewLeads: true,
      },
    };

    const createL2 = await createManagedUser(managerToken, tempL2Payload);
    assert.equal(createL2.response.status, 201);

    const createAdmin = await createManagedUser(managerToken, {
      ...tempL2Payload,
      username: `${TEMP_PREFIX}_manager_admin`,
      email: `${TEMP_PREFIX}_manager_admin@vespera.local`,
      role: "MAIN_ADMIN",
    });
    assert.equal(createAdmin.response.status, 400);

    const updateMainAdmin = await apiRequest(`/api/admin/users/${stableUsers.mainAdmin.id}`, {
      method: "PUT",
      token: managerToken,
      body: {
        firstName: "Blocked",
        lastName: "Admin",
        username: stableUsers.mainAdmin.username,
        email: stableUsers.mainAdmin.email,
        role: "MAIN_ADMIN",
        isActive: true,
        permissions: {},
      },
    });
    assert.ok([400, 403].includes(updateMainAdmin.response.status));
  });

  await t.test("L1 dynamic permissions are honored", async () => {
    const createL1 = await createManagedUser(mainAdminToken, {
      firstName: "Temp",
      lastName: "L1",
      username: `${TEMP_PREFIX}_l1_dynamic`,
      email: `${TEMP_PREFIX}_l1_dynamic@vespera.local`,
      password: TEMP_PASSWORD,
      role: "L1",
      isActive: true,
      permissions: {
        canViewDashboard: true,
        canViewLeads: true,
        canViewLeadPhone: true,
        canCreateLead: true,
        canExportLeads: true,
      },
    });
    assert.equal(createL1.response.status, 201);

    const user = createL1.data.data;
    const token = buildToken({ id: user.id, email: user.email, role: user.role });

    const meResponse = await apiRequest("/api/auth/me", { token });
    assert.equal(meResponse.response.status, 200);
    assert.equal(meResponse.data.data.effectivePermissions.canExportLeads, true);
    assert.equal(meResponse.data.data.effectivePermissions.canManageUsers, false);

    const exportResponse = await apiRequest("/api/leads/export", { token });
    assert.equal(exportResponse.response.status, 200);
    assert.equal(exportResponse.data?.success, true);
  });

  await t.test("L1 export is blocked by default until canExportLeads is enabled", async () => {
    const createL1 = await createManagedUser(mainAdminToken, {
      firstName: "Temp",
      lastName: "L1 Default",
      username: `${TEMP_PREFIX}_l1_default_export`,
      email: `${TEMP_PREFIX}_l1_default_export@vespera.local`,
      password: TEMP_PASSWORD,
      role: "L1",
      isActive: true,
      permissions: {},
    });
    assert.equal(createL1.response.status, 201);

    const user = createL1.data.data;
    const token = buildToken({ id: user.id, email: user.email, role: user.role });
    const meResponse = await apiRequest("/api/auth/me", { token });

    assert.equal(meResponse.response.status, 200);
    assert.equal(meResponse.data.data.effectivePermissions.canExportLeads, false);

    const exportResponse = await apiRequest("/api/leads/export", { token });
    assert.equal(exportResponse.response.status, 403);
    assert.equal(exportResponse.data?.message, "You do not have permission to export leads.");
  });

  await t.test("Lead collection endpoint returns paginated contract with filters", async () => {
    const uniqueSuffix = Date.now();
    const searchMarker = `${TEMP_PREFIX}_page_${uniqueSuffix}`;
    await createLeadForExport(mainAdminToken, {
      fname: searchMarker,
      lname: "One",
      notes: "Pagination verification one",
    });
    await createLeadForExport(mainAdminToken, {
      fname: searchMarker,
      lname: "Two",
      notes: "Pagination verification two",
    });

    const pagedResponse = await apiRequest(
      `/api/leads?search=${encodeURIComponent(searchMarker)}&page=1&limit=1&sortBy=createdAt&sortOrder=desc`,
      { token: mainAdminToken }
    );

    assert.equal(pagedResponse.response.status, 200);
    assert.equal(Array.isArray(pagedResponse.data?.data), true);
    assert.equal(pagedResponse.data.data.length, 1);
    assert.equal(pagedResponse.data?.pagination?.page, 1);
    assert.equal(pagedResponse.data?.pagination?.limit, 1);
    assert.equal(pagedResponse.data?.pagination?.total, 2);
    assert.equal(pagedResponse.data?.pagination?.totalPages, 2);
    assert.equal(typeof pagedResponse.data?.pagination?.hasNextPage, "boolean");
    assert.equal(typeof pagedResponse.data?.pagination?.hasPrevPage, "boolean");
  });

  await t.test("L2 cannot receive phone numbers and export is blocked by default", async () => {
    const createL2 = await createManagedUser(mainAdminToken, {
      firstName: "Temp",
      lastName: "L2 Default",
      username: `${TEMP_PREFIX}_l2_default_export`,
      email: `${TEMP_PREFIX}_l2_default_export@vespera.local`,
      password: TEMP_PASSWORD,
      role: "L2",
      isActive: true,
      permissions: {},
    });
    assert.equal(createL2.response.status, 201);

    const user = createL2.data.data;
    const token = buildToken({ id: user.id, email: user.email, role: user.role });
    const meResponse = await apiRequest("/api/auth/me", { token });

    assert.equal(meResponse.response.status, 200);
    assert.equal(meResponse.data.data.effectivePermissions.canExportLeads, false);
    assert.equal(meResponse.data.data.effectivePermissions.canViewLeadPhone, false);

    const { leadId } = await createLeadForExport(mainAdminToken, {
      fname: "Phone",
      lname: "Restricted",
    });

    const l2LeadResponse = await apiRequest(`/api/leads/${leadId}`, { token });
    assert.equal(l2LeadResponse.response.status, 200);
    assert.equal(l2LeadResponse.data.data.mobile, undefined);
    assert.equal(l2LeadResponse.data.data.mobile_masked, "Restricted");
    assert.equal(l2LeadResponse.data.data.tel1, undefined);
    assert.equal(l2LeadResponse.data.data.tel2, undefined);

    const exportBlocked = await apiRequest("/api/leads/export", { token });
    assert.equal(exportBlocked.response.status, 403);
    assert.equal(exportBlocked.data?.message, "You do not have permission to export leads.");
  });

  await t.test("L2 export can be enabled without exposing phone fields", async () => {
    const createL2 = await createManagedUser(mainAdminToken, {
      firstName: "Temp",
      lastName: "L2 Export",
      username: `${TEMP_PREFIX}_l2_export_enabled`,
      email: `${TEMP_PREFIX}_l2_export_enabled@vespera.local`,
      password: TEMP_PASSWORD,
      role: "L2",
      isActive: true,
      permissions: {
        canViewDashboard: true,
        canViewLeads: true,
        canViewLists: true,
        canExportLeads: true,
        canViewLeadPhone: false,
      },
    });
    assert.equal(createL2.response.status, 201);

    const user = createL2.data.data;
    const token = buildToken({ id: user.id, email: user.email, role: user.role });
    const { leadId, payload } = await createLeadForExport(mainAdminToken, {
      fname: "Masked",
      lname: "Export",
      tel1: "9876500001",
      tel2: "9876500002",
    });

    const exportResponse = await apiRequest("/api/leads/export", { token });
    assert.equal(exportResponse.response.status, 200);

    const exportedLead = exportResponse.data?.data?.find((lead) => String(lead.id) === String(leadId));
    assert.ok(exportedLead, "Expected exported lead to be present in sanitized export response");
    assert.equal(exportedLead.mobile, undefined);
    assert.equal(exportedLead.tel1, undefined);
    assert.equal(exportedLead.tel2, undefined);
    assert.equal(exportedLead.mobile_masked, "Restricted");
    assert.notEqual(payload.mobile, exportedLead.mobile_masked);
  });

  await t.test("Self permission escalation is blocked", async () => {
    const createL1 = await createManagedUser(mainAdminToken, {
      firstName: "Temp",
      lastName: "Escalation",
      username: `${TEMP_PREFIX}_self_manage`,
      email: `${TEMP_PREFIX}_self_manage@vespera.local`,
      password: TEMP_PASSWORD,
      role: "L1",
      isActive: true,
      permissions: {
        canViewDashboard: true,
        canViewLeads: true,
        canManageUsers: true,
      },
    });
    assert.equal(createL1.response.status, 201);

    const user = createL1.data.data;
    const token = buildToken({ id: user.id, email: user.email, role: user.role });
    const escalateResponse = await apiRequest(`/api/admin/users/${user.id}`, {
      method: "PUT",
      token,
      body: {
        firstName: "Temp",
        lastName: "Escalation",
        username: user.username,
        email: user.email,
        role: "MAIN_ADMIN",
        isActive: true,
        permissions: {
          canManageUsers: true,
          canManageSettings: true,
          canExportLeads: true,
        },
      },
    });

    assert.ok([400, 403].includes(escalateResponse.response.status));
  });

  await t.test("Notifications are scoped per user and support read operations without leaking restricted fields", async () => {
    const mainAdminToken = buildToken(stableUsers.mainAdmin);
    const l2Token = buildToken(stableUsers.l2);

    const uniqueSuffix = Date.now();
    const createLeadResponse = await apiRequest("/api/leads", {
      method: "POST",
      token: mainAdminToken,
      body: {
        list_id: await getFirstListId(mainAdminToken),
        fname: `Notification ${uniqueSuffix}`,
        lname: "Lead",
        mobile: `97${String(uniqueSuffix).slice(-8)}`,
        email: `${TEMP_PREFIX}_notification_${uniqueSuffix}@vespera.local`,
      },
    });
    assert.equal(createLeadResponse.response.status, 201);
    createdLeadIds.push(createLeadResponse.data?.data?.id);

    const l2Notifications = await apiRequest("/api/notifications?page=1&limit=10", { token: l2Token });
    assert.equal(l2Notifications.response.status, 200);
    const createdNotification = l2Notifications.data?.data?.find((entry) => entry.type === "lead_created");
    assert.ok(createdNotification, "Expected a lead_created notification for L2");
    assert.equal(createdNotification.message.includes("97"), false);
    assert.equal(createdNotification.metadata?.leadPhone, undefined);

    const l2UnreadBefore = await apiRequest("/api/notifications/unread-count", { token: l2Token });
    assert.equal(l2UnreadBefore.response.status, 200);
    assert.ok(Number(l2UnreadBefore.data?.data?.unreadCount || 0) >= 1);

    const privateNotificationId = await createNotificationRecord({
      type: "access_update",
      title: "Access Updated",
      message: "Your account access changed.",
      recipientUserId: stableUsers.manager.id,
      recipientRole: "MANAGER",
      createdBy: stableUsers.mainAdmin.id,
      metadata: { visibility: "private" },
    });
    assert.ok(privateNotificationId);

    const forbiddenRead = await apiRequest(`/api/notifications/${privateNotificationId}/read`, {
      method: "PATCH",
      token: l2Token,
    });
    assert.equal(forbiddenRead.response.status, 404);

    const ownRead = await apiRequest(`/api/notifications/${createdNotification.id}/read`, {
      method: "PATCH",
      token: l2Token,
    });
    assert.equal(ownRead.response.status, 200);

    const l2UnreadAfter = await apiRequest("/api/notifications/unread-count", { token: l2Token });
    assert.equal(l2UnreadAfter.response.status, 200);
    assert.ok(Number(l2UnreadAfter.data?.data?.unreadCount || 0) >= 0);
  });
});
