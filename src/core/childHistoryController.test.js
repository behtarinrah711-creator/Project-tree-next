import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

async function harness({asyncTraversal=false}={}){
  const source=await readFile(new URL('./childHistoryController.js',import.meta.url),'utf8');
  const listeners={}; const entries=[{state:null,url:'#/projects/p/dashboard'}]; let cursor=0;
  const exitGuards=new Map();
  const traversalGuards=new Map();
  const traversalQueue=[];
  let requestedCursor=cursor;
  let beforeUnloadCalls=0;
  const window={addEventListener(type,fn){listeners[type]=fn;}};
  const location={href:'#/projects/p/dashboard'};
  const history={
    get state(){return entries[cursor].state;},
    pushState(state,_title,url){entries.splice(++cursor);entries.push({state,url});},
    replaceState(state,_title,url){entries[cursor]={state,url};},
    back(){cursor--;listeners.popstate({state:entries[cursor].state});},
    forward(){cursor++;listeners.popstate({state:entries[cursor].state});},
    go(delta){
      const traverse=()=>{cursor+=delta;listeners.popstate({state:entries[cursor].state});};
      if(asyncTraversal) queueMicrotask(traverse); else traverse();
    }
  };
  window.KarhaBrowserHistory={
    current:()=>history.state,
    stateForChild:child=>({child}),
    push(patch,url){history.pushState(patch,'',url);},
    replace(patch,url){history.replaceState(patch,'',url);},
    go(delta){history.go(delta);},
    register(owner,fn){if(owner==='child')listeners.popstate=event=>fn(event.state,event);},
    registerTraversalGuard(owner,fn){traversalGuards.set(owner,fn);return()=>traversalGuards.delete(owner);},
    registerExitGuard(owner,fn){exitGuards.set(owner,fn);return()=>exitGuards.delete(owner);},
  };
  const context={window,history,location,queueMicrotask,Promise};vm.createContext(context);vm.runInContext(source,context);
  return {
    api:window.KarhaChildHistory,history,entries,exitGuards,traversalGuards,
    requestBack(){
      if(traversalQueue.length===0) requestedCursor=cursor;
      requestedCursor--;
      const target=requestedCursor;
      const destinationState=target>=0 ? entries[target]?.state||null : null;
      const blocked=traversalGuards.get('child')?.({sameDocument:target>=0,destinationState,cancelable:true})===true;
      const request={target,destinationState,blocked};
      traversalQueue.push(request);
      return request;
    },
    commitNext(){
      const request=traversalQueue.shift();
      if(!request || request.blocked) return request||null;
      if(request.target<0){beforeUnloadCalls++;return {...request,blank:true};}
      cursor=request.target;
      listeners.popstate({state:request.destinationState});
      requestedCursor=cursor;
      return request;
    },
    get beforeUnloadCalls(){return beforeUnloadCalls;},
    get cursor(){return cursor;}
  };
}

const settle=()=>new Promise(resolve=>queueMicrotask(resolve));

test('transient is revealed only after synchronous restored topology settles',async()=>{
  const h=await harness({asyncTraversal:true});
  let ready=0;
  h.api.register('contracts');
  h.api.register('form',{onPop:()=>h.api.presentTransient('choice',{onReady:()=>ready++})});
  h.api.open('contracts');
  h.api.open('form');

  h.history.back();
  assert.equal(ready,0);
  assert.equal(h.api.top().key,'transient:choice');

  await settle();
  assert.equal(ready,1);
  assert.equal(h.history.state.child.key,'transient:choice');
  assert.equal(h.entries[h.cursor-1].state.child.key,'form');
  assert.equal(h.entries[h.cursor-2].state.child.key,'contracts');
});

test('pre-traversal transaction admits one direct predecessor and rejects queued stale and blank destinations',async()=>{
  const h=await harness();
  h.api.register('contracts');
  h.api.register('form',{onPop:()=>h.api.presentTransient('choice')});
  h.api.open('contracts');
  h.api.open('form');
  const inspect=h.traversalGuards.get('child');
  const contracts=h.entries[h.cursor-1].state;

  assert.equal(inspect({sameDocument:true,destinationState:contracts}),false);
  assert.equal(h.api.currentTraversalTransaction().from.key,'form');
  assert.equal(inspect({sameDocument:true,destinationState:{child:null}}),true);
  assert.equal(inspect({sameDocument:false,destinationState:null}),true);

  h.history.back();
  await settle();
  assert.equal(h.api.currentTraversalTransaction(),null);
  assert.equal(h.api.top().key,'transient:choice');
  assert.equal(h.history.state.child.id,h.api.top().id);

  const form=h.entries[h.cursor-1].state;
  assert.equal(inspect({sameDocument:true,destinationState:form}),false);
  h.history.back();
  assert.equal(h.api.top().key,'form');
  assert.equal(h.history.state.child.id,h.api.top().id);
});

