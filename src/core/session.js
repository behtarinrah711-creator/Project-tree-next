/**
 * Read-only session surface. Does not start Auth, migrate data, or decide
 * cloud listeners. Google is an adapter elsewhere; here the user is only uid.
 */
let observed = {
  ready: false,
  uid: null,
};

function saosaAccountId(windowRef){
  try{
    const hostname=String(windowRef?.location?.hostname || '').toLowerCase();
    if(hostname!=='saosa.ir' && hostname!=='www.saosa.ir') return null;
    const value=JSON.parse(windowRef?.localStorage?.getItem('saosa:v1:sms-session') || 'null');
    return value?.token && value?.accountId && Number(value.expiresAt)>Date.now() ? String(value.accountId) : null;
  }catch{ return null; }
}

export function getSession(windowRef = typeof window !== 'undefined' ? window : undefined){
  const accountId=saosaAccountId(windowRef);
  if(accountId) return { ready:true, uid:accountId };
  if(observed.ready) return { ready:true, uid:observed.uid };
  const liveUid = windowRef?.firebase?.auth?.()?.currentUser?.uid || null;
  if(liveUid) return { ready:false, uid:liveUid };
  return { ready:false, uid:null };
}

export function resetSessionObservation(){
  observed = { ready:false, uid:null };
}

export function installSessionObserver({ windowRef = window } = {}){
  if(windowRef.__karhaSessionObserverInstalled) return false;
  windowRef.__karhaSessionObserverInstalled = true;

  const auth = windowRef.firebase?.auth?.();
  if(!auth || typeof auth.onAuthStateChanged !== 'function'){
    observed = { ready:true, uid:null };
    return true;
  }

  auth.onAuthStateChanged(user => {
    observed = { ready:true, uid:user?.uid || null };
  });
  return true;
}
