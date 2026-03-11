-- Migration: add product_group, customer_group, tags to leads table

ALTER TABLE leads
ADD COLUMN IF NOT EXISTS product_group VARCHAR(150),
ADD COLUMN IF NOT EXISTS customer_group VARCHAR(150),
ADD COLUMN IF NOT EXISTS tags BIGINT[]; -- stores qualifier ids