test('Back Back Back snapshots before first popstate commit only the direct predecessor',async()=>{
  const h=await harness();
  h.api.register('contracts');
  h.api.register('form',{onPop:()=>h.api.presentTransient('choice')});
  h.api.open('contracts');
  h.api.open('form');

  const first=h.requestBack();
  const second=h.requestBack();
  const third=h.requestBack();
  assert.equal(first.blocked,false);
  assert.equal(second.blocked,true);
  assert.equal(third.blocked,true);

  h.commitNext();
  h.commitNext();
  h.commitNext();
  await settle();
  assert.equal(h.beforeUnloadCalls,0);
  assert.equal(h.api.top().key,'transient:choice');
  assert.equal(h.history.state.child.id,h.api.top().id);
  assert.equal(h.history.state.child.key,h.api.top().key);

  const dismiss=h.requestBack();
  assert.equal(dismiss.blocked,false);
  h.commitNext();
  assert.equal(h.beforeUnloadCalls,0);
  assert.equal(h.api.top().key,'form');
  assert.equal(h.history.state.child.id,h.api.top().id);
});

test('registration, top-only Back, deduplication and unregister',async()=>{
  const h=await harness(); const events=[];
  const unregisterA=h.api.register('a',{onPop:()=>events.push('a')});
  h.api.register('b',{onPop:()=>events.push('b')});
  h.api.open('a');h.api.open('a');h.api.open('b');
  assert.equal(h.entries.length,3);
  h.history.back();assert.deepEqual(events,['b']);assert.equal(h.api.isOpen('a'),true);
  unregisterA();assert.equal(h.api.isOpen('a'),false);
});

test('Back and Forward close and restore a child without remounting parent',async()=>{
  const h=await harness();let closes=0,restores=0,parentMounts=1;
  h.api.register('picker',{onPop:()=>closes++,onRestore:()=>restores++});
  h.api.open('picker',{field:'date'});h.history.back();h.history.forward();
  assert.equal(closes,1);assert.equal(restores,1);assert.equal(parentMounts,1);
  assert.deepEqual({...h.api.top().payload},{field:'date'});
});

test('transient modal Back dismisses only the modal and returns to the restored dirty form',async()=>{
  const h=await harness();
  let prompts=0;
  let dismisses=0;
  h.api.register('form',{
    onPop:()=>{
      prompts++;
      h.api.presentTransient('unsaved-form',{onDismiss:()=>dismisses++});
    }
  });

  h.api.open('form');
  assert.equal(h.api.top().key,'form');

  h.history.back();
  await settle();
  assert.equal(prompts,1);
  assert.equal(h.api.isOpen('form'),true);
  assert.equal(h.api.isTransientOpen('unsaved-form'),true);
  assert.match(h.api.top().key,/^transient:unsaved-form$/);
  assert.equal(h.history.state.child.id,h.api.top().id);
  assert.equal(h.entries[h.cursor-1].state.child.key,'form');

  h.history.back();
  assert.equal(dismisses,1);
  assert.equal(h.api.isTransientOpen('unsaved-form'),false);
  assert.equal(h.api.isOpen('form'),true);
  assert.equal(h.api.top().key,'form');
  assert.equal(h.history.state.child.id,h.api.top().id);
  assert.equal(h.exitGuards.get('child')(),true);

  h.history.back();
  await settle();
  assert.equal(prompts,2);
  assert.equal(h.api.isTransientOpen('unsaved-form'),true);
});

test('dirty form and transient settle for ten Back dismissal transactions',async()=>{
  const h=await harness();
  let dismisses=0;
  h.api.register('form',{onPop:()=>h.api.presentTransient('choice',{onDismiss:()=>dismisses++})});
  h.api.open('form');

  for(let cycle=0;cycle<10;cycle++){
    h.history.back();
    assert.equal(h.api.top().key,'transient:choice');
    assert.equal(h.history.state.child.id,h.api.top().id);
    assert.equal(h.entries[h.cursor-1].state.child.key,'form');

    h.history.back();
    assert.equal(h.api.top().key,'form');
    assert.equal(h.history.state.child.id,h.api.top().id);
  }
  assert.equal(dismisses,10);
});

test('document exit protection is released when the restored dirty child resolves',async()=>{
  const h=await harness();
  h.api.register('form',{onPop:()=>h.api.presentTransient('choice')});
  h.api.open('form');
  h.history.back();
  assert.equal(h.exitGuards.get('child')(),true);
  h.api.dismissTransient('choice',{after:()=>h.api.consume('form',{fromPopState:true})});
  assert.equal(h.exitGuards.get('child')(),false);
});

test('all resolved form outcomes release document exit protection',async()=>{
  for(const outcome of ['Save Draft','No','final Save','clean close']){
    const h=await harness();
    h.api.register('form',{onPop:()=>h.api.presentTransient(`choice-${outcome}`)});
    h.api.open('form');
    h.history.back();
    assert.equal(h.exitGuards.get('child')(),true,outcome);
    h.api.dismissTransient(`choice-${outcome}`,{after:()=>h.api.consume('form',{fromPopState:true})});
    assert.equal(h.exitGuards.get('child')(),false,outcome);
  }
});

