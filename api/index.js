import app from "../src/server.js";

const exactAllowedOrigins = new Set([
  "http://localhost:5173",
  "https://vespera-web-app.vercel.app",
]);

function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (exactAllowedOrigins.has(origin)) return true;

  try {
    const { hostname, protocol } = new URL(origin);
    return protocol === "https:" && /^vespera-web-app(?:-[a-z0-9-]+)?\.vercel\.app$/i.test(hostname);
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  const origin = req.headers.origin;

  if (isAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  }

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  return app(req, res);
}
