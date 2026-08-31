export const APPLICATION_RUNTIME_URLS = Object.freeze([
  new URL('../core/applicationRefreshRuntime.js', import.meta.url).href,
  new URL('../core/applicationFoundation.js', import.meta.url).href,
  new URL('../core/childHistoryController.js', import.meta.url).href,
  new URL('../modules/contracts/contractHistoryController.js', import.meta.url).href,
  new URL('../ui/workspaceFormPresentation.js', import.meta.url).href,
  new URL('../ui/workspacePresentationRuntime.js', import.meta.url).href,
  new URL('../core/applicationRefreshBinding.js', import.meta.url).href,
  new URL('../modules/contracts/searchTemplateModule.js', import.meta.url).href,
  new URL('../modules/contracts/contractFormLifecycle.js', import.meta.url).href,
  new URL('../modules/contracts/contractCompatibility.js', import.meta.url).href,
  new URL('../modules/runtime/featureComposition.js', import.meta.url).href,
  new URL('./applicationRuntime.js', import.meta.url).href,
]);

function installLegacyGlobalHelpers(windowRef, documentRef){
  if(typeof windowRef.elFromHtml !== 'function'){
    windowRef.elFromHtml = function elFromHtml(html){
      const template = documentRef.createElement('template');
      template.innerHTML = String(html || '').trim();
      return template.content.firstElementChild;
    };
  }

  // applicationRuntime passes this bare identifier while constructing taskRuntime UI.
  // The actual task UI also owns its own focus helper, but the global must
  // exist so classic-script evaluation does not stop before KarhaLegacy is published.
  if(typeof windowRef.focusInlineAdd !== 'function'){
    windowRef.focusInlineAdd = function focusInlineAdd(){
      windowRef.setTimeout(() => {
        const input = documentRef.getElementById('inlineAddInput');
        if(input && typeof input.focus === 'function') input.focus();
      }, 0);
    };
  }
}

function installGuestFirebaseFallback(windowRef){
  if(windowRef.firebase) return;

  const resolved = value => Promise.resolve(value);
  const rejected = error => Promise.reject(error);
  const authInstance = {
    currentUser: null,
    onAuthStateChanged(callback){
      queueMicrotask(() => callback(null));
      return () => {};
    },
    signInWithPopup(){ return rejected(new Error('Firebase SDK unavailable')); },
    signInWithRedirect(){ return rejected(new Error('Firebase SDK unavailable')); },
    signOut(){ return resolved(); },
  };

  const unavailableQuery = () => ({
    where(){ return unavailableQuery(); },
    orderBy(){ return unavailableQuery(); },
    limit(){ return unavailableQuery(); },
    onSnapshot(_next, error){
      if(typeof error === 'function') queueMicrotask(() => error(new Error('Firebase SDK unavailable')));
      return () => {};
    },
    get(){ return resolved({ empty: true, docs: [], forEach(){} }); },
  });

  const unavailableDoc = () => ({
    get(){ return resolved({ exists: false, data(){ return undefined; } }); },
    set(){ return resolved(); },
    update(){ return resolved(); },
    delete(){ return resolved(); },
    collection(){ return unavailableQuery(); },
    onSnapshot(_next, error){
      if(typeof error === 'function') queueMicrotask(() => error(new Error('Firebase SDK unavailable')));
      return () => {};
    },
  });

  const firestoreInstance = {
    enablePersistence(){ return resolved(); },
    collection(){
      const query = unavailableQuery();
      query.doc = unavailableDoc;
      return query;
    },
    runTransaction(){ return rejected(new Error('Firebase SDK unavailable')); },
  };

  const FieldValue = {
    delete(){ return null; },
    serverTimestamp(){ return new Date(); },
    arrayRemove(...values){ return { __op: 'arrayRemove', values }; },
    arrayUnion(...values){ return { __op: 'arrayUnion', values }; },
  };

  const authFactory = () => authInstance;
  authFactory.GoogleAuthProvider = class GoogleAuthProvider {};
  const firestoreFactory = () => firestoreInstance;
  firestoreFactory.FieldValue = FieldValue;

  windowRef.firebase = {
    __karhaGuestFallback: true,
    apps: [],
    initializeApp(){ this.apps.push({ name: '[DEFAULT]' }); return this.apps[0]; },
    auth: authFactory,
    firestore: firestoreFactory,
  };

  console.warn('Karha: Firebase SDK unavailable; continuing in local guest mode.');
}

/**
 * Loads the remaining application runtime with classic-script semantics.
 *
 * The runtime intentionally is not an ES module: it has no imports or exports,
 * and its existing HTML/router integrations rely on classic global function
 * declarations. Keeping the load here makes the ordering explicit: app.js
 * publishes the modular KarhaApp API first, this script executes second, and
 * routing starts only after the legacy compatibility boundary is available.
 */
export function loadApplicationRuntime({
  documentRef = document,
  windowRef = window,
  sourceUrl,
  sourceUrls = sourceUrl ? [sourceUrl] : APPLICATION_RUNTIME_URLS,
} = {}){
  // applicationRuntime still passes bare helper identifiers into taskRuntime before it
  // installs KarhaLegacy. Missing globals stop evaluation halfway through and
  // leave footer navigation/forms non-interactive.
  installLegacyGlobalHelpers(windowRef, documentRef);

  // Firebase is optional for the local/guest workspace. If the CDN is blocked
  // (as it can be in CI, offline mode, or restrictive networks), applicationRuntime must
  // still finish booting so project navigation and local data remain usable.
  installGuestFirebaseFallback(windowRef);

  if(windowRef.__karhaApplicationRuntimePromise) return windowRef.__karhaApplicationRuntimePromise;
  windowRef.__karhaApplicationRuntimePromise = sourceUrls.reduce((previous, url) =>
    previous.then(() => new Promise((resolve, reject) => {
      const script = documentRef.createElement('script');
      script.src = url;
      script.async = false;
      script.dataset.karhaApplicationRuntime = '';
      script.addEventListener('load', () => {
        script.dataset.loaded = 'true';
        resolve(script);
      }, { once: true });
      script.addEventListener('error', () => reject(new Error(`Application runtime failed to load: ${url}`)), { once: true });
      documentRef.body.appendChild(script);
    })), Promise.resolve());
  return windowRef.__karhaApplicationRuntimePromise;
}