test('dirty transient restore preserves the real parent child stack',async()=>{
  const h=await harness();
  let prompts=0;
  let dismisses=0;
  const parentPops=[];

  h.api.register('contracts',{onPop:()=>parentPops.push('contracts')});
  h.api.register('form',{
    onPop:()=>{
      prompts++;
      h.api.presentTransient('unsaved-form',{onDismiss:()=>dismisses++});
    }
  });

  h.api.open('contracts');
  h.api.open('form');
  assert.equal(h.api.getDepth(),2);
  assert.equal(h.api.top().key,'form');

  // First Back asks about the dirty form. Restoring that consumed form must not
  // pop the real parent ('contracts') while the form is temporarily absent.
  h.history.back();
  await settle();
  assert.equal(prompts,1);
  assert.equal(parentPops.length,0);
  assert.equal(h.api.isOpen('contracts'),true);
  assert.equal(h.api.isOpen('form'),true);
  assert.equal(h.api.isTransientOpen('unsaved-form'),true);
  assert.equal(h.api.getDepth(),3);

  // Back from the visible confirmation dismisses only that transient layer.
  h.history.back();
  assert.equal(dismisses,1);
  assert.equal(parentPops.length,0);
  assert.equal(h.api.isTransientOpen('unsaved-form'),false);
  assert.equal(h.api.isOpen('contracts'),true);
  assert.equal(h.api.isOpen('form'),true);
  assert.equal(h.api.top().key,'form');
  assert.equal(h.api.getDepth(),2);
});

test('a stale rapid traversal cannot consume more than one current child generation',async()=>{
  const h=await harness();
  let dismisses=0;
  h.api.register('contracts',{onPop:()=>assert.fail('parent must not be consumed by stale pop')});
  h.api.register('form',{onPop:()=>h.api.presentTransient('choice',{onDismiss:()=>dismisses++})});
  h.api.open('contracts');
  h.api.open('form');
  h.history.back();
  assert.equal(h.api.top().key,'transient:choice');
  assert.equal(h.exitGuards.get('child')(),true);

  // Chromium can commit a queued traversal to the old contracts entry rather
  // than the direct predecessor (the freshly reconstructed form entry).
  h.history.go(-3);
  assert.equal(dismisses,1);
  assert.equal(h.api.top().key,'form');
  assert.equal(h.history.state.child.key,'form');
  assert.equal(h.api.getDepth(),2);
});

test('UI dismissal of a transient settles its entry before running the requested action',async()=>{
  const h=await harness();
  const actions=[];
  h.api.open('form');
  h.api.presentTransient('choice',{onDismiss:()=>actions.push('back')});
  assert.equal(h.api.isTransientOpen('choice'),true);

  h.api.dismissTransient('choice',{after:()=>actions.push('yes')});
  assert.deepEqual(actions,['yes']);
  assert.equal(h.api.isTransientOpen('choice'),false);
  assert.equal(h.api.top().key,'form');
});

test('controller-requested transient dismissal admits its exact traversal once',async()=>{
  const h=await harness({asyncTraversal:true});
  h.api.open('form');
  h.api.presentTransient('choice');
  h.api.dismissTransient('choice');
  const inspect=h.traversalGuards.get('child');
  const form=h.entries[h.cursor-1].state;
  assert.equal(h.api.currentTraversalTransaction().phase,'requested');
  assert.equal(inspect({sameDocument:true,destinationState:form}),false);
  assert.equal(inspect({sameDocument:true,destinationState:form}),true);
  await settle();
  assert.equal(h.api.currentTraversalTransaction(),null);
  assert.equal(h.history.state.child.id,h.api.top().id);
});

test('a fresh Back admits a stale same-document destination for canonical repair',async()=>{
  const h=await harness();
  h.api.register('contracts');
  h.api.register('form',{onPop:()=>h.api.presentTransient('choice')});
  h.api.open('contracts');
  h.api.open('form');
  h.history.back();
  await settle();

  const inspect=h.traversalGuards.get('child');
  const staleContracts=h.entries[h.cursor-2].state;
  assert.equal(staleContracts.child.key,'contracts');
  assert.equal(inspect({sameDocument:true,destinationState:staleContracts}),false);
  assert.equal(h.api.currentTraversalTransaction().origin,'browser');
  assert.equal(inspect({sameDocument:true,destinationState:staleContracts}),true);
});

test('controller dismissal admits a stale destination without consuming the restored form',async()=>{
  const h=await harness({asyncTraversal:true});
  h.api.open('contracts');
  h.api.open('form');
  h.api.presentTransient('choice');
  h.api.dismissTransient('choice');

  const inspect=h.traversalGuards.get('child');
  const staleContracts=h.entries[h.cursor-2].state;
  assert.equal(inspect({sameDocument:true,destinationState:staleContracts}),false);
  await settle();
  assert.equal(h.api.top().key,'form');
  assert.equal(h.api.getDepth(),2);
});
