import pool from "../db/pool.js";
import bcrypt from "bcrypt";
import { normalizeUserRole, ROLES } from "../middleware/security.js";

function sanitizeManagedUser(row) {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    role: normalizeUserRole(row.role),
    is_active: row.is_active,
    created_at: row.created_at,
    name: [row.first_name, row.last_name].filter(Boolean).join(" ").trim() || row.username,
    first_name: row.first_name || "",
    last_name: row.last_name || "",
  };
}

/**
 * CREATE USER
 */
export const createUser = async (req, res) => {
  try {
    const { username, email, password, role, firstName, lastName, isActive } = req.body;
    const normalizedRole = normalizeUserRole(role || ROLES.L2);

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (username, email, password, role, first_name, last_name, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, username, email, role, is_active, created_at, first_name, last_name`,
      [username, email, hashedPassword, normalizedRole, firstName || null, lastName || null, isActive !== false]
    );

    res.status(201).json({
      success: true,
      data: sanitizeManagedUser(result.rows[0])
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "User creation failed" });
  }
};

/**
 * UPDATE USER
 */
export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { username, email, role, is_active, firstName, lastName } = req.body;
    const normalizedRole = normalizeUserRole(role || ROLES.L2);

    const result = await pool.query(
      `UPDATE users
       SET username = $1,
           email = $2,
           role = $3,
           is_active = COALESCE($4, is_active),
           first_name = COALESCE($5, first_name),
           last_name = COALESCE($6, last_name),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7
       RETURNING id, username, email, role, is_active, created_at, first_name, last_name`,
      [username, email, normalizedRole, is_active, firstName || null, lastName || null, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.json({ success: true, data: sanitizeManagedUser(result.rows[0]) });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "User update failed" });
  }
};

/**
 * DE-ACTIVATE USER
 */
export const deactiveUser = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE users SET is_active = false WHERE id = $1`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.json({ success: true, message: "User deactivated successfully" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "User deactivation failed" });
  }
};

/**
 * DELETE USER (HARD DELETE)
 */
export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `DELETE FROM users WHERE id = $1`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.json({ success: true, message: "User deleted successfully" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "User deletion failed" });
  }
};

/**
 * GET ONE USER
 */
export const getUserById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT id, username, email, role, is_active, created_at
             , first_name, last_name
       FROM users
       WHERE id = $1`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.json({ success: true, data: sanitizeManagedUser(result.rows[0]) });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to fetch user" });
  }
};

/**
 * GET ALL USERS
 */
export const getAllUsers = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, username, email, role, is_active, created_at
             , first_name, last_name
       FROM users
       ORDER BY created_at DESC`
    );

    res.json({ success: true, data: result.rows.map(sanitizeManagedUser) });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to fetch users" });
  }
};
