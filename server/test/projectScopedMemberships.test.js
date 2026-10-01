import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const migrationUrl=new URL('../sql/004_project_scoped_memberships.sql',import.meta.url);

test('membership and pending invitation uniqueness are scoped to a project',async()=>{
  const sql=await readFile(migrationUrl,'utf8');

  assert.match(sql,/project_memberships\(project_id, account_id\)/);
  assert.match(sql,/project_invitations\(project_id, phone\) WHERE status = 'invited'/);
  assert.doesNotMatch(sql,/CREATE UNIQUE INDEX[^;]+project_memberships\(account_id\)/s);
  assert.doesNotMatch(sql,/CREATE UNIQUE INDEX[^;]+project_invitations\(phone\)/s);
});
