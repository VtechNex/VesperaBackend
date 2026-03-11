-- Migration: add follow-up fields to leads and create properties table
-- Adds: assigned_to, follow_up_date, repeat_follow_up, repeat_interval,
--       follow_up_count, follow_up_notes
-- And: creates properties table

BEGIN;

-- Provide UUID generation helper if not present
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Add follow-up fields to leads
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS assigned_to UUID,
  ADD COLUMN IF NOT EXISTS follow_up_date TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS repeat_follow_up BOOLEAN DEFAULT FALSE NOT NULL,
  ADD COLUMN IF NOT EXISTS repeat_interval INTERVAL,
  ADD COLUMN IF NOT EXISTS follow_up_count INTEGER DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS follow_up_notes TEXT;

-- Constraints for new leads fields
ALTER TABLE leads
  ADD CONSTRAINT IF NOT EXISTS leads_assigned_to_fkey
    FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
  ADD CONSTRAINT IF NOT EXISTS leads_follow_up_count_nonnegative
    CHECK (follow_up_count >= 0),
  ADD CONSTRAINT IF NOT EXISTS leads_repeat_interval_nonnegative
    CHECK (repeat_interval IS NULL OR extract(epoch FROM repeat_interval) >= 0);

-- Create properties table
CREATE TABLE IF NOT EXISTS properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  images TEXT[],
  title TEXT NOT NULL,
  location TEXT,
  description TEXT,
  beds INTEGER,
  baths INTEGER,
  sqft INTEGER,
  tags TEXT[],
  price NUMERIC(12,2),
  type TEXT NOT NULL CHECK (type IN ('commercial', 'residential')),
  sale BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_properties_price ON properties(price);

COMMIT;
