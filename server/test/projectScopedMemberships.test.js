import {Readable} from 'node:stream';
import {createApp} from '../src/app.js';
import {canAccessFiles} from '../src/fileUploads.js';
import {projectPermissionState} from '../../src/modules/roleManagement/permissionState.js';
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

test('owner access uses member rules for its project and can be restored to full access',async()=>{
  let accountId='owner';
  const full={view:true,edit:true,manageMembers:true,manageRoles:true,delete:true};
  const projects=new Map([['p',full],['other',full]]);
  const pool={async query(sql,params){
    if(sql.includes('FROM sessions'))return {rows:[{account_id:accountId}]};
    if(sql.startsWith('UPDATE project_roles')){
      const [id,actor,permissions]=params;
      assert.match(sql,/p.owner_account_id=\$2/);
      if(actor!=='owner' || !projects.has(id))return {rowCount:0,rows:[]};
      const saved=JSON.parse(permissions);
      projects.set(id,saved);
      return {rowCount:1,rows:[{role_key:'owner',permissions:saved}]};
    }
    if(sql.includes('SELECT p.payload, r.role_key, r.permissions')){
      return {rows:[...projects].map(([id,permissions])=>({payload:{id},role_key:'owner',permissions}))};
    }
    if(sql.includes('FROM app_snapshots'))return {rows:[]};
    throw new Error(sql);
  }};
  const app=createApp({pool,sessionSecret:'test',logger:{error(){}}});
  async function call(method,url,body){
    const request=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);
    request.method=method;request.url=url;request.headers={authorization:'Bearer token'};
    let status,payload;
    await app(request,{writeHead(value){status=value;},end(value){payload=JSON.parse(value);}});
    return {status,payload};
  }
  const path='/api/v1/projects/p/admin-access';
  const permissions={dashboard:'none',contracts:'view','planning:tree':'full'};
  accountId='member';
  assert.equal((await call('PATCH',path,{permissions})).status,403);
  accountId='owner';
  assert.equal((await call('PATCH',path,{permissions:{contracts:'invalid'}})).status,400);
  assert.equal((await call('PATCH',path,{permissions})).status,200);
  const workspace=(await call('GET','/api/v1/workspace')).payload;
  const access=workspace.access.p;
  assert.deepEqual(access,{role:'member',isOwner:true,permissions:{view:true,edit:true,modules:permissions,adminAccess:true}});
  assert.deepEqual(workspace.access.other,{role:'owner',permissions:full});
  const windowRef={KarhaSaosaWorkspaceAccess:workspace.access};
  assert.equal(projectPermissionState('p',['dashboard'],windowRef).visible,false);
  assert.deepEqual(projectPermissionState('p',['contracts','planning:tree'],windowRef).levels,{contracts:'view','planning:tree':'full'});
  const ownerRow={owner_account_id:'owner',membership_status:'active',payload:{projectMembers:[]},permissions:access.permissions};
  assert.equal(canAccessFiles(ownerRow,'owner',false,'contracts'),true);
  assert.equal(canAccessFiles(ownerRow,'owner',true,'contracts'),false);
  const restored=await call('PATCH',path,{permissions:{dashboard:'full',contracts:'full','planning:tree':'full'}});
  assert.deepEqual(restored.payload.access,{role:'owner',permissions:full});
  assert.equal(canAccessFiles({...ownerRow,permissions:restored.payload.access.permissions},'owner',true,'contracts'),true);
});
