import pool from "../db/pool.js";
import { processDueFollowUps } from "../services/followupService.js";
import {
  hasPermissionForRole,
  sanitizeLeadCollectionForUser,
  sanitizeLeadForUser,
} from "../middleware/security.js";
import {
  badRequest,
  cleanOptionalString,
  isValidEmail,
  normalizeEmail,
  normalizePhone,
  parseInteger,
  parseNumber,
} from "../utils/validation.js";

function buildFollowUpTimestamp(date, time) {
  if (!date) return null;
  return `${date}T${time || "00:00"}`;
}

function parseLeadPayload(body = {}) {
  const email = normalizeEmail(body.email);
  const mobile = normalizePhone(body.mobile);

  return {
    fname: cleanOptionalString(body.fname),
    lname: cleanOptionalString(body.lname),
    designation: cleanOptionalString(body.designation),
    organization: cleanOptionalString(body.organization),
    email,
    mobile,
    tel1: normalizePhone(body.tel1),
    tel2: normalizePhone(body.tel2),
    website: cleanOptionalString(body.website),
    address: cleanOptionalString(body.address),
    notes: cleanOptionalString(body.notes),
    list_id: parseInteger(body.list_id),
    productGroup: cleanOptionalString(body.productGroup ?? body.product_group),
    customerGroup: cleanOptionalString(body.customerGroup ?? body.customer_group),
    tags: Array.isArray(body.tags) ? body.tags.filter(Boolean) : [],
    dealSize: parseNumber(body.dealSize ?? body.deal_size),
    leadPotential: cleanOptionalString(body.leadPotential ?? body.lead_potential),
    leadStage: cleanOptionalString(body.leadStage ?? body.lead_stage),
    assignedTo: cleanOptionalString(body.assignedTo ?? body.assigned_to),
    followUpDate: buildFollowUpTimestamp(
      body.followUpDate ?? body.follow_up_date,
      body.followUpTime ?? body.follow_up_time
    ),
    repeatFollowUp: Boolean(body.repeatFollowUp ?? body.repeat_follow_up),
    repeatInterval: cleanOptionalString(body.repeatInterval ?? body.repeat_interval),
    followUpNotes: cleanOptionalString(body.followUpNotes ?? body.follow_up_notes),
    doNotFollowUp: Boolean(body.doNotFollowUp ?? body.do_not_follow_up),
    doNotFollowUpReason: cleanOptionalString(body.doNotFollowUpReason ?? body.do_not_follow_up_reason),
    customFieldsData:
      body.customFieldsData && typeof body.customFieldsData === "object" ? body.customFieldsData : {},
  };
}

