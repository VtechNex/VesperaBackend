import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import pool from "./db/pool.js";
import authRouter from "./routes/auth.js";
import adminRouter from "./routes/admin.user.routes.js";
import qualifiersRouter from "./routes/qualifiers.js";
import listsRouter from "./routes/lists.js";
import leadsRouter from "./routes/leads.js";
import propertiesRouter from "./routes/properties.js";
import globalRouter from "./routes/globalRouter.js";
import settingsRouter from "./routes/settings.js";
import { authMiddleware, requirePermission } from "./middleware/security.js";
import { startFollowUpScheduler } from "./services/followupService.js";
import { ensureSchema } from "./utils/schemaBootstrap.js";

dotenv.config();

const app = express();

app.use(
  cors({
    origin: ["http://localhost:5173", "https://vespera-web-app.vercel.app"],
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

app.use(express.json({ limit: "5mb" }));

app.use("/api/auth", authRouter);
app.use("/api/admin", authMiddleware, requirePermission("canManageUsers"), adminRouter);
app.use("/api/admin/qualifiers", authMiddleware, requirePermission("canManageQualifiers"), qualifiersRouter);
app.use("/api/lists", authMiddleware, listsRouter);
app.use("/api/leads", authMiddleware, leadsRouter);
app.use("/api/properties", authMiddleware, requirePermission("canManagePropertyMedia"), propertiesRouter);
app.use("/api/settings", authMiddleware, settingsRouter);
app.use("/api/global", globalRouter);
app.use("/", (req, res) => {
  res.send("Vespera Backend is UP");
});

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    await pool.query("SELECT 1");
    await ensureSchema();
    console.log("Database connected");
    startFollowUpScheduler();
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.log("Database connection failed");
    console.error(error.message);
    process.exit(1);
  }
}

startServer();

export default app;
