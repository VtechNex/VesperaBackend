-- Migration: add deal_size, lead_potential, lead_stage to leads table

ALTER TABLE leads
ADD COLUMN IF NOT EXISTS deal_size NUMERIC,
ADD COLUMN IF NOT EXISTS lead_potential VARCHAR(50),
ADD COLUMN IF NOT EXISTS lead_stage VARCHAR(50);
