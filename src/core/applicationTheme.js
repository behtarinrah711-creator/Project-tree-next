export function installApplicationTheme({windowRef=globalThis.window,documentRef=windowRef?.document}={}){
  if(!documentRef?.documentElement) return null;
  const root=documentRef.documentElement;
  if(!root.getAttribute('data-theme')) root.setAttribute('data-theme','light');
  windowRef.AppTheme={
    get(){ return root.getAttribute('data-theme')||'light'; },
    set(theme){ root.setAttribute('data-theme',theme==='dark'?'dark':'light'); },
    toggle(){ this.set(this.get()==='dark'?'light':'dark'); return this.get(); },
  };
  return windowRef.AppTheme;
}
