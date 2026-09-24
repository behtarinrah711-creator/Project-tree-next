BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY,
  phone varchar(16) UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash char(64) PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sessions_account_id_idx ON sessions(account_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS otp_challenges (
  id uuid PRIMARY KEY,
  phone varchar(16) NOT NULL,
  code_hash char(64) NOT NULL,
  attempts_left smallint NOT NULL DEFAULT 5,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  requester_ip inet,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS otp_challenges_phone_created_idx ON otp_challenges(phone, created_at DESC);

-- Lossless first migration boundary. The current browser/Firestore documents are
-- stored intact as JSONB so no field is discarded while the final backend model
-- is being designed. Normalized tables can be populated from these snapshots.
CREATE TABLE IF NOT EXISTS app_snapshots (
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  scope varchar(64) NOT NULL,
  revision bigint NOT NULL DEFAULT 1,
  payload jsonb NOT NULL,
  source varchar(32) NOT NULL DEFAULT 'browser',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, scope),
  CONSTRAINT app_snapshots_payload_object CHECK (jsonb_typeof(payload) IN ('object', 'array'))
);

-- Projects are stored independently from browser/device state. Access is
-- granted only through memberships, while role permissions remain editable so
-- the product can add project-specific roles without changing this model.
CREATE TABLE IF NOT EXISTS projects (
  id varchar(128) PRIMARY KEY,
  owner_account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  payload jsonb NOT NULL,
  revision bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT projects_payload_object CHECK (jsonb_typeof(payload) = 'object')
);
CREATE INDEX IF NOT EXISTS projects_owner_account_idx ON projects(owner_account_id);

CREATE TABLE IF NOT EXISTS project_roles (
  id uuid PRIMARY KEY,
  project_id varchar(128) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  role_key varchar(48) NOT NULL,
  display_name varchar(80) NOT NULL,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, role_key),
  UNIQUE (id, project_id),
  CONSTRAINT project_roles_permissions_object CHECK (jsonb_typeof(permissions) = 'object')
);

CREATE TABLE IF NOT EXISTS project_memberships (
  project_id varchar(128) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  role_id uuid NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'active',
  invited_by uuid REFERENCES accounts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, account_id),
  FOREIGN KEY (role_id, project_id) REFERENCES project_roles(id, project_id) ON DELETE RESTRICT,
  CONSTRAINT project_memberships_status CHECK (status IN ('invited', 'active', 'suspended'))
);
CREATE INDEX IF NOT EXISTS project_memberships_account_idx
  ON project_memberships(account_id, status);

INSERT INTO schema_migrations(version)
VALUES ('001_initial')
ON CONFLICT (version) DO NOTHING;

INSERT INTO schema_migrations(version)
VALUES ('002_project_roles')
ON CONFLICT (version) DO NOTHING;

COMMIT;
