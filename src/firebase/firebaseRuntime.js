import { DEPLOYMENT_CONFIG } from '../config/deploymentConfig.js';

export const FIREBASE_CONFIG = DEPLOYMENT_CONFIG.firebase;

function createDisabledFirebase(){
  const resolved = value => Promise.resolve(value);
  const rejected = error => Promise.reject(error);
  const authInstance = {
    currentUser: null,
    onAuthStateChanged(callback){ queueMicrotask(() => callback(null)); return () => {}; },
    signInWithPopup(){ return rejected(new Error('Cloud is disabled for this isolated deployment')); },
    signInWithRedirect(){ return rejected(new Error('Cloud is disabled for this isolated deployment')); },
    signOut(){ return resolved(); },
  };
  const unavailableQuery = () => ({
    where(){ return unavailableQuery(); },
    orderBy(){ return unavailableQuery(); },
    limit(){ return unavailableQuery(); },
    onSnapshot(_next, error){ if(typeof error === 'function') queueMicrotask(() => error(new Error('Cloud is disabled'))); return () => {}; },
    get(){ return resolved({ empty:true, docs:[], forEach(){} }); },
  });
  const unavailableDoc = () => ({
    get(){ return resolved({ exists:false, data(){ return undefined; } }); },
    set(){ return resolved(); }, update(){ return resolved(); }, delete(){ return resolved(); },
    collection(){ return unavailableQuery(); },
    onSnapshot(_next, error){ if(typeof error === 'function') queueMicrotask(() => error(new Error('Cloud is disabled'))); return () => {}; },
  });
  const firestoreInstance = {
    enablePersistence(){ return resolved(); },
    collection(){ const q=unavailableQuery(); q.doc=unavailableDoc; return q; },
    collectionGroup(){ return unavailableQuery(); },
    runTransaction(){ return rejected(new Error('Cloud is disabled')); },
  };
  const FieldValue = {
    delete(){ return null; }, serverTimestamp(){ return new Date(); },
    arrayRemove(...values){ return {__op:'arrayRemove',values}; },
    arrayUnion(...values){ return {__op:'arrayUnion',values}; },
  };
  const auth = () => authInstance;
  auth.GoogleAuthProvider = class GoogleAuthProvider {};
  const firestore = () => firestoreInstance;
  firestore.FieldValue = FieldValue;
  return { __karhaIsolatedFallback:true, apps:[{name:'[ISOLATED]'}], initializeApp(){ return this.apps[0]; }, auth, firestore };
}

export function installFirebaseRuntime({windowRef=window, consoleRef=console}={}){
  if(!DEPLOYMENT_CONFIG.cloudEnabled || !FIREBASE_CONFIG){
    const firebaseRef=createDisabledFirebase();
    windowRef.firebase=firebaseRef;
    const runtime={firebase:firebaseRef,auth:firebaseRef.auth(),db:firebaseRef.firestore(),cloudEnabled:false};
    windowRef.KarhaFirebaseRuntime=Object.freeze(runtime);
    windowRef.__KARHA_CLOUD_DISABLED__=true;
    return runtime;
  }

  const firebaseRef=windowRef.firebase;
  if(!firebaseRef?.initializeApp || !firebaseRef?.auth || !firebaseRef?.firestore){
    throw new Error('Firebase SDK unavailable while cloudEnabled=true');
  }
  if(!firebaseRef.apps?.length) firebaseRef.initializeApp(FIREBASE_CONFIG);
  const runtime={firebase:firebaseRef,auth:firebaseRef.auth(),db:firebaseRef.firestore(),cloudEnabled:true};
  runtime.db.enablePersistence?.({synchronizeTabs:true}).catch(error=>{
    consoleRef.warn('Offline persistence not enabled:',error.code);
  });
  windowRef.KarhaFirebaseRuntime=Object.freeze(runtime);
  return runtime;
}
