(function(){
  if(!('serviceWorker' in navigator)) return;
  const appScope = new URL('./', window.location.href).href;
  navigator.serviceWorker.getRegistrations()
    .then(registrations => Promise.all(registrations
      .filter(registration => registration.scope === appScope)
      .map(registration => registration.update())))
    .catch(()=>{});
})();
