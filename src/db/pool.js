import "dotenv/config";
import pkg from "pg";
const { Pool } = pkg;

const hasConnectionString = Boolean(process.env.DATABASE_URL);

const poolConfig = hasConnectionString
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSL === "disable" ? false : { rejectUnauthorized: false },
    }
  : {
      user: process.env.PGUSER,
      host: process.env.PGHOST,
      database: process.env.PGDATABASE,
      password: process.env.PGPASSWORD,
      port: Number(process.env.PGPORT || 5432),
      ssl: process.env.PGSSL === "disable" ? false : { rejectUnauthorized: false },
    };

if (!hasConnectionString && (!poolConfig.user || !poolConfig.host || !poolConfig.database || !poolConfig.password)) {
  throw new Error(
    "Database configuration missing. Set DATABASE_URL or PGUSER/PGHOST/PGDATABASE/PGPASSWORD/PGPORT in VesperaBackend/.env."
  );
}

const pool = new Pool(poolConfig);

export default pool;