export const createLead = async (req, res) => {
  try {
    const user_id = req.user.id;
    const user_role = req.user.role;
    const payload = parseLeadPayload(req.body);

    if (!hasPermissionForRole(user_role, "canCreateLead")) {
      return res.status(403).json({ success: false, message: "You do not have permission to create leads." });
    }

    if (!payload.fname || !payload.mobile || !payload.list_id) {
      return badRequest(res, "First name, mobile, and list are required");
    }
    if (payload.email && !isValidEmail(payload.email)) {
      return badRequest(res, "A valid email address is required");
    }

    const listCheck = await pool.query(`SELECT id FROM lists WHERE id = $1`, [payload.list_id]);

    if (listCheck.rowCount === 0) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to add leads to this list",
      });
    }

    const duplicateCheck = await pool.query(
      `SELECT id
       FROM leads
       WHERE list_id = $1
         AND (($2::text IS NOT NULL AND mobile = $2) OR ($3::text IS NOT NULL AND email = $3))
       LIMIT 1`,
      [payload.list_id, payload.mobile, payload.email]
    );

    if (duplicateCheck.rowCount > 0) {
      return res.status(409).json({
        success: false,
        message: "A lead with this mobile or email already exists in the selected list",
      });
    }

    const result = await pool.query(
      `INSERT INTO leads (
        fname, lname, designation, organization, email, mobile,
        tel1, tel2, website, address, notes, list_id,
        product_group, customer_group, tags,
        deal_size, lead_potential, lead_stage,
        assigned_to, follow_up_date, repeat_follow_up,
        repeat_interval, follow_up_notes, do_not_follow_up,
        do_not_follow_up_reason, custom_fields_data,
        created_by, created_by_role, updated_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
        $13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,NOW()
      )
      RETURNING *`,
      [
        payload.fname,
        payload.lname,
        payload.designation,
        payload.organization,
        payload.email,
        payload.mobile,
        payload.tel1,
        payload.tel2,
        payload.website,
        payload.address,
        payload.notes,
        payload.list_id,
        payload.productGroup,
        payload.customerGroup,
        payload.tags.length ? payload.tags : null,
        payload.dealSize,
        payload.leadPotential,
        payload.leadStage,
        payload.assignedTo,
        payload.followUpDate,
        payload.repeatFollowUp,
        payload.repeatInterval,
        payload.followUpNotes,
        payload.doNotFollowUp,
        payload.doNotFollowUpReason,
        payload.customFieldsData,
        user_id,
        user_role,
      ]
    );

    res.status(201).json({ success: true, data: sanitizeLeadForUser(result.rows[0], req.user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Lead creation failed" });
  }
};

export const getLeadsByListId = async (req, res) => {
  try {
    const { list_id } = req.params;

    if (!hasPermissionForRole(req.user?.role, "canViewLeads")) {
      return res.status(403).json({ success: false, message: "You do not have permission to view leads." });
    }

    const listCheck = await pool.query(`SELECT id FROM lists WHERE id = $1`, [list_id]);

    if (listCheck.rowCount === 0) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to view leads from this list",
      });
    }

    const result = await pool.query(
      `SELECT *
       FROM leads
       WHERE list_id = $1
       ORDER BY created_at DESC`,
      [list_id]
    );

    res.json({ success: true, data: sanitizeLeadCollectionForUser(result.rows, req.user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to fetch leads" });
  }
};

export const getAllLeads = async (req, res) => {
  try {
    if (!hasPermissionForRole(req.user?.role, "canViewLeads")) {
      return res.status(403).json({ success: false, message: "You do not have permission to view leads." });
    }

    const result = await pool.query(
      `SELECT ld.*, l.name AS list_name
       FROM leads ld
       INNER JOIN lists l ON ld.list_id = l.id
       ORDER BY ld.created_at DESC`
    );

    res.json({ success: true, data: sanitizeLeadCollectionForUser(result.rows, req.user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to fetch leads" });
  }
};

export const getLeadById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!hasPermissionForRole(req.user?.role, "canViewLeads")) {
      return res.status(403).json({ success: false, message: "You do not have permission to view lead details." });
    }

    const result = await pool.query(
      `SELECT ld.*, l.name AS list_name,
              u.username AS assignee_name, u.email AS assignee_email,
              owner.username AS list_owner_name, owner.email AS list_owner_email
       FROM leads ld
       INNER JOIN lists l ON ld.list_id = l.id
       LEFT JOIN users u ON ld.assigned_to = u.id
       LEFT JOIN users owner ON l.owner_id = owner.id
       WHERE ld.id = $1`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: "Lead not found" });
    }

    res.json({ success: true, data: sanitizeLeadForUser(result.rows[0], req.user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to fetch lead" });
  }
};

export const updateLead = async (req, res) => {
  try {
    const user_role = req.user.role;
    const { id } = req.params;
    const payload = parseLeadPayload(req.body);

    if (!hasPermissionForRole(user_role, "canEditLead")) {
      return res.status(403).json({ success: false, message: "You do not have permission to update leads." });
    }

    if (!payload.fname || !payload.mobile) {
      return badRequest(res, "First name and mobile are required");
    }
    if (payload.email && !isValidEmail(payload.email)) {
      return badRequest(res, "A valid email address is required");
    }

    const result = await pool.query(
      `UPDATE leads SET
        fname = $1,
        lname = $2,
        designation = $3,
        organization = $4,
        email = $5,
        mobile = $6,
        tel1 = $7,
        tel2 = $8,
        website = $9,
        address = $10,
        notes = $11,
        deal_size = $12,
        lead_potential = $13,
        lead_stage = $14,
        product_group = $15,
        customer_group = $16,
        tags = $17,
        assigned_to = $18,
        follow_up_date = $19,
        repeat_follow_up = $20,
        repeat_interval = $21,
        follow_up_notes = $22,
        do_not_follow_up = $23,
        do_not_follow_up_reason = $24,
        custom_fields_data = $25::jsonb,
        updated_at = NOW()
       WHERE id = $26
       RETURNING *`,
      [
        payload.fname,
        payload.lname,
        payload.designation,
        payload.organization,
        payload.email,
        payload.mobile,
        payload.tel1,
        payload.tel2,
        payload.website,
        payload.address,
        payload.notes,
        payload.dealSize,
        payload.leadPotential,
        payload.leadStage,
        payload.productGroup,
        payload.customerGroup,
        payload.tags.length ? payload.tags : [],
        payload.assignedTo,
        payload.followUpDate,
        payload.repeatFollowUp,
        payload.repeatInterval,
        payload.followUpNotes,
        payload.doNotFollowUp,
        payload.doNotFollowUpReason,
        payload.customFieldsData,
        id,
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: "Lead not found" });
    }

    res.json({ success: true, data: sanitizeLeadForUser(result.rows[0], req.user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Lead update failed" });
  }
};

export const deleteLead = async (req, res) => {
  try {
    const { id } = req.params;

    if (!hasPermissionForRole(req.user?.role, "canDeleteLead")) {
      return res.status(403).json({ success: false, message: "You do not have permission to delete leads." });
    }

    const ownershipCheck = await pool.query(`SELECT id FROM leads WHERE id = $1`, [id]);

    if (ownershipCheck.rowCount === 0) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to delete this lead",
      });
    }

    await pool.query(`DELETE FROM leads WHERE id = $1`, [id]);
    res.json({ success: true, message: "Lead deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Lead deletion failed" });
  }
};

export const searchLeads = async (req, res) => {
  try {
    const role = req.user.role;
    const { query } = req.body;

    if (!hasPermissionForRole(role, "canViewLeads")) {
      return res.status(403).json({ success: false, message: "You do not have permission to search leads." });
    }

    if (!query || query.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: "Query must be at least 2 characters",
      });
    }

    const searchTerm = `%${query}%`;

    const result = await pool.query(
      `SELECT ld.*, l.name AS list_name
       FROM leads ld
       INNER JOIN lists l ON ld.list_id = l.id
       WHERE ld.fname ILIKE $1
          OR ld.lname ILIKE $1
          OR ld.email ILIKE $1
          OR ld.mobile ILIKE $1
          OR ld.organization ILIKE $1
       ORDER BY ld.created_at DESC
       LIMIT 100`,
      [searchTerm]
    );
    res.json({ success: true, data: sanitizeLeadCollectionForUser(result.rows, req.user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Lead search failed" });
  }
};

export const triggerFollowUps = async (req, res) => {
  try {
    if (!hasPermissionForRole(req.user?.role, "canManageUsers")) {
      return res.status(403).json({ success: false, message: "You do not have permission to trigger follow-ups." });
    }
    await processDueFollowUps();
    res.json({ success: true, message: "Follow-up processing triggered" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to process follow-ups" });
  }
};
