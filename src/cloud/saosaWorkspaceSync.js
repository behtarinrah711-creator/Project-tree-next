import { APP_DATA_STORAGE_KEY, createEmptySnapshot } from '../data/appDataStore.js';

export const SAOSA_SESSION_KEY = 'saosa:v1:sms-session';
const ACCOUNT_MARKER_KEY = `${APP_DATA_STORAGE_KEY}:account-id`;
const SYNC_STATE_KEY = `${APP_DATA_STORAGE_KEY}:sync-state`;

export function isSaosaHost(windowRef = window){
  return ['saosa.ir', 'www.saosa.ir'].includes(String(windowRef.location?.hostname || '').toLowerCase());
}

export function readSaosaSession(windowRef = window){
  try{
    const value = JSON.parse(windowRef.localStorage?.getItem(SAOSA_SESSION_KEY) || 'null');
    return value?.token && value?.phone && Number(value.expiresAt) > Date.now() ? value : null;
  }catch{
    return null;
  }
}

function clearWorkspaceCache(windowRef){
  windowRef.localStorage?.removeItem(APP_DATA_STORAGE_KEY);
  windowRef.localStorage?.removeItem(SYNC_STATE_KEY);
  windowRef.localStorage?.removeItem(ACCOUNT_MARKER_KEY);
  windowRef.sessionStorage?.removeItem(APP_DATA_STORAGE_KEY);
  windowRef.sessionStorage?.removeItem(SYNC_STATE_KEY);
}

async function workspaceRequest(windowRef, session, options = {}){
  const response = await windowRef.fetch('/api/v1/workspace', {
    ...options,
    headers: {
      authorization: `Bearer ${session.token}`,
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if(!response.ok){
    const error = new Error(payload.error || 'workspace_request_failed');
    error.status = response.status;
    throw error;
  }
  return payload;
}

function snapshotHasProjects(snapshot){
  return Array.isArray(snapshot?.projects) && snapshot.projects.length > 0;
}

function createPersistAttach(windowRef, session, store, initialSnapshot = null){
  let timer = null;
  let queuedSnapshot = initialSnapshot;
  let saving = false;
  const flush = async () => {
    if(saving || !queuedSnapshot) return;
    saving = true;
    const next = queuedSnapshot;
    queuedSnapshot = null;
    try{
      await workspaceRequest(windowRef, session, {
        method:'PUT',
        body:JSON.stringify({snapshot:next}),
      });
    }catch(error){
      // Never replace a newer edit with the older failed request.
      if(!queuedSnapshot) queuedSnapshot = next;
    }finally{
      saving = false;
      if(queuedSnapshot) timer = (windowRef.setTimeout || setTimeout)(flush, 500);
    }
  };
  return () => {
    const unsubscribe = store?.subscribePersist?.(next => {
      queuedSnapshot = JSON.parse(JSON.stringify(next));
      (windowRef.clearTimeout || clearTimeout)(timer);
      timer = (windowRef.setTimeout || setTimeout)(flush, 250);
    });
    if(queuedSnapshot) timer = (windowRef.setTimeout || setTimeout)(flush, 250);
    return unsubscribe;
  };
}

/**
 * Hydrate the signed-in account before the legacy runtime reads localStorage.
 * The one-time unowned-cache import moves the current browser projects into
 * PostgreSQL. Once an account marker exists, another account can never claim it.
 */
export async function prepareSaosaWorkspace({windowRef = window, store} = {}){
  if(!isSaosaHost(windowRef)) return {enabled:false, attach(){}};
  const session = readSaosaSession(windowRef);
  if(!session){
    clearWorkspaceCache(windowRef);
    store?.replaceSnapshot?.(createEmptySnapshot());
    return {enabled:true, authenticated:false, attach(){}};
  }

  const cachedSnapshot = store?.loadFromStorage?.() || createEmptySnapshot();
  const cachedAccountId = windowRef.localStorage?.getItem(ACCOUNT_MARKER_KEY) || '';
  let remote;
  try{
    remote = await workspaceRequest(windowRef, session);
  }catch(error){
    if(error.status === 401){
      windowRef.localStorage?.removeItem(SAOSA_SESSION_KEY);
      clearWorkspaceCache(windowRef);
      store?.replaceSnapshot?.(createEmptySnapshot());
      return {enabled:true, authenticated:false, attach(){}};
    }
    // Keep the authenticated offline cache on temporary API/network failure.
    return {
      enabled:true,
      authenticated:true,
      offline:true,
      attach:createPersistAttach(windowRef, session, store, cachedSnapshot),
    };
  }

  let snapshot = remote.snapshot || createEmptySnapshot();
  const mayImportCache = snapshotHasProjects(cachedSnapshot)
    && !snapshotHasProjects(snapshot)
    && (!cachedAccountId || cachedAccountId === remote.accountId);
  if(mayImportCache){
    const saved = await workspaceRequest(windowRef, session, {
      method: 'PUT',
      body: JSON.stringify({snapshot:cachedSnapshot}),
    });
    snapshot = saved.snapshot || cachedSnapshot;
  }

  store?.replaceSnapshot?.(snapshot);
  store?.persistLocal?.();
  windowRef.localStorage?.setItem(ACCOUNT_MARKER_KEY, remote.accountId);

  const attach = createPersistAttach(windowRef, session, store);
  return {enabled:true, authenticated:true, accountId:remote.accountId, attach};
}

export function clearSaosaWorkspaceSession(windowRef = window){
  windowRef.localStorage?.removeItem(SAOSA_SESSION_KEY);
  clearWorkspaceCache(windowRef);
}
