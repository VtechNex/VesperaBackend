import pool from "../db/pool.js";

/**
 * CREATE LIST
 */
export const createList = async (req, res) => {
  try {
    const { name, description, list_owner } = req.body;
    const creator_id = req.user.id; // From auth middleware

    if (!name || !list_owner) {
      return res.status(400).json({ success: false, message: "List name and owner are required" });
    }

    // Find user by username to get owner_id
    const userResult = await pool.query(
      `SELECT id FROM users WHERE username = $1`,
      [list_owner]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "List owner user not found" });
    }

    const owner_id = userResult.rows[0].id;

    const result = await pool.query(
      `INSERT INTO lists (name, owner_id, description)
       VALUES ($1, $2, $3)
       RETURNING id, name, owner_id, description, created_at`,
      [name, owner_id, description || null]
    );

    res.status(201).json({
      success: true,
      data: result.rows[0]
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "List creation failed" });
  }
};

/**
 * GET ALL LISTS (for current user or owner)
 */
export const getAllLists = async (req, res) => {
  try {
    const owner_id = req.user.id;

    const result = await pool.query(
      `SELECT id, name, owner_id, subject, description, created_at
       FROM lists
       WHERE owner_id = $1
       ORDER BY created_at DESC`,
      [owner_id]
    );

    res.json({
      success: true,
      data: result.rows
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to fetch lists" });
  }
};

/**
 * GET LIST BY ID
 */
export const getListById = async (req, res) => {
  try {
    const { id } = req.params;
    const owner_id = req.user.id;

    const result = await pool.query(
      `SELECT id, name, owner_id, subject, description, created_at
       FROM lists
       WHERE id = $1 AND owner_id = $2`,
      [id, owner_id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: "List not found" });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to fetch list" });
  }
};

/**
 * UPDATE LIST
 */
export const updateList = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, subject, description } = req.body;
    const owner_id = req.user.id;

    const result = await pool.query(
      `UPDATE lists
       SET name = COALESCE($1, name),
           subject = COALESCE($2, subject),
           description = COALESCE($3, description)
       WHERE id = $4 AND owner_id = $5
       RETURNING id, name, owner_id, subject, description, created_at`,
      [name || null, subject || null, description || null, id, owner_id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: "List not found" });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "List update failed" });
  }
};

/**
 * DELETE LIST
 */
export const deleteList = async (req, res) => {
  try {
    const { id } = req.params;
    const owner_id = req.user.id;

    const result = await pool.query(
      `DELETE FROM lists
       WHERE id = $1 AND owner_id = $2`,
      [id, owner_id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: "List not found" });
    }

    res.json({
      success: true,
      message: "List deleted successfully"
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "List deletion failed" });
  }
};

/**
 * GET LIST WITH LEADS COUNT
 */
export const getListsWithLeadsCount = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        l.id,
        l.name,
        u.username as list_owner,
        l.description,
        l.created_at,
        COUNT(ld.id) as total_leads
       FROM lists l
       LEFT JOIN leads ld ON l.id = ld.list_id
       LEFT JOIN users u ON l.owner_id = u.id
       GROUP BY l.id, l.name, u.username, l.description, l.created_at
       ORDER BY l.created_at DESC`
    );

    res.json({
      success: true,
      data: result.rows
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to fetch lists with counts" });
  }
};
