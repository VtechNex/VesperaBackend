import pkg from "pg";
const { Pool } = pkg;

// Create PostgreSQL pool
const pool = new Pool({
  user: "neondb_owner",           // your DB username
  host: "ep-divine-pond-adyzv0zf-pooler.c-2.us-east-1.aws.neon.tech",           // your DB host
  database: "neondb",      // your database name
  password: "npg_HGRMO1eKC2Jh",           // your actual password as string
  port: 5432,                  // default PostgreSQL port
  ssl: {
    rejectUnauthorized: false
  }
});

export default pool;
