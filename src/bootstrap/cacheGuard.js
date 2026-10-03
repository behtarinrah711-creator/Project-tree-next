(function(){
  const DEV_CACHE_VERSION = '__DEPLOYMENT_VERSION__';
  const CACHE_PREFIX = 'project-tree-next-';
  window.__KARHA_DEPLOYMENT_VERSION__ = DEV_CACHE_VERSION;

  if(!('serviceWorker' in navigator)) return;
  if('caches' in window){
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => key.startsWith(CACHE_PREFIX))
        .map(key => caches.delete(key))))
      .catch(()=>{});
  }
  const appScope = new URL('./', window.location.href).href;
  navigator.serviceWorker.getRegistrations()
    .then(registrations => Promise.all(registrations
      .filter(registration => registration.scope === appScope)
      .map(registration => registration.update())))
    .catch(()=>{});
})();
