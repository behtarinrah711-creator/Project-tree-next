BEGIN;

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS email varchar(254);
CREATE UNIQUE INDEX IF NOT EXISTS accounts_email_unique_idx
  ON accounts (lower(email)) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS project_invitations (
  id uuid PRIMARY KEY,
  project_id varchar(128) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  phone varchar(11) NOT NULL,
  email varchar(254),
  first_name varchar(100) NOT NULL DEFAULT '',
  last_name varchar(100) NOT NULL DEFAULT '',
  role_key varchar(48) NOT NULL,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  token_hash char(64) NOT NULL UNIQUE,
  status varchar(16) NOT NULL DEFAULT 'invited',
  invited_by uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  sms_sent_at timestamptz,
  email_sent_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_invitations_phone_format CHECK (phone ~ '^09[0-9]{9}$'),
  CONSTRAINT project_invitations_email_format CHECK (email IS NULL OR email = lower(email)),
  CONSTRAINT project_invitations_permissions_object CHECK (jsonb_typeof(permissions) = 'object'),
  CONSTRAINT project_invitations_status CHECK (status IN ('invited', 'accepted', 'revoked'))
);

CREATE UNIQUE INDEX IF NOT EXISTS project_invitations_pending_phone_idx
  ON project_invitations(project_id, phone) WHERE status = 'invited';
CREATE INDEX IF NOT EXISTS project_invitations_phone_status_idx
  ON project_invitations(phone, status);

INSERT INTO schema_migrations(version)
VALUES ('003_project_invitations')
ON CONFLICT (version) DO NOTHING;

COMMIT;
