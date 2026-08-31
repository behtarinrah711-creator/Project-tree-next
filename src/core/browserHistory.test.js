import assert from 'node:assert/strict';
import test from 'node:test';
import {createHistoryState,installBrowserHistory,isApplicationHistoryState} from './browserHistory.js';

function harness(hash='#/projects/A/dashboard',{navigation=false}={}){
  const listeners=new Map();
  const navigationListeners=new Map();
  const stack=[{state:null,url:hash}]; let cursor=0;
  const windowRef={
    location:{hash,href:hash},
    addEventListener(type,fn){listeners.set(type,fn);},
  };
  if(navigation) windowRef.navigation={addEventListener(type,fn){navigationListeners.set(type,fn);}};
  const setUrl=url=>{windowRef.location.hash=url;windowRef.location.href=url;};
  windowRef.history={
    get state(){return stack[cursor].state;},
    pushState(state,_title,url){stack.splice(cursor+1);stack.push({state,url});cursor++;setUrl(url);},
    replaceState(state,_title,url){stack[cursor]={state,url};setUrl(url);},
    go(delta){cursor+=delta;setUrl(stack[cursor].url);listeners.get('popstate')?.({state:stack[cursor].state});},
    back(){this.go(-1);},
  };
  return {windowRef,stack,listeners,navigationListeners,get cursor(){return cursor;}};
}

test('schema is versioned, minimal, serializable and initializes the first entry',()=>{
  const h=harness(); const api=installBrowserHistory({windowRef:h.windowRef});
  assert.equal(isApplicationHistoryState(h.windowRef.history.state),true);
  assert.deepEqual(Object.keys(h.windowRef.history.state),['app','version','entryId','route','child']);
  assert.doesNotThrow(()=>JSON.stringify(api.current()));
});

test('Back and Forward each dispatch one route or child restoration',()=>{
  const h=harness(); const api=installBrowserHistory({windowRef:h.windowRef});
  const restored=[];
  api.register('route',state=>restored.push(`route:${state.route.moduleId}`));
  api.register('child',state=>restored.push(`child:${state.child?.key||'none'}`));
  api.push(api.stateForRoute({projectId:'A',moduleId:'tasks',hash:'#/projects/A/tasks'}),'#/projects/A/tasks');
  api.push(api.stateForChild({id:'one',key:'task-detail',payload:{id:'T'}}),'#/projects/A/tasks');
  api.back();
  api.go(1);
  assert.deepEqual(restored,['child:none','child:task-detail']);
});

test('foreign history state is not consumed by application restorers',()=>{
  const state=createHistoryState({locationRef:{hash:''}});
  assert.equal(isApplicationHistoryState(state),true);
  assert.equal(isApplicationHistoryState({app:'another'}),false);
});

test('document exit guard is reserved for an actual unload',()=>{
  const h=harness();const api=installBrowserHistory({windowRef:h.windowRef});
  let dirty=false;
  api.registerExitGuard('dirty-child',()=>dirty);
  const event={prevented:false,preventDefault(){this.prevented=true;}};
  h.listeners.get('beforeunload')(event);
  assert.equal(event.prevented,false);
  dirty=true;
  h.listeners.get('beforeunload')(event);
  assert.equal(event.prevented,true);
  assert.equal(event.returnValue,'');
});

test('Navigation API traversal guards cancel a stale or cross-document destination before commit',()=>{
  const h=harness(undefined,{navigation:true});
  const api=installBrowserHistory({windowRef:h.windowRef});
  let transaction=false;
  api.registerTraversalGuard('child',context=>{
    if(transaction) return true;
    if(!context.sameDocument) return true;
    transaction=true;
    return false;
  });
  const navigate=h.navigationListeners.get('navigate');
  const event=({sameDocument=true}={})=>({
    navigationType:'traverse',cancelable:true,prevented:false,
    destination:{sameDocument,getState:()=>api.current()},
    preventDefault(){this.prevented=true;},
  });
  const first=event();navigate(first);assert.equal(first.prevented,false);
  const queued=event();navigate(queued);assert.equal(queued.prevented,true);
  transaction=false;
  const external=event({sameDocument:false});navigate(external);assert.equal(external.prevented,true);
  assert.equal(api.supportsTraversalInterception,true);
});

test('non-cancelable traversals do not enter traversal guard lifecycle',()=>{
  const h=harness(undefined,{navigation:true});
  const api=installBrowserHistory({windowRef:h.windowRef});
  let calls=0;
  api.registerTraversalGuard('child',()=>{calls++;return true;});
  const event={
    navigationType:'traverse',cancelable:false,prevented:false,
    destination:{sameDocument:false,getState:()=>null},
    preventDefault(){this.prevented=true;},
  };
  h.navigationListeners.get('navigate')(event);
  assert.equal(calls,0);
  assert.equal(event.prevented,false);
});

test('structured traversal claim runs afterCancel only after preventDefault',()=>{
  const h=harness(undefined,{navigation:true});
  const api=installBrowserHistory({windowRef:h.windowRef});
  const order=[];
  api.registerTraversalGuard('guarded-form',()=>({afterCancel:()=>order.push('afterCancel')}));
  const event={
    navigationType:'traverse',cancelable:true,
    destination:{sameDocument:true,getState:()=>api.current()},
    preventDefault(){order.push('preventDefault');},
  };
  h.navigationListeners.get('navigate')(event);
  assert.deepEqual(order,['preventDefault','afterCancel']);
});
