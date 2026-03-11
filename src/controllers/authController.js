import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import pool from "../db/pool.js";

export async function login(req, res) {
  try {
    const JWT_SECRET = process.env.JWT_SECRET;
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const { rows } = await pool.query(
      "SELECT id, email, password, role FROM users WHERE email = $1 LIMIT 1",
      [email]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const user = rows[0];

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function register(req, res) {
  try {
    const { username, email, password } = req.body;

    // 1️⃣ Basic validation
    if (!username || !email || !password) {
      return res.status(400).json({
        error: "Username, email and password are required",
      });
    }

    // 2️⃣ Check existing user (email or username)
    const existingUser = await pool.query(
      `SELECT id FROM users WHERE email = $1 OR username = $2 LIMIT 1`,
      [email, username]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        error: "Username or email already exists",
      });
    }

    // 3️⃣ Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // 4️⃣ Insert admin user
    const { rows } = await pool.query(
      `INSERT INTO users (username, email, password, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, username, email, role`,
      [username, email, hashedPassword, "admin"]
    );

    // 5️⃣ Response
    res.status(201).json({
      message: "Admin registered successfully",
      user: rows[0],
    });
  } catch (err) {
    console.error("Register error:", err);

    // Handle unique constraint violation (extra safety)
    if (err.code === "23505") {
      return res.status(409).json({
        error: "Username or email already exists",
      });
    }

    res.status(500).json({ error: "Internal server error" });
  }
}

