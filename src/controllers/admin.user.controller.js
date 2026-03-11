import pool from "../db/pool.js";
import bcrypt from "bcrypt";

/**
 * CREATE USER
 */
export const createUser = async (req, res) => {
  try {
    const { username, email, password, role } = req.body;

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (username, email, password, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, username, email, role, is_active, created_at`,
      [username, email, hashedPassword, role]
    );

    res.status(201).json({
      success: true,
      data: result.rows[0]
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
    const { username, email, role, is_active } = req.body;

    const result = await pool.query(
      `UPDATE users
       SET username = $1,
           email = $2,
           role = $3,
           is_active = $4,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5
       RETURNING id, username, email, role, is_active`,
      [username, email, role, is_active, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.json({ success: true, data: result.rows[0] });

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
       FROM users
       WHERE id = $1`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.json({ success: true, data: result.rows[0] });

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
       FROM users
       ORDER BY created_at DESC`
    );

    res.json({ success: true, data: result.rows });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to fetch users" });
  }
};
