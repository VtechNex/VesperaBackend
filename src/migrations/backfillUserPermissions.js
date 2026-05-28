import dotenv from "dotenv";
import pool from "../db/pool.js";
import {
  areAllPermissionValuesFalse,
  getDefaultPermissionsForRole,
  sanitizePermissionOverrides,
  normalizeUserRole,
  ROLES,
} from "../auth/permissions.js";
import { ensureSchema } from "../utils/schemaBootstrap.js";

dotenv.config();

async function run() {
  await ensureSchema();

  const result = await pool.query(
    `SELECT id, email, role, permissions, updated_by
     FROM users
     ORDER BY created_at ASC`
  );
  let updatedCount = 0;

  for (const row of result.rows) {
    const normalizedRole = normalizeUserRole(row.role);
    const existingPermissions = sanitizePermissionOverrides(row.permissions);
    const shouldResetLegacyFalsePermissions =
      (normalizedRole === ROLES.L1 || normalizedRole === ROLES.L2) &&
      !row.updated_by &&
      areAllPermissionValuesFalse(existingPermissions);

    const nextPermissions =
      normalizedRole === ROLES.MAIN_ADMIN || normalizedRole === ROLES.MANAGER
        ? {}
        : {
            ...getDefaultPermissionsForRole(normalizedRole),
            ...(shouldResetLegacyFalsePermissions ? {} : existingPermissions),
          };

    await pool.query(
      `UPDATE users
       SET role = $1,
           permissions = $2::jsonb,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [normalizedRole, JSON.stringify(nextPermissions), row.id]
    );

    updatedCount += 1;
    console.log(`Backfilled ${row.email} -> ${normalizedRole}`);
  }

  console.log(`Completed migration for ${updatedCount} users.`);
}

run()
  .catch((error) => {
    console.error("Permission backfill failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
