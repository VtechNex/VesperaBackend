import pool from "../db/pool.js";

/**
 * CREATE LEAD
 */
export const createLead = async (req, res) => {
  try {
    const user_id = req.user.id;

    const {
      fname,
      lname,
      designation,
      organization,
      email,
      mobile,
      tel1,
      tel2,
      website,
      address,
      notes,
      list_id
    } = req.body;

    if (!fname || !mobile || !list_id) {
      return res.status(400).json({
        success: false,
        message: "First name, mobile, and list_id are required"
      });
    }

    const listCheck = await pool.query(
      `SELECT l.id
       FROM lists l
       INNER JOIN users u ON u.id = $2
       WHERE l.id = $1 AND (l.owner_id = $2 OR u.role = 'admin')`,
      [list_id, user_id]
    );

    if (listCheck.rowCount === 0) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to add leads to this list"
      });
    }

    const { productGroup, customerGroup, tags, dealSize, leadPotential, leadStage } = req.body;
    const { assigned_to, follow_up_date, repeat_follow_up, repeat_interval, follow_up_notes } = req.body;

    const result = await pool.query(
      `INSERT INTO leads (
        fname, lname, designation, organization, email, mobile,
        tel1, tel2, website, address, notes, list_id,
        product_group, customer_group, tags,
        deal_size, lead_potential, lead_stage,
        assigned_to, follow_up_date, repeat_follow_up,
        repeat_interval, follow_up_notes
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
        $13,$14,$15,
        $16,$17,$18,
        $19,$20,$21,$22,$23
      )
      RETURNING *`,
      [
        fname,
        lname || null,
        designation || null,
        organization || null,
        email || null,
        mobile,
        tel1 || null,
        tel2 || null,
        website || null,
        address || null,
        notes || null,
        list_id,

        productGroup || null,
        customerGroup || null,
        Array.isArray(tags) ? tags : null,

        dealSize || null,
        leadPotential || null,
        leadStage || null,

        assigned_to || null,
        follow_up_date || null,
        repeat_follow_up || false,
        repeat_interval || null,
        follow_up_notes || null
      ]
    );

    res.status(201).json({ success: true, data: result.rows[0] });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Lead creation failed" });
  }
};

/**
 * GET LEADS BY LIST ID
 */
export const getLeadsByListId = async (req, res) => {
  try {
    const user_id = req.user.id;
    const { list_id } = req.params;

    const listCheck = await pool.query(
      `SELECT l.id
       FROM lists l
       INNER JOIN users u ON u.id = $2
       WHERE l.id = $1 AND (l.owner_id = $2 OR u.role = 'admin')`,
      [list_id, user_id]
    );

    if (listCheck.rowCount === 0) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to view leads from this list"
      });
    }

    const result = await pool.query(
      `SELECT *
       FROM leads
       WHERE list_id = $1
       ORDER BY created_at DESC`,
      [list_id]
    );

    res.json({ success: true, data: result.rows });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to fetch leads" });
  }
};

/**
 * ✅ GET ALL LEADS (ADMIN FIX)
 */
export const getAllLeads = async (req, res) => {
  try {
    const user_id = req.user.id;
    const role = req.user.role;

    let query;
    let params = [];

    if (role === "admin") {
      query = `
        SELECT ld.*, l.name AS list_name
        FROM leads ld
        INNER JOIN lists l ON ld.list_id = l.id
        ORDER BY ld.created_at DESC
      `;
    } else {
      query = `
        SELECT ld.*, l.name AS list_name
        FROM leads ld
        INNER JOIN lists l ON ld.list_id = l.id
        WHERE l.owner_id = $1
        ORDER BY ld.created_at DESC
      `;
      params = [user_id];
    }

    const result = await pool.query(query, params);

    res.json({ success: true, data: result.rows });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to fetch leads" });
  }
};

/**
 * GET LEAD BY ID
 */
export const getLeadById = async (req, res) => {
  try {
    const user_id = req.user.id;
    const role = req.user.role;
    const { id } = req.params;

    let query;
    let params;

    if (role === "admin") {
      query = `
        SELECT ld.*, l.name AS list_name
        FROM leads ld
        INNER JOIN lists l ON ld.list_id = l.id
        WHERE ld.id = $1
      `;
      params = [id];
    } else {
      query = `
        SELECT ld.*, l.name AS list_name
        FROM leads ld
        INNER JOIN lists l ON ld.list_id = l.id
        WHERE ld.id = $1 AND l.owner_id = $2
      `;
      params = [id, user_id];
    }

    const result = await pool.query(query, params);

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: "Lead not found" });
    }

    res.json({ success: true, data: result.rows[0] });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to fetch lead" });
  }
};

/**
 * UPDATE LEAD
 */
