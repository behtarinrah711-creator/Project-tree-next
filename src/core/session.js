/**
 * Read-only session surface. Does not start Auth, migrate data, or decide
 * cloud listeners. Google is an adapter elsewhere; here the user is only uid.
 */
let observed = {
  ready: false,
  uid: null,
};

export function getSession(windowRef = typeof window !== 'undefined' ? window : undefined){
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
