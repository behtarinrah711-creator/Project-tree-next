BEGIN;

-- Older deployments may still have a global UNIQUE/PRIMARY KEY on account_id.
-- Membership identity is project-scoped: one account can belong to many projects.
DO $$
DECLARE
  account_attnum smallint;
  item record;
BEGIN
  SELECT attnum INTO account_attnum
  FROM pg_attribute
  WHERE attrelid = 'project_memberships'::regclass
    AND attname = 'account_id'
    AND NOT attisdropped;

  FOR item IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'project_memberships'::regclass
      AND contype IN ('p', 'u')
      AND conkey = ARRAY[account_attnum]::smallint[]
  LOOP
    EXECUTE format(
      'ALTER TABLE project_memberships DROP CONSTRAINT %I',
      item.conname
    );
  END LOOP;

  FOR item IN
    SELECT indexrelid::regclass AS index_name
    FROM pg_index index_definition
    WHERE indrelid = 'project_memberships'::regclass
      AND indisunique
      AND NOT indisprimary
      AND indnkeyatts = 1
      AND indkey::text = account_attnum::text
      AND NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conindid = index_definition.indexrelid
      )
  LOOP
    EXECUTE format('DROP INDEX %s', item.index_name);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS project_memberships_project_account_idx
  ON project_memberships(project_id, account_id);

-- Apply the same repair to legacy invitation schemas that made phone global.
DO $$
DECLARE
  phone_attnum smallint;
  item record;
BEGIN
  SELECT attnum INTO phone_attnum
  FROM pg_attribute
  WHERE attrelid = 'project_invitations'::regclass
    AND attname = 'phone'
    AND NOT attisdropped;

  FOR item IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'project_invitations'::regclass
      AND contype = 'u'
      AND conkey = ARRAY[phone_attnum]::smallint[]
  LOOP
    EXECUTE format(
      'ALTER TABLE project_invitations DROP CONSTRAINT %I',
      item.conname
    );
  END LOOP;

  FOR item IN
    SELECT indexrelid::regclass AS index_name
    FROM pg_index index_definition
    WHERE indrelid = 'project_invitations'::regclass
      AND indisunique
      AND NOT indisprimary
      AND indnkeyatts = 1
      AND indkey::text = phone_attnum::text
      AND NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conindid = index_definition.indexrelid
      )
  LOOP
    EXECUTE format('DROP INDEX %s', item.index_name);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS project_invitations_pending_phone_idx
  ON project_invitations(project_id, phone) WHERE status = 'invited';

INSERT INTO schema_migrations(version)
VALUES ('004_project_scoped_memberships')
ON CONFLICT (version) DO NOTHING;

COMMIT;
