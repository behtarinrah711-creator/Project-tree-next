import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('member lifecycle controls stay in the list and vary by status',async()=>{
  const source=await readFile(new URL('./index.js',import.meta.url),'utf8');
  assert.match(source,/member\.status==='invited'.*'ارسال مجدد دعوت‌نامه'.*'حذف دعوت‌نامه'/s);
  assert.match(source,/member\.status==='active'.*'غیرفعال‌سازی'.*'حذف'/s);
  assert.match(source,/member\.status==='inactive'.*'فعال‌سازی'.*'حذف'/s);
  assert.match(source,/member\.status==='deleted'.*'ارسال دعوت‌نامه'/s);
  assert.match(source,/cancelInvitation[\s\S]*removeMember\(projectId,member\)[\s\S]*'دعوت‌نامه حذف شد\.'/);
  assert.doesNotMatch(source,/fields\.appendChild\(resend\)/);
});

test('an invitation present only on the server is restored to the member list',async()=>{
  const source=await readFile(new URL('./index.js',import.meta.url),'utf8');
  assert.match(source,/invitation\.alreadyInvited/);
  assert.match(source,/این کاربر قبلاً دعوت شده است/);
  assert.match(source,/permissions:normalizePermissions\(invitation\.permissions \|\| member\.permissions,registry\)/);
});

test('a duplicate pending invitation uses the system toast instead of an inline keyboard-hidden error',async()=>{
  const source=await readFile(new URL('./index.js',import.meta.url),'utf8');
  assert.match(source,/duplicate\.status==='invited'\) windowRef\?\.KarhaToast\?\.show\?\.\(message\)/);
});

test('cancelling an invitation removes every stale local row for the same phone',async()=>{
  const source=await readFile(new URL('./index.js',import.meta.url),'utf8');
  assert.match(source,/projectMembers\.filter\(item=>item\.mobile!==member\.mobile\)/);
});

test('admin access opens the shared member editor with a fixed owner number and full defaults',async t=>{
  const previous=globalThis.window;
  t.after(()=>{globalThis.window=previous;});
  const make=tag=>({tag,children:[],dataset:{},append(...nodes){this.children.push(...nodes);},
    appendChild(node){this.append(node);},setAttribute(){},addEventListener(){},remove(){},
    querySelector(){return {};},
  });
  const body=make('body');
  const windowRef={
    localStorage:{getItem:()=>JSON.stringify({token:'test',phone:'09123456789',expiresAt:Date.now()+10000})},
    KarhaSaosaWorkspaceAccess:{p:{role:'owner'},other:{role:'invite'}},
  };
  globalThis.window={...windowRef,location:{hash:'',search:''}};
  const {createRoleManagementModule}=await import('./index.js');
  const documentRef={body,defaultView:windowRef,createElement:make};
  const roles=createRoleManagementModule({documentRef,smsAdapter:{configured:true}});
  const registry={list:()=>[{id:'contracts',title:'قراردادها'}]};
  const inputs=node=>[...(node.tag==='input'?[node]:[]),...node.children.flatMap(inputs)];
  assert.equal(roles.openAdminAccess('other',registry),false);
  assert.equal(roles.openAdminAccess('p',registry),true);
  const fields=inputs(body.children.at(-1));
  assert.equal(fields[0].name,'mobile');
  assert.equal(fields[0].value,'09123456789');
  assert.equal(fields[0].readOnly,true);
  assert.ok(fields.slice(1).every(field=>field.name.startsWith('permission:') && field.value==='full'));
  windowRef.KarhaSaosaWorkspaceAccess.p={role:'member',isOwner:true,permissions:{modules:{dashboard:'none',contracts:'view'}}};
  assert.equal(roles.openAdminAccess('p',registry),true);
  const saved=Object.fromEntries(inputs(body.children.at(-1)).map(field=>[field.name,field.value]));
  assert.equal(saved['permission:dashboard'],'none');
  assert.equal(saved['permission:contracts'],'view');
});
