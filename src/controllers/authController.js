import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import pool from "../db/pool.js";
import { badRequest, cleanRequiredString, isStrongPassword, isValidEmail, normalizeEmail } from "../utils/validation.js";
import { getEffectivePermissions, isUnknownRole, sanitizePermissionOverrides, normalizeUserRole, ROLES } from "../middleware/security.js";

export async function login(req, res) {
  try {
    const JWT_SECRET = process.env.JWT_SECRET;
    const email = normalizeEmail(req.body.email);
    const { password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const { rows } = await pool.query(
      "SELECT id, email, password, role, username, is_active, first_name, last_name, permissions FROM users WHERE email = $1 LIMIT 1",
      [email]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const user = rows[0];
    if (user.is_active === false) {
      return res.status(403).json({ error: "Your account is inactive" });
    }
    if (isUnknownRole(user.role)) {
      return res.status(403).json({ error: "Your account role is not recognized" });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const normalizedRole = normalizeUserRole(user.role);
    const permissions = getEffectivePermissions({
      role: normalizedRole,
      permissions: sanitizePermissionOverrides(user.permissions),
    });

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: normalizedRole,
      },
      JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: normalizedRole,
        username: user.username,
        name: [user.first_name, user.last_name].filter(Boolean).join(" ").trim() || user.username,
        permissions,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function register(req, res) {
  try {
    const { password } = req.body;
    const username = cleanRequiredString(req.body.username, "Username", 80);
    const email = normalizeEmail(req.body.email);

    if (!username || !email || !password) {
      return badRequest(res, "Username, email and password are required");
    }
    if (!isValidEmail(email)) {
      return badRequest(res, "A valid email address is required");
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
      `INSERT INTO users (username, email, password, role, permissions)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       RETURNING id, username, email, role, permissions`,
      [username, email, hashedPassword, ROLES.MAIN_ADMIN, JSON.stringify({})]
    );

    res.status(201).json({
      message: "Admin registered successfully",
      user: rows[0],
    });
  } catch (err) {
    console.error("Register error:", err);
    if (err instanceof Error && err.message.includes("required")) {
      return badRequest(res, err.message);
    }

    if (err.code === "23505") {
      return res.status(409).json({
        error: "Username or email already exists",
      });
    }

    res.status(500).json({ error: "Internal server error" });
  }
}
