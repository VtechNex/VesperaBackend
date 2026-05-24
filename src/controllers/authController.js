import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import pool from "../db/pool.js";
import { badRequest, isStrongPassword, normalizeEmail } from "../utils/validation.js";
import { normalizeUserRole, ROLES } from "../middleware/security.js";

export async function login(req, res) {
  try {
    const JWT_SECRET = process.env.JWT_SECRET;
    const email = normalizeEmail(req.body.email);
    const { password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const { rows } = await pool.query(
      "SELECT id, email, password, role, username, is_active, first_name, last_name FROM users WHERE email = $1 LIMIT 1",
      [email]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const user = rows[0];
    if (user.is_active === false) {
      return res.status(403).json({ error: "Your account is inactive" });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: normalizeUserRole(user.role),
      },
      JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: normalizeUserRole(user.role),
        username: user.username,
        name: [user.first_name, user.last_name].filter(Boolean).join(" ").trim() || user.username,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function register(req, res) {
  try {
    const { username, password } = req.body;
    const email = normalizeEmail(req.body.email);

    if (!username || !email || !password) {
      return badRequest(res, "Username, email and password are required");
    }

    if (!isStrongPassword(password)) {
      return badRequest(
        res,
        "Password must be at least 8 characters and include upper, lower, number, and special character"
      );
    }

    const existingCount = await pool.query(`SELECT COUNT(*)::int AS total FROM users`);
    if (Number(existingCount.rows?.[0]?.total || 0) > 0) {
      return res.status(403).json({
        error: "Registration is disabled. Ask a MAIN_ADMIN to create your account.",
      });
    }

    const existingUser = await pool.query(
      `SELECT id FROM users WHERE email = $1 OR username = $2 LIMIT 1`,
      [email, username]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        error: "Username or email already exists",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const { rows } = await pool.query(
      `INSERT INTO users (username, email, password, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, username, email, role`,
      [username, email, hashedPassword, ROLES.MAIN_ADMIN]
    );

    res.status(201).json({
      message: "Admin registered successfully",
      user: rows[0],
    });
  } catch (err) {
    console.error("Register error:", err);

    if (err.code === "23505") {
      return res.status(409).json({
        error: "Username or email already exists",
      });
    }

    res.status(500).json({ error: "Internal server error" });
  }
}
