import pool from "../db/pool.js";

const VALID_TYPES = ["product", "customer", "tag"];

/**
 * Bulk create qualifiers from an array of names for a given type.
 * Uses ON CONFLICT DO NOTHING so existing (type,name) combos are ignored.
 */
export const createQualifiersBulk = async (names = [], type) => {
  if (!Array.isArray(names) || names.length === 0) return [];
  if (!VALID_TYPES.includes(type)) throw new Error("Invalid qualifier type");

  const query = `INSERT INTO qualifiers (name, type)
                 SELECT unnest($1::text[]), $2
                 ON CONFLICT (type, name) DO NOTHING
                 RETURNING id, name, type, created_at`;

  const result = await pool.query(query, [names, type]);
  return result.rows;
};

export const createQualifier = async (req, res) => {
  try {
    const { name, type } = req.body;
    if (!name || !type) {
      return res.status(400).json({ success: false, message: "Name and type are required" });
    }
    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({ success: false, message: "Invalid qualifier type" });
    }

    // Handle comma-separated names
    const names = String(name)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (names.length === 0) {
      return res.status(400).json({ success: false, message: "No valid names provided" });
    }

    const inserted = await createQualifiersBulk(names, type);

    res.status(201).json({ success: true, data: inserted });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Qualifier creation failed" });
  }
};

export const getAllQualifiers = async (req, res) => {
  try {
    const { type } = req.query;
    let query = `SELECT id, name, type, created_at FROM qualifiers`;
    const params = [];
    if (type) {
      if (!VALID_TYPES.includes(type)) {
        return res.status(400).json({ success: false, message: "Invalid type filter" });
      }
      query += ` WHERE type = $1`;
      params.push(type);
    }
    query += ` ORDER BY created_at DESC`;

    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to fetch qualifiers" });
  }
};

export const getQualifierById = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT id, name, type, created_at FROM qualifiers WHERE id = $1`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: "Qualifier not found" });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to fetch qualifier" });
  }
};

export const updateQualifier = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, type } = req.body;

    if (type && !VALID_TYPES.includes(type)) {
      return res.status(400).json({ success: false, message: "Invalid qualifier type" });
    }

    const result = await pool.query(
      `UPDATE qualifiers
       SET name = COALESCE($1, name), type = COALESCE($2, type)
       WHERE id = $3
       RETURNING id, name, type, created_at`,
      [name || null, type || null, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: "Qualifier not found" });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Qualifier update failed" });
  }
};

export const deleteQualifier = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`DELETE FROM qualifiers WHERE id = $1`, [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: "Qualifier not found" });
    }

    res.json({ success: true, message: "Qualifier deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Qualifier deletion failed" });
  }
};
