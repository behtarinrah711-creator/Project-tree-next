/* Startup-safe bridge between early foundation callbacks and later workspace presentation. */
(function installApplicationRefresh(){
  if(window.KarhaApplicationRefresh) return;
  let renderer = null;
  let pending = false;

  function request(){
    if(typeof renderer === 'function') return renderer();
    pending = true;
    return false;
  }

  function register(nextRenderer){
    if(typeof nextRenderer !== 'function') return false;
    renderer = nextRenderer;
    if(pending){
      pending = false;
      return renderer();
    }
    return true;
  }

  window.KarhaApplicationRefresh = Object.freeze({request, register});
  // Foundation is evaluated before workspacePresentationRuntime. Keep the
  // existing classic call surface safe until the real renderer is registered.
  if(typeof window.renderAll !== 'function') window.renderAll = request;
})();
