/** Canonical browser session-history boundary for route and same-route UI state. */
export const HISTORY_APP = 'karha';
export const HISTORY_VERSION = 1;

let nextEntry = 0;

function routeFromLocation(locationRef){
  const hash=String(locationRef?.hash||'');
  const parts=hash.replace(/^#\/?/,'').split('?')[0].split('/').filter(Boolean);
  const projectIndex=parts.findIndex(part=>part==='project'||part==='projects');
  const decode=value=>{try{return decodeURIComponent(value);}catch{return value;}};
  return Object.freeze({
    projectId:projectIndex>=0 ? decode(parts[projectIndex+1]||'')||null : null,
    moduleId:projectIndex>=0 ? decode(parts[projectIndex+2]||'dashboard') : decode(parts[0]||'dashboard'),
    hash,
  });
}

export function isApplicationHistoryState(state){
  return !!state && state.app===HISTORY_APP && state.version===HISTORY_VERSION && typeof state.entryId==='string';
}

export function createHistoryState({locationRef=globalThis.location,route,child=null,entryId}={}){
  const position=route||routeFromLocation(locationRef);
  return Object.freeze({
    app:HISTORY_APP,
    version:HISTORY_VERSION,
    entryId:entryId||`entry-${Date.now().toString(36)}-${(++nextEntry).toString(36)}`,
    route:Object.freeze({projectId:position.projectId||null,moduleId:position.moduleId||'dashboard',hash:String(position.hash||'')}),
    child:child ? Object.freeze({id:String(child.id),key:String(child.key),payload:child.payload??null}) : null,
  });
}

export function installBrowserHistory({windowRef=window}={}){
  if(windowRef.KarhaBrowserHistory) return windowRef.KarhaBrowserHistory;
  if(!windowRef.history){
    const unavailable=Object.freeze({current:()=>null,push:()=>null,replace:()=>null,back(){},go(){},register:()=>()=>{},registerTraversalGuard:()=>()=>{},registerExitGuard:()=>()=>{},supportsTraversalInterception:false,stateForRoute:route=>({route,child:null}),stateForChild:child=>({child})});
    windowRef.KarhaBrowserHistory=unavailable;
    return unavailable;
  }
  const restorers=new Map();
  const traversalGuards=new Map();
  const exitGuards=new Map();
  const current=()=>isApplicationHistoryState(windowRef.history.state)
    ? windowRef.history.state
    : createHistoryState({locationRef:windowRef.location});
  let activeRouteHash=current().route.hash;
  const replace=(patch={},url=windowRef.location.href)=>{
    const base=current();
    const state=createHistoryState({...base,...patch,entryId:base.entryId,locationRef:windowRef.location});
    windowRef.history.replaceState(state,'',url);
    activeRouteHash=state.route.hash;
    return state;
  };
  const push=(patch={},url=windowRef.location.href)=>{
    const base=current();
    const state=createHistoryState({...base,...patch,entryId:undefined,locationRef:windowRef.location});
    windowRef.history.pushState(state,'',url);
    activeRouteHash=state.route.hash;
    return state;
  };
  const dispatch=event=>{
    const state=event?.state;
    if(!isApplicationHistoryState(state)) return;
    const routeChanged=state.route.hash!==activeRouteHash;
    activeRouteHash=state.route.hash;
    if(routeChanged) restorers.get('route')?.(state,event);
    restorers.get('child')?.(state,event);
  };
  windowRef.addEventListener('popstate',dispatch);
  const navigationRef=windowRef.navigation;
  const supportsTraversalInterception=!!navigationRef?.addEventListener;
  if(supportsTraversalInterception){
    navigationRef.addEventListener('navigate',event=>{
      if(event?.navigationType!=='traverse') return;
      let destinationState=null;
      try{ destinationState=event.destination?.getState?.()??null; }catch{}
      const context=Object.freeze({
        navigationType:'traverse',
        destinationState,
        sameDocument:event.destination?.sameDocument===true,
        cancelable:event.cancelable!==false,
      });
      if(!context.cancelable) return;

      let claim=null;
      for(const guard of traversalGuards.values()){
        const result=guard(context);
        if(result===true){ claim=Object.freeze({claimed:true,afterCancel:null}); break; }
        if(result && typeof result==='object'){
          claim=Object.freeze({claimed:true,afterCancel:typeof result.afterCancel==='function' ? result.afterCancel : null});
          break;
        }
      }
      if(!claim?.claimed) return;

      event.preventDefault();
      claim.afterCancel?.(context);
    });
  }
  // Same-document Back remains a popstate/child-history concern. This guard is
  // consulted only when the browser is actually about to discard the document.
  windowRef.addEventListener('beforeunload',event=>{
    if(![...exitGuards.values()].some(guard=>guard())) return;
    event.preventDefault();
    event.returnValue='';
  });
  const api=Object.freeze({
    current, push, replace,
    back(){windowRef.history.back();},
    go(delta){windowRef.history.go(delta);},
    register(owner,restore){restorers.set(owner,restore);return()=>restorers.delete(owner);},
    registerTraversalGuard(owner,guard){
      if(typeof guard!=='function') return ()=>{};
      traversalGuards.set(owner,guard);
      return ()=>traversalGuards.delete(owner);
    },
    supportsTraversalInterception,
    registerExitGuard(owner,guard){
      if(typeof guard!=='function') return ()=>{};
      exitGuards.set(owner,guard);
      return ()=>exitGuards.delete(owner);
    },
    stateForRoute(route){return {route,child:null};},
    stateForChild(child){return {child};},
  });
  windowRef.KarhaBrowserHistory=api;
  replace({},windowRef.location.href);
  return api;
}
