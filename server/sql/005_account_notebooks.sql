BEGIN;

-- One private notebook per SMS account. It is not a project, has no members,
-- and cannot be shared. The payload is the whole notebook document.
CREATE TABLE IF NOT EXISTS account_notebooks (
  account_id uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  revision bigint NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT account_notebooks_payload_object CHECK (jsonb_typeof(payload) = 'object')
);

INSERT INTO schema_migrations(version)
VALUES ('005_account_notebooks')
ON CONFLICT (version) DO NOTHING;

COMMIT;
