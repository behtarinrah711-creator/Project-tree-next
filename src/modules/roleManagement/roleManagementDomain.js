export const PROJECT_ROLES = Object.freeze([
  Object.freeze({ id:'employer', label:'کارفرما' }),
  Object.freeze({ id:'accountant', label:'حسابدار' }),
  Object.freeze({ id:'site-supervisor', label:'سرپرست کارگاه' }),
  Object.freeze({ id:'site-manager', label:'مدیر کارگاه' }),
  Object.freeze({ id:'site-chief', label:'رئیس کارگاه' }),
  Object.freeze({ id:'contractor', label:'پیمانکار' }),
]);

export const MEMBER_STATUSES = Object.freeze([
  Object.freeze({ id:'invited', label:'دعوت‌شده' }),
  Object.freeze({ id:'active', label:'فعال' }),
  Object.freeze({ id:'inactive', label:'غیرفعال' }),
]);

export const EDITABLE_MEMBER_STATUSES = Object.freeze(
  MEMBER_STATUSES.filter(item=>item.id !== 'invited')
);

export const ACCESS_LEVELS = Object.freeze([
  Object.freeze({ id:'none', label:'بدون دسترسی' }),
  Object.freeze({ id:'view', label:'مشاهده' }),
  Object.freeze({ id:'edit', label:'مشاهده و ویرایش' }),
  Object.freeze({ id:'create', label:'مشاهده/ثبت/ویرایش' }),
  Object.freeze({ id:'full', label:'دسترسی کامل' }),
]);

export const ROLE_MANAGEMENT_MODULE_ID = 'role-management';

const PERMISSION_GROUPS = Object.freeze([
  Object.freeze({ id:'home', label:'خانه', modules:[Object.freeze({id:'dashboard',label:'خانه'})] }),
  Object.freeze({ id:'planning', label:'برنامه', modules:[
    Object.freeze({id:'planning:tree',label:'درخت پروژه'}),
    Object.freeze({id:'planning:timeline',label:'نمودار گانت'}),
    Object.freeze({id:'planning:costline',label:'برآورد هزینه'}),
  ] }),
  Object.freeze({ id:'execution', label:'اجرا', modules:[
    Object.freeze({id:'execution:today',label:'کارها'}),
    Object.freeze({id:'execution:shopping',label:'خریدها'}),
  ] }),
  Object.freeze({ id:'reports', label:'گزارش', modules:[
    Object.freeze({id:'reports:reports',label:'گزارش‌ها'}),
    Object.freeze({id:'reports:delay',label:'دیرکردها'}),
  ] }),
  Object.freeze({ id:'settings', label:'تنظیمات', registryModules:['project-settings','people','activities','contracts'] }),
]);

export function normalizeMobile(value){
  return String(value || '');
}

export function isValidIranianMobile(value){ return /^09\d{9}$/.test(String(value || '')); }

export function normalizeInvitationEmail(value){ return String(value || '').trim().toLowerCase(); }

export function isValidInvitationEmail(value){
  const email=normalizeInvitationEmail(value);
  return !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function canManageProjectRoles(project, session){
  if(!project) return false;
  const ownerId=project.ownerUid || project.creatorUid || null;
  return ownerId ? !!session?.uid && String(ownerId)===String(session.uid) : true;
}

export function permissionModules(registry){
  const registryModules=(registry?.list?.() || [])
    .filter(module=>module.id !== ROLE_MANAGEMENT_MODULE_ID && module.assignablePermission !== false);
  const byId=new Map(registryModules.map(module=>[module.id,module]));
  const modules=[];
  PERMISSION_GROUPS.forEach(group=>{
    (group.modules || []).forEach(module=>modules.push(Object.freeze({...module})));
    (group.registryModules || []).forEach(id=>{
      const module=byId.get(id);
      if(module) modules.push(Object.freeze({id:module.id,label:module.title || module.label || module.id}));
    });
  });
  const used=new Set(modules.map(module=>module.id));
  registryModules.forEach(module=>{
    if(!used.has(module.id) && !['planning','execution','reports'].includes(module.id)){
      modules.push(Object.freeze({id:module.id,label:module.title || module.label || module.id}));
    }
  });
  return modules;
}

export function permissionGroups(registry){
  const modules=permissionModules(registry);
  const byId=new Map(modules.map(module=>[module.id,module]));
  const used=new Set();
  const groups=PERMISSION_GROUPS.map(group=>{
    const ids=(group.modules || []).map(module=>module.id).concat(group.registryModules || []);
    const items=ids.map(id=>byId.get(id)).filter(Boolean);
    items.forEach(item=>used.add(item.id));
    return Object.freeze({id:group.id,label:group.label,modules:Object.freeze(items)});
  }).filter(group=>group.modules.length);
  const remaining=modules.filter(module=>!used.has(module.id));
  if(remaining.length) groups.push(Object.freeze({id:'other',label:'سایر',modules:Object.freeze(remaining)}));
  return groups;
}

export function normalizePermissions(permissions, registry){
  const supplied=permissions && typeof permissions==='object' ? permissions : {};
  return Object.fromEntries(permissionModules(registry).map(module=>[
    module.id,
    ACCESS_LEVELS.some(level=>level.id===supplied[module.id]) ? supplied[module.id] : 'none',
  ]));
}

export function canDeleteWithAccess(level){ return level === 'full'; }

export function createMember(input, { registry, now=Date.now, random=Math.random } = {}){
  const mobile=normalizeMobile(input?.mobile);
  if(!isValidIranianMobile(mobile)) throw new TypeError('شماره موبایل معتبر نیست.');
  const role=PROJECT_ROLES.some(item=>item.id===input?.role) ? input.role : PROJECT_ROLES[0].id;
  return {
    id:`member-${now()}-${random().toString(36).slice(2,8)}`,
    mobile,
    email:normalizeInvitationEmail(input?.email),
    firstName:String(input?.firstName || '').trim(),
    lastName:String(input?.lastName || '').trim(),
    role,
    status:'invited',
    permissions:normalizePermissions(input?.permissions, registry),
    invitedAt:now(),
  };
}
