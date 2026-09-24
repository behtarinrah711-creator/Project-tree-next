import test from 'node:test';
import assert from 'node:assert/strict';
import { ModuleRegistry } from '../../core/moduleRegistry.js';
import {
  ACCESS_LEVELS, PROJECT_ROLES, canDeleteWithAccess, canManageProjectRoles,
  createMember, normalizeMobile, permissionGroups, permissionModules,
} from './roleManagementDomain.js';

function registry(){
  const value=new ModuleRegistry();
  value.register({id:'dashboard',title:'خانه'});
  value.register({id:'planning',title:'برنامه'});
  value.register({id:'people',title:'مخاطبین'});
  value.register({id:'activities',title:'فعالیت‌ها'});
  value.register({id:'contracts',title:'قراردادها'});
  value.register({id:'role-management',title:'مدیریت نقش‌ها',assignablePermission:false});
  return value;
}

test('roles and access levels expose the complete product vocabulary',()=>{
  assert.deepEqual(PROJECT_ROLES.map(item=>item.label),['کارفرما','حسابدار','سرپرست کارگاه','مدیر کارگاه','رئیس کارگاه','پیمانکار']);
  assert.deepEqual(ACCESS_LEVELS.map(item=>item.id),['none','view','edit','create','full']);
  assert.equal(canDeleteWithAccess('create'),false);
  assert.equal(canDeleteWithAccess('full'),true);
});

test('permission list comes from registry and never delegates role management',()=>{
  assert.deepEqual(permissionModules(registry()),[
    {id:'dashboard',label:'خانه'},
    {id:'planning',label:'برنامه'},
    {id:'people',label:'مخاطبین'},
    {id:'activities',label:'فعالیت‌ها'},
    {id:'contracts',label:'قراردادها'},
  ]);
  assert.deepEqual(permissionGroups(registry()).map(group=>[group.label,group.modules.map(module=>module.label)]),[
    ['خانه',['خانه']],
    ['برنامه',['برنامه']],
    ['تنظیمات',['مخاطبین','فعالیت‌ها','قراردادها']],
  ]);
});

test('only owner or local creator can manage roles',()=>{
  assert.equal(canManageProjectRoles({ownerUid:'owner'},{uid:'owner'}),true);
  assert.equal(canManageProjectRoles({ownerUid:'owner'},{uid:'other'}),false);
  assert.equal(canManageProjectRoles({creatorUid:'creator'},{uid:'creator'}),true);
  assert.equal(canManageProjectRoles({id:'local'},{uid:null}),true);
});

test('member creation normalizes mobile and fills every registered permission',()=>{
  const member=createMember({mobile:'+98 912 345 6789',role:'accountant',status:'active',permissions:{dashboard:'view'}},{registry:registry(),now:()=>10,random:()=>0.5});
  assert.equal(normalizeMobile('+98 912 345 6789'),'09123456789');
  assert.equal(member.mobile,'09123456789');
  assert.equal(member.status,'invited');
  assert.deepEqual(member.permissions,{dashboard:'view',planning:'none',people:'none',activities:'none',contracts:'none'});
  assert.throws(()=>createMember({mobile:'123'},{registry:registry()}),/معتبر/);
});
