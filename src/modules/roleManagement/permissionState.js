const EDIT_LEVELS=new Set(['edit','create','full']);
const KNOWN_LEVELS=new Set(['none','view','create','full']);

function accessRecord(projectId,windowRef){
  return windowRef?.KarhaSaosaWorkspaceAccess?.[projectId] || null;
}

function normalizeLevel(value){
  if(value==='edit') return 'create';
  return KNOWN_LEVELS.has(value)?value:'none';
}

export function projectPermissionState(projectId,moduleKeys,windowRef=globalThis.window){
  const access=accessRecord(projectId,windowRef);
  if(!access || access.role==='owner'){
    const levels=Object.fromEntries(moduleKeys.map(key=>[key,'full']));
    return Object.freeze({levels,visible:true});
  }

  const permissions=access.permissions || {};
  const explicitModules=permissions.modules && typeof permissions.modules==='object' && !Array.isArray(permissions.modules)
    ? permissions.modules
    : null;
  const modules=explicitModules || permissions;
  const fallback=explicitModules
    ? 'none'
    : permissions.edit===true?'full':permissions.view===true?'view':'none';
  const levels=Object.fromEntries(moduleKeys.map(key=>[
    key,
    Object.hasOwn(modules,key)?normalizeLevel(modules[key]):fallback,
  ]));
  return Object.freeze({
    levels:Object.freeze(levels),
    visible:Object.values(levels).some(level=>level!=='none'),
  });
}

export function canViewPermission(level){return level!=='none';}
export function canWritePermission(level){return EDIT_LEVELS.has(level);}
export function canDeletePermission(level){return level==='full';}