export const updateLead = async (req, res) => {
  try {
    const user_id = req.user.id;
    const { id } = req.params;

    const ownershipCheck = await pool.query(
      `SELECT ld.id
       FROM leads ld
       INNER JOIN lists l ON ld.list_id = l.id
       INNER JOIN users u ON u.id = $2
       WHERE ld.id = $1 AND (l.owner_id = $2 OR u.role = 'admin')`,
      [id, user_id]
    );

    if (ownershipCheck.rowCount === 0) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to update this lead"
      });
    }

    const result = await pool.query(
      `UPDATE leads SET
        fname = COALESCE($1, fname),
        lname = COALESCE($2, lname),
        designation = COALESCE($3, designation),
        organization = COALESCE($4, organization),
        email = COALESCE($5, email),
        mobile = COALESCE($6, mobile),
        tel1 = COALESCE($7, tel1),
        tel2 = COALESCE($8, tel2),
        website = COALESCE($9, website),
        address = COALESCE($10, address),
        notes = COALESCE($11, notes),
        deal_size = COALESCE($12, deal_size),
        lead_potential = COALESCE($13, lead_potential),
        lead_stage = COALESCE($14, lead_stage),
        product_group = COALESCE($15, product_group),
        customer_group = COALESCE($16, customer_group),
        tags = COALESCE($17, tags),
        assigned_to = COALESCE($18, assigned_to),
        follow_up_date = COALESCE($19, follow_up_date),
        repeat_follow_up = COALESCE($20, repeat_follow_up),
        repeat_interval = COALESCE($21, repeat_interval),
        follow_up_notes = COALESCE($22, follow_up_notes),
        updated_at = NOW()
       WHERE id = $23
       RETURNING *`,
      [
        req.body.fname || null,
        req.body.lname || null,
        req.body.designation || null,
        req.body.organization || null,
        req.body.email || null,
        req.body.mobile || null,
        req.body.tel1 || null,
        req.body.tel2 || null,
        req.body.website || null,
        req.body.address || null,
        req.body.notes || null,
        req.body.dealSize || null,
        req.body.leadPotential || null,
        req.body.leadStage || null,
        req.body.productGroup || null,
        req.body.customerGroup || null,
        req.body.tags && req.body.tags.length ? req.body.tags : null,
        assigned_to || null,
        follow_up_date || null,
        repeat_follow_up || false,
        repeat_interval || null,
        follow_up_notes || null,
        id
      ]
    );

    res.json({ success: true, data: result.rows[0] });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Lead update failed" });
  }
};

/**
 * DELETE LEAD
 */
export const deleteLead = async (req, res) => {
  try {
    const user_id = req.user.id;
    const { id } = req.params;

    const ownershipCheck = await pool.query(
      `SELECT ld.id
       FROM leads ld
       INNER JOIN lists l ON ld.list_id = l.id
       INNER JOIN users u ON u.id = $2
       WHERE ld.id = $1 AND (l.owner_id = $2 OR u.role = 'admin')`,
      [id, user_id]
    );

    if (ownershipCheck.rowCount === 0) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to delete this lead"
      });
    }

    await pool.query(`DELETE FROM leads WHERE id = $1`, [id]);

    res.json({ success: true, message: "Lead deleted successfully" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Lead deletion failed" });
  }
};

/**
 * 🔍 SEARCH LEADS (RESTORED EXPORT)
 */
export const searchLeads = async (req, res) => {
  try {
    const user_id = req.user.id;
    const role = req.user.role;
    const { query } = req.body;

    if (!query || query.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: "Query must be at least 2 characters"
      });
    }

    const searchTerm = `%${query}%`;

    let sql;
    let params;

    if (role === "admin") {
      sql = `
        SELECT ld.*, l.name AS list_name
        FROM leads ld
        INNER JOIN lists l ON ld.list_id = l.id
        WHERE ld.fname ILIKE $1
           OR ld.lname ILIKE $1
           OR ld.email ILIKE $1
           OR ld.mobile ILIKE $1
           OR ld.organization ILIKE $1
        ORDER BY ld.created_at DESC
        LIMIT 100
      `;
      params = [searchTerm];
    } else {
      sql = `
        SELECT ld.*, l.name AS list_name
        FROM leads ld
        INNER JOIN lists l ON ld.list_id = l.id
        WHERE l.owner_id = $1 AND (
          ld.fname ILIKE $2 OR
          ld.lname ILIKE $2 OR
          ld.email ILIKE $2 OR
          ld.mobile ILIKE $2 OR
          ld.organization ILIKE $2
        )
        ORDER BY ld.created_at DESC
        LIMIT 100
      `;
      params = [user_id, searchTerm];
    }

    const result = await pool.query(sql, params);

    res.json({ success: true, data: result.rows });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Lead search failed" });
  }
};
