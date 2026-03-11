import jwt from "jsonwebtoken";

export const authMiddleware = (req, res, next) => {
  const JWT_SECRET = process.env.JWT_SECRET;
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const token = authHeader.split(" ")[1];

    if (!JWT_SECRET) {
      throw new Error("JWT_SECRET not configured");
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;

    next();
  } catch (err) {
    console.error("Auth error:", err.message);
    return res.status(401).json({ error: "Invalid or expired token" });
  }
};

export const requireRole = (role) => {
  return (req, res, next) => {
    if (req.user?.role !== role) {
      return res.status(403).json({ error: "Access denied" });
    }
    next();
  };
};
