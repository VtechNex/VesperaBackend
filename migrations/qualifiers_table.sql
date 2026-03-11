-- Migration: qualifiers table

CREATE TABLE IF NOT EXISTS qualifiers (
    id          BIGSERIAL PRIMARY KEY,
    name        VARCHAR(150) NOT NULL,
    type        VARCHAR(20) NOT NULL CHECK (type IN ('product', 'customer', 'tag')),
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_qualifier_type_name UNIQUE (type, name)
);

CREATE INDEX IF NOT EXISTS idx_qualifiers_type ON qualifiers(type);
