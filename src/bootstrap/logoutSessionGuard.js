import { DEPLOYMENT_CONFIG } from '../config/deploymentConfig.js';
const APP_STORAGE_PREFIXES = [`${DEPLOYMENT_CONFIG.storageNamespace}:`];

export function clearAppSessionCache(storage){
  if(!storage) return 0;
  const keys=[];
  for(let i=0;i<storage.length;i++){
    const key=storage.key(i);
    if(key && APP_STORAGE_PREFIXES.some(prefix=>key.startsWith(prefix))) keys.push(key);
  }
  keys.forEach(key=>storage.removeItem(key));
  return keys.length;
}

/**
 * Remove user-scoped local data only on a real authenticated -> signed-out
 * transition. Initial anonymous startup is intentionally left untouched so
 * genuine guest work is not erased merely by opening the app while signed out.
 */
export function installLogoutSessionGuard({ windowRef = window } = {}){
  const auth = windowRef.firebase?.auth?.();
  if(!auth || typeof auth.onAuthStateChanged !== 'function') return false;
  if(windowRef.__karhaLogoutSessionGuardInstalled) return false;
  windowRef.__karhaLogoutSessionGuardInstalled = true;

  let previousUid = auth.currentUser?.uid || null;
  auth.onAuthStateChanged(user=>{
    const nextUid = user?.uid || null;
    if(nextUid){
      previousUid = nextUid;
      return;
    }
    if(!previousUid) return;

    previousUid = null;
    clearAppSessionCache(windowRef.localStorage);
    clearAppSessionCache(windowRef.sessionStorage);

    // The legacy runtime still holds the previous account's project array in
    // memory. Reload once after clearing app storage so guest UI starts from a
    // clean state and recovery-retention cannot resurrect that session.
    windowRef.location?.reload?.();
  });
  return true;
}
