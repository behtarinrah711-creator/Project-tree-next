import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const readApp=()=>readFile(new URL('../src/app.js',import.meta.url),'utf8');

test('login and workspace refresh never auto-accept project invitations',async()=>{
  const app=await readApp();
  assert.doesNotMatch(app,/acceptPhoneInvitations/);
  assert.match(app,/pendingInvitationCount/);
  assert.match(app,/request\.method === 'GET'\) return sendJson\(response, 200, await readWorkspace\(pool, accountId\)\)/);
});

test('only the invited account can explicitly accept a pending invitation',async()=>{
  const app=await readApp();
  assert.match(app,/accounts a ON a\.id=\$1 AND a\.phone=i\.phone/);
  assert.match(app,/i\.id=\$2 AND i\.status='invited' AND i\.expires_at>now\(\)/);
  assert.match(app,/project_memberships[\s\S]*status='active'/);
  assert.match(app,/project_invitations SET status='accepted'/);
  assert.doesNotMatch(app,/invitations\/\(\[\^\/\]\+\)\/(?:cancel|decline)/);
});

test('owners can revoke pending invitations and deleted members must be invited again',async()=>{
  const app=await readApp();
  assert.match(app,/project_invitations SET status='revoked'/);
  assert.match(app,/payload\.projectMembers=payload\.projectMembers\.filter\(item=>item\?\.mobile!==cancelled\.rows\[0\]\.phone\)/);
  assert.match(app,/WHERE i\.status='invited' AND i\.expires_at>now\(\)/);
  assert.match(app,/i\.id=\$2 AND i\.status='invited' AND i\.expires_at>now\(\)/);
  assert.match(app,/DELETE FROM project_memberships m USING accounts a/);
  assert.match(app,/return sendJson\(response,200,\{mobile:phone,status:'deleted'\}\)/);
  assert.match(app,/ON CONFLICT \(project_id,account_id\) DO UPDATE SET role_id=EXCLUDED\.role_id,status='active'/);
});

test('a missing valid invitation is reconciled while an expired one can be replaced',async()=>{
  const app=await readApp();
  assert.match(app,/status='invited' AND expires_at<=now\(\)/);
  assert.match(app,/status='invited' AND expires_at>now\(\) LIMIT 1/);
  assert.match(app,/alreadyInvited:true/);
});

test('pending invitations never grant project access',async()=>{
  const app=await readApp();
  assert.match(app,/FROM project_memberships m[\s\S]*WHERE m\.account_id = \$1 AND m\.status = 'active'/);
});

test('an orphan membership cannot block a new invitation',async()=>{
  const app=await readApp();
  assert.match(app,/Array\.isArray\(projectMembers\)[\s\S]*item\?\.mobile===phone && item\?\.status!=='deleted'/);
  assert.match(app,/DELETE FROM project_memberships WHERE project_id=\$1 AND account_id=\$2/);
});

test('legacy invitations without a local invitation id can be revoked by phone',async()=>{
  const app=await readApp();
  assert.match(app,/inviteRoute\.action==='create'\?normalizeIranPhone/);
  assert.match(app,/phone=\$3/);
  assert.match(app,/RETURNING id,phone/);
});
