import pool from "../db/pool.js";
import { hasPermissionForRole } from "../middleware/security.js";
import { badRequest, cleanOptionalLimitedString, cleanRequiredString, validateListPayload } from "../utils/validation.js";

/**
 * CREATE LIST
 */
export const createList = async (req, res) => {
  try {
    if (!hasPermissionForRole(req.user?.role, "canCreateList")) {
      return res.status(403).json({ success: false, message: "You do not have permission to create lists." });
    }

    const payload = validateListPayload(req.body, { requireOwner: true });

    // Find user by username to get owner_id
    const userResult = await pool.query(
      `SELECT id FROM users WHERE username = $1`,
      [payload.list_owner]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "List owner user not found" });
    }

    const owner_id = userResult.rows[0].id;

    const result = await pool.query(
      `INSERT INTO lists (name, owner_id, description)
       VALUES ($1, $2, $3)
       RETURNING id, name, owner_id, description, created_at`,
      [payload.name, owner_id, payload.description]
    );

    res.status(201).json({
      success: true,
      data: result.rows[0]
    });

  } catch (err) {
    console.error(err);
    if (err instanceof Error) {
      return badRequest(res, err.message);
    }
    res.status(500).json({ success: false, message: "List creation failed" });
  }
};

/**
 * GET ALL LISTS (for current user or owner)
 */
export const getAllLists = async (req, res) => {
  try {
    if (!hasPermissionForRole(req.user?.role, "canViewLists")) {
      return res.status(403).json({ success: false, message: "You do not have permission to view lists." });
    }

    const result = await pool.query(
      `SELECT id, name, owner_id, subject, description, created_at
       FROM lists
       ORDER BY created_at DESC`
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
    if (!hasPermissionForRole(req.user?.role, "canViewLists")) {
      return res.status(403).json({ success: false, message: "You do not have permission to view lists." });
    }

    const { id } = req.params;

    const result = await pool.query(
      `SELECT id, name, owner_id, subject, description, created_at
       FROM lists
       WHERE id = $1`,
      [id]
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
    if (!hasPermissionForRole(req.user?.role, "canEditList")) {
      return res.status(403).json({ success: false, message: "You do not have permission to update lists." });
    }

    const { id } = req.params;
    const payload = {
      name: req.body.name === undefined ? null : cleanRequiredString(req.body.name, "List name", 150),
      subject: req.body.subject === undefined ? null : cleanOptionalLimitedString(req.body.subject, 150),
      description: req.body.description === undefined ? null : cleanOptionalLimitedString(req.body.description, 1000),
    };

    const result = await pool.query(
      `UPDATE lists
       SET name = COALESCE($1, name),
           subject = COALESCE($2, subject),
           description = COALESCE($3, description)
       WHERE id = $4
       RETURNING id, name, owner_id, subject, description, created_at`,
      [
        req.body.name === undefined ? null : payload.name,
        req.body.subject === undefined ? null : payload.subject,
        req.body.description === undefined ? null : payload.description,
        id,
      ]
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
    if (err instanceof Error) {
      return badRequest(res, err.message);
    }
    res.status(500).json({ success: false, message: "List update failed" });
  }
};

/**
 * DELETE LIST
 */
export const deleteList = async (req, res) => {
  try {
    if (!hasPermissionForRole(req.user?.role, "canDeleteList")) {
      return res.status(403).json({ success: false, message: "You do not have permission to delete lists." });
    }

    const { id } = req.params;

    const listResult = await pool.query(
      `SELECT l.id, l.name, COUNT(ld.id)::int AS lead_count
       FROM lists l
       LEFT JOIN leads ld ON ld.list_id = l.id
       WHERE l.id = $1
       GROUP BY l.id, l.name`,
      [id]
    );

    if (listResult.rowCount === 0) {
      return res.status(404).json({ success: false, message: "List not found" });
    }

    const targetList = listResult.rows[0];
    if (Number(targetList.lead_count) > 0) {
      return res.status(409).json({
        success: false,
        message: `This list contains ${targetList.lead_count} lead${targetList.lead_count === 1 ? "" : "s"}. Please move or remove those leads before deleting this list.`,
        leadCount: Number(targetList.lead_count),
      });
    }

    const result = await pool.query(
      `DELETE FROM lists
       WHERE id = $1`,
      [id]
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
    if (!hasPermissionForRole(req.user?.role, "canViewLists")) {
      return res.status(403).json({ success: false, message: "You do not have permission to view lists." });
    }

    const result = await pool.query(
      `SELECT 
        l.id,
        l.name,
        l.owner_id,
        u.username as list_owner,
        l.description,
        l.created_at,
        COUNT(ld.id)::int as total_leads
       FROM lists l
       LEFT JOIN leads ld ON l.id = ld.list_id
       LEFT JOIN users u ON l.owner_id = u.id
       GROUP BY l.id, l.name, l.owner_id, u.username, l.description, l.created_at
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
