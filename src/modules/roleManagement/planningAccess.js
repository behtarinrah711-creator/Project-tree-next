export const PLANNING_PERMISSION_BY_VIEW = Object.freeze({
  tree:'planning:tree',
  timeline:'planning:timeline',
  costline:'planning:costline',
});

export const PLANNING_ACCESS_LEVELS = Object.freeze([
  Object.freeze({id:'none',label:'بدون دسترسی'}),
  Object.freeze({id:'view',label:'مشاهده'}),
  Object.freeze({id:'create',label:'ثبت و ویرایش'}),
  Object.freeze({id:'full',label:'دسترسی کامل (ثبت، ویرایش و حذف)'}),
]);

function accessRecord(projectId,windowRef){
  return windowRef?.KarhaSaosaWorkspaceAccess?.[projectId] || null;
}

export function planningAccessLevel(projectId,viewId,windowRef=globalThis.window){
  const access=accessRecord(projectId,windowRef);
  if(!access || access.role==='owner') return 'full';
  const permissions=access.permissions || {};
  const explicitModules=permissions.modules && typeof permissions.modules==='object' ? permissions.modules : null;
  const modules=explicitModules || permissions;
  const key=PLANNING_PERMISSION_BY_VIEW[viewId];
  if(key && Object.hasOwn(modules,key)){
    const value=modules[key];
    if(value==='edit') return 'create';
    return PLANNING_ACCESS_LEVELS.some(level=>level.id===value)?value:'none';
  }
  if(explicitModules) return 'none';
  if(permissions.edit===true) return 'full';
  if(permissions.view===true) return 'view';
  return 'none';
}

export function canViewPlanning(level){return level!=='none';}
export function canWritePlanning(level){return level==='create'||level==='full';}
export function canDeletePlanning(level){return level==='full';}

export function firstAllowedPlanningView(projectId,views=['tree','timeline','costline'],windowRef=globalThis.window){
  return views.find(view=>canViewPlanning(planningAccessLevel(projectId,view,windowRef))) || null;
}
