import pool from "../db/pool.js";

const statements = [
  `CREATE EXTENSION IF NOT EXISTS "pgcrypto"`,
  `CREATE EXTENSION IF NOT EXISTS citext`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name VARCHAR(100)`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name VARCHAR(100)`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS mobile VARCHAR(30)`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS designation VARCHAR(150)`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS organization VARCHAR(150)`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS website VARCHAR(255)`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS telephone_direct VARCHAR(30)`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS telephone_office VARCHAR(30)`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS address1 TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS address2 TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS city VARCHAR(120)`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS state VARCHAR(120)`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS zip VARCHAR(30)`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS country VARCHAR(120)`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS facebook VARCHAR(255)`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS twitter VARCHAR(255)`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS linkedin VARCHAR(255)`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS instagram VARCHAR(255)`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS personal_url VARCHAR(255)`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}'::jsonb`,
  `ALTER TABLE leads ADD COLUMN IF NOT EXISTS product_group VARCHAR(150)`,
  `ALTER TABLE leads ADD COLUMN IF NOT EXISTS customer_group VARCHAR(150)`,
  `ALTER TABLE leads ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}'`,
  `ALTER TABLE leads ADD COLUMN IF NOT EXISTS deal_size NUMERIC(14,2)`,
  `ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_potential VARCHAR(50)`,
  `ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_stage VARCHAR(150)`,
  `ALTER TABLE leads ADD COLUMN IF NOT EXISTS do_not_follow_up BOOLEAN DEFAULT FALSE`,
  `ALTER TABLE leads ADD COLUMN IF NOT EXISTS do_not_follow_up_reason TEXT`,
  `ALTER TABLE leads ADD COLUMN IF NOT EXISTS custom_fields_data JSONB DEFAULT '{}'::jsonb`,
  `CREATE TABLE IF NOT EXISTS properties (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    price NUMERIC(14,2) NOT NULL,
    location VARCHAR(255) NOT NULL,
    images TEXT[] DEFAULT '{}',
    type VARCHAR(80) NOT NULL,
    beds INTEGER,
    baths INTEGER,
    sqft INTEGER,
    tags TEXT[] DEFAULT '{}',
    sale BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS company_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    primary_contact JSONB NOT NULL DEFAULT '{}'::jsonb,
    branding JSONB NOT NULL DEFAULT '{}'::jsonb,
    locale JSONB NOT NULL DEFAULT '{}'::jsonb,
    account_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    sales_org_configured BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS custom_fields (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    type VARCHAR(30) NOT NULL,
    values JSONB NOT NULL DEFAULT '[]'::jsonb,
    mandatory BOOLEAN NOT NULL DEFAULT FALSE,
    lists TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_custom_fields_user_name ON custom_fields (user_id, lower(name))`,
  `CREATE INDEX IF NOT EXISTS idx_custom_fields_user_id ON custom_fields (user_id)`,
];

export async function ensureSchema() {
  for (const statement of statements) {
    await pool.query(statement);
  }
}
