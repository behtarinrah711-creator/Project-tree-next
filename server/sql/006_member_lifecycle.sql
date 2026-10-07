BEGIN;

ALTER TABLE project_memberships DROP CONSTRAINT IF EXISTS project_memberships_status;
ALTER TABLE project_memberships
  ADD CONSTRAINT project_memberships_status CHECK (status IN ('invited', 'active', 'inactive', 'suspended'));

INSERT INTO schema_migrations(version)
VALUES ('006_member_lifecycle')
ON CONFLICT (version) DO NOTHING;

COMMIT;
