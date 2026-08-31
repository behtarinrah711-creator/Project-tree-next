/* Binds the real workspace renderer after presentation runtime evaluation. */
(function bindApplicationRefresh(){
  if(typeof window.renderAll === 'function'){
    window.KarhaApplicationRefresh?.register?.(window.renderAll);
  }
})();
