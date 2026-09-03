(function(){
  const DEV_CACHE_VERSION = '20260903-2030';
  const refreshKey = `karha:dev-cache-refresh:${DEV_CACHE_VERSION}`;

  if('serviceWorker' in navigator){
    const appScope = new URL('./', window.location.href).href;
    navigator.serviceWorker.getRegistrations()
      .then(registrations => Promise.all(registrations
        .filter(registration => registration.scope === appScope)
        .map(registration => registration.update())))
      .catch(()=>{});
  }

  // Temporary development policy: after each deploy version, force the browser
  // to revalidate loaded local JS and CSS once, then reload the page.
  // Remove this development refresh when the design stabilizes so normal cache
  // behavior can be restored for production performance.
  window.addEventListener('load', async () => {
    if(sessionStorage.getItem(refreshKey) === 'done') return;
    sessionStorage.setItem(refreshKey, 'done');

    const urls = new Set(
      performance.getEntriesByType('resource')
        .map(entry => entry.name)
        .filter(url => {
          try{
            const parsed = new URL(url, window.location.href);
            return parsed.origin === window.location.origin && /\.(?:js|css)(?:$|\?)/.test(parsed.href);
          }catch(_error){
            return false;
          }
        })
    );

    try{
      await Promise.all([...urls].map(url => fetch(url, { cache:'reload', credentials:'same-origin' })));
    }catch(_error){}

    window.location.reload();
  }, { once:true });
})();
