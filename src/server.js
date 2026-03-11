import dotenv from "dotenv";
import express from "express";
import pool from "./db/pool.js";
import authRouter from "./routes/auth.js";
import adminRouter from "./routes/admin.user.routes.js";
import qualifiersRouter from "./routes/qualifiers.js";
import listsRouter from "./routes/lists.js";
import leadsRouter from "./routes/leads.js";
import propertiesRouter from "./routes/properties.js"
import globalRouter from "./routes/globalRouter.js";
import cors from "cors";
import { authMiddleware, requireRole } from "./middleware/security.js";

dotenv.config(); // loads .env

const app = express();

/* ✅ CORS CONFIG */
app.use(
  cors({
    origin: "http://localhost:5173", // frontend URL
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

app.use(express.json());

// Routes
app.use("/api/auth", authRouter);
app.use("/api/admin", authMiddleware, requireRole("admin"), adminRouter);
app.use("/api/admin/qualifiers", authMiddleware, requireRole("admin"), qualifiersRouter);
app.use("/api/lists", authMiddleware, listsRouter);
app.use("/api/leads", authMiddleware, leadsRouter);
app.use("/api/properties", authMiddleware, propertiesRouter);
app.use("/api/global", globalRouter);

// ✅ FIX PORT FALLBACK
const PORT = process.env.PORT || 5000;

app.listen(PORT, async () => {
  console.log(`✅ Server running on port ${PORT}`);

  try {
    await pool.query("SELECT 1"); // test DB connection
    console.log("✅ Database connected");
  } catch (error) {
    console.log("❌ Database connection failed");
    console.error(error.message);
  }
});
