let override = null;

export function registerSearchPicker(next = {}){
  override = typeof next.open === 'function' ? next.open : null;
}

export function openSearchPicker(opts){
  if(typeof override === 'function') return override(opts);
  const runtime = typeof window !== 'undefined'
    ? (window.KarhaSearchTemplate?.open || window.openSearchTemplate)
    : null;
  if(typeof runtime === 'function') return runtime(opts);
  return false;
}
