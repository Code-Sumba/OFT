-- Organic Food Traceability: PostgreSQL schema (Supabase).
-- The blockchain is the source of truth; these tables are a cache plus
-- off-chain data (users, alerts). Run once on a fresh database.

CREATE TABLE IF NOT EXISTS users (
  id             uuid PRIMARY KEY,
  name           text NOT NULL,
  email          text NOT NULL UNIQUE,
  password_hash  text NOT NULL,
  role           text NOT NULL CHECK (role IN ('admin', 'farmer', 'certifier', 'processor', 'distributor', 'retailer')),
  status         text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'blocked')),
  organisation   text,
  -- keccak256(id) as 0x-hex: the actor id recorded on-chain for this user
  chain_actor_id text NOT NULL UNIQUE,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS batches (
  id               uuid PRIMARY KEY,
  batch_code       text NOT NULL UNIQUE,
  product          text NOT NULL,
  quantity         numeric(12, 2) NOT NULL CHECK (quantity > 0),
  unit             text NOT NULL,
  origin           text NOT NULL,
  harvest_date     date NOT NULL,
  farmer_id        uuid NOT NULL REFERENCES users (id),
  certificate_cid  text,
  cert_expiry      timestamptz,
  status           text NOT NULL DEFAULT 'registered' CHECK (status IN ('registered', 'certified', 'rejected')),
  stage            text NOT NULL DEFAULT 'farmer' CHECK (stage IN ('farmer', 'processor', 'distributor', 'retailer', 'sold')),
  current_owner_id uuid NOT NULL REFERENCES users (id),
  tx_hash_register text,
  trust_score      integer NOT NULL DEFAULT 100 CHECK (trust_score BETWEEN 0 AND 100),
  -- position of the last chain event applied, so replayed/out-of-order events never roll state back
  last_block       bigint NOT NULL DEFAULT 0,
  last_log_index   integer NOT NULL DEFAULT -1,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS batch_events (
  id           bigserial PRIMARY KEY,
  batch_code   text NOT NULL REFERENCES batches (batch_code),
  event_type   text NOT NULL CHECK (event_type IN ('registered', 'certified', 'rejected', 'transferred', 'sold')),
  from_user_id uuid REFERENCES users (id),
  to_user_id   uuid REFERENCES users (id),
  stage        text,
  location     text,
  tx_hash      text NOT NULL,
  log_index    integer NOT NULL,
  block_number bigint NOT NULL,
  event_time   timestamptz NOT NULL,
  UNIQUE (tx_hash, log_index)
);

CREATE TABLE IF NOT EXISTS certificates (
  id           bigserial PRIMARY KEY,
  batch_code   text NOT NULL REFERENCES batches (batch_code),
  cid          text,
  certifier_id uuid NOT NULL REFERENCES users (id),
  approved     boolean NOT NULL,
  expiry       timestamptz,
  tx_hash      text NOT NULL UNIQUE,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fraud_alerts (
  id         bigserial PRIMARY KEY,
  batch_code text NOT NULL REFERENCES batches (batch_code),
  rule       text NOT NULL CHECK (rule IN ('R1', 'R2', 'R3', 'R4', 'R5')),
  severity   text NOT NULL CHECK (severity IN ('medium', 'high')),
  details    text,
  resolved   boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS indexer_state (
  id         integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_block bigint NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_batches_farmer ON batches (farmer_id);
CREATE INDEX IF NOT EXISTS idx_batches_owner ON batches (current_owner_id);
CREATE INDEX IF NOT EXISTS idx_batch_events_code_block ON batch_events (batch_code, block_number);
CREATE INDEX IF NOT EXISTS idx_fraud_alerts_open ON fraud_alerts (resolved, severity);
