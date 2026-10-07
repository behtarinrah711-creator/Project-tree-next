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
  Object.freeze({ id:'deleted', label:'حذف‌شده' }),
]);

export const EDITABLE_MEMBER_STATUSES = Object.freeze(
  MEMBER_STATUSES.filter(item=>['active','inactive'].includes(item.id))
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
    Object.freeze({id:'planning:tree',label:'درخت پروژه',accessProfile:'planning'}),
    Object.freeze({id:'planning:timeline',label:'نمودار گانت',accessProfile:'planning'}),
    Object.freeze({id:'planning:costline',label:'برآورد هزینه',accessProfile:'planning'}),
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

function contactHasMobile(contact,mobile){
  const phones=Array.isArray(contact?.phones) ? contact.phones : [contact?.phone];
  return phones.some(value=>normalizeMobile(value)===mobile);
}

export function ensureInvitationContact(project,mobile,{now=Date.now,random=Math.random}={}){
  const normalized=normalizeMobile(mobile);
  if(!isValidIranianMobile(normalized)) throw new TypeError('شماره موبایل معتبر نیست.');
  const contacts=Array.isArray(project?.contacts) ? project.contacts : [];
  const existing=contacts.find(contact=>!contact?.trashed && contactHasMobile(contact,normalized));
  if(existing) return {contacts,contactId:existing.id,created:false};
  const contact={
    id:`contact-${now()}-${random().toString(36).slice(2,8)}`,
    firstName:'',lastName:'',name:'',phones:[normalized],phone:normalized,
    type:'',activities:[],bankAccounts:[],pending:true,source:'member-invitation',createdAt:now(),
  };
  return {contacts:[...contacts,contact],contactId:contact.id,created:true};
}

export function createMember(input, { registry, now=Date.now, random=Math.random } = {}){
  const mobile=normalizeMobile(input?.mobile);
  if(!isValidIranianMobile(mobile)) throw new TypeError('شماره موبایل معتبر نیست.');
  return {
    id:`member-${now()}-${random().toString(36).slice(2,8)}`,
    mobile,
    role:'member',
    status:'invited',
    permissions:normalizePermissions(input?.permissions, registry),
    invitedAt:now(),
  };
}
