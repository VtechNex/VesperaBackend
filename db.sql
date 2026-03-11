--- EXTENSIONS SETUP
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS citext;

--- TABLES SETUP
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    username CITEXT NOT NULL UNIQUE,
    email CITEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,

    role VARCHAR(20) NOT NULL CHECK (
        role IN ('admin', 'owner', 'manager', 'l1', 'l2')
    ),

    is_active BOOLEAN DEFAULT TRUE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE lists (
    id          BIGSERIAL PRIMARY KEY,
    name        VARCHAR(150) NOT NULL,

    owner_id    UUID NOT NULL,     -- user.id

    subject     VARCHAR(150),
    description TEXT,

    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_lists_owner
        FOREIGN KEY (owner_id)
        REFERENCES users(id)
        ON DELETE RESTRICT
);

CREATE TABLE leads (
    id            BIGSERIAL PRIMARY KEY,

    fname         VARCHAR(100) NOT NULL,
    lname         VARCHAR(100),

    designation   VARCHAR(150),       -- optional
    organization  VARCHAR(150),       -- optional

    email         VARCHAR(150),
    mobile        VARCHAR(20) NOT NULL,
    tel1          VARCHAR(20),
    tel2          VARCHAR(20),

    website       VARCHAR(255),
    address       TEXT,
    notes         TEXT,               -- property interest, budget, etc.

    list_id       BIGINT NOT NULL,

    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    assigned_to    UUID,                -- user.id
    follow_up_date TIMESTAMP,  ----- next follow-up date for the lead
    repeat_follow_up BOOLEAN DEFAULT FALSE,  -- whether to repeat follow-ups until lead is closed
    repeat_interval INTERVAL,  -- interval for repeating follow-ups (e.g., '7 days')
    follow_up_count INT DEFAULT 0,  -- number of follow-ups done
    follow_up_notes TEXT,  -- notes from follow-ups

    CONSTRAINT fk_leads_list
        FOREIGN KEY (list_id)
        REFERENCES lists(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_leads_assigned_to
        FOREIGN KEY (assigned_to)
        REFERENCES users(id)
        ON DELETE SET NULL
);

CREATE TABLE qualifiers (
    id          BIGSERIAL PRIMARY KEY,
    name        VARCHAR(150) NOT NULL,
    type        VARCHAR(20) NOT NULL CHECK (type IN ('product', 'customer', 'tag')),
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_qualifier_type_name UNIQUE (type, name)
);

--- INDEXES SETUP
CREATE INDEX idx_qualifiers_type ON qualifiers(type);
CREATE INDEX idx_lists_owner_id ON lists(owner_id);
CREATE INDEX idx_leads_list_id ON leads(list_id);
CREATE INDEX idx_leads_mobile ON leads(mobile);
CREATE INDEX idx_leads_email ON leads(email);


--- FUNCTIONS SETUP
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = CURRENT_TIMESTAMP;
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

--- TRIGGERS SETUP
CREATE TRIGGER update_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

