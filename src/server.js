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
import { fileURLToPath } from "node:url";
import path from "node:path";

dotenv.config();

const app = express();
const exactAllowedOrigins = new Set([
  "http://localhost:5173",
  "https://vespera-web-app.vercel.app",
]);

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (exactAllowedOrigins.has(origin)) return true;

  try {
    const { hostname, protocol } = new URL(origin);
    return protocol === "https:" && /^vespera-web-app(?:-[a-z0-9-]+)?\.vercel\.app$/i.test(hostname);
  } catch {
    return false;
  }
}

const corsOptions = {
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) {
      return callback(null, true);
    }
    return callback(new Error("Not allowed by CORS"));
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
  optionsSuccessStatus: 204,
};

let bootstrapPromise = null;
let schedulerStarted = false;

async function initializeApp() {
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      await pool.query("SELECT 1");
      await ensureSchema();

      if (!process.env.VERCEL && !schedulerStarted) {
        startFollowUpScheduler();
        schedulerStarted = true;
      }
    })().catch((error) => {
      bootstrapPromise = null;
      throw error;
    });
  }

  return bootstrapPromise;
}

app.use(
  cors(corsOptions)
);
app.options(/.*/, cors(corsOptions));
app.use((req, res, next) => {
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  return next();
});

app.use(express.json({ limit: "5mb" }));
app.use(async (req, res, next) => {
  try {
    await initializeApp();
    next();
  } catch (error) {
    console.error("App initialization failed", error);
    res.status(500).json({ success: false, message: "Server initialization failed" });
  }
});

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

export async function startServer() {
  try {
    await initializeApp();
    console.log("Database connected");
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.log("Database connection failed");
    console.error(error.message);
    process.exit(1);
  }
}

const isDirectRun = process.argv[1]
  && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectRun) {
  startServer();
}

export default app;
