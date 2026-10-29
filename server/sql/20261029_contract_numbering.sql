BEGIN;
-- Permanent registries deliberately survive project/contract deletion.
CREATE TABLE IF NOT EXISTS contract_owner_codes (
  owner_account_id uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE RESTRICT,
  code varchar(3) NOT NULL UNIQUE CHECK (code ~ '^[A-HJ-NP-Z2-9]{3}$')
);
CREATE TABLE IF NOT EXISTS contract_project_codes (
  project_id varchar(128) PRIMARY KEY,
  owner_account_id uuid NOT NULL REFERENCES contract_owner_codes(owner_account_id) ON DELETE RESTRICT,
  code varchar(3) NOT NULL CHECK (code ~ '^[A-HJ-NP-Z2-9]{3}$'),
  last_serial bigint NOT NULL DEFAULT 0 CHECK (last_serial >= 0),
  UNIQUE(owner_account_id, code)
);
CREATE TABLE IF NOT EXISTS contract_number_registry (
  contract_uid uuid PRIMARY KEY,
  project_id varchar(128) NOT NULL REFERENCES contract_project_codes(project_id) ON DELETE RESTRICT,
  source_contract_id text NOT NULL,
  serial bigint NOT NULL CHECK (serial > 0),
  contract_no text NOT NULL UNIQUE,
  UNIQUE(project_id, source_contract_id),
  UNIQUE(project_id, serial)
);
INSERT INTO schema_migrations(version) VALUES ('20261029_contract_numbering') ON CONFLICT DO NOTHING;
COMMIT;
