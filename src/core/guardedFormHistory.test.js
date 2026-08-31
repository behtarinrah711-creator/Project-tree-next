import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

async function harness(){
  const source=await readFile(new URL('./childHistoryController.js',import.meta.url),'utf8');
  const entries=[{state:null,url:'#/projects/p/contracts'}];
  let cursor=0;
  const listeners={};
  const traversalGuards=new Map();
  const window={};
  const location={href:'#/projects/p/contracts'};
  const history={
    get state(){return entries[cursor].state;},
    pushState(state,_title,url){entries.splice(cursor+1);entries.push({state,url});cursor++;},
    replaceState(state,_title,url){entries[cursor]={state,url};},
    go(delta){cursor+=delta;listeners.popstate?.({state:entries[cursor].state});},
    back(){this.go(-1);},
  };
  window.KarhaBrowserHistory={
    current:()=>history.state,
    stateForChild:child=>({child}),
    push(patch,url){history.pushState(patch,'',url);},
    replace(patch,url){history.replaceState(patch,'',url);},
    go(delta){history.go(delta);},
    register(owner,fn){if(owner==='child')listeners.popstate=e=>fn(e.state,e);},
    registerTraversalGuard(owner,fn){traversalGuards.set(owner,fn);return()=>traversalGuards.delete(owner);},
    registerExitGuard(){return()=>{};},
  };
  const context={window,history,location,queueMicrotask,Promise};
  vm.createContext(context);
  vm.runInContext(source,context);
  return {api:window.KarhaChildHistory,history,entries,traversalGuards,get cursor(){return cursor;}};
}

test('guarded form keeps original entry and places transient directly above it',async()=>{
  const h=await harness();
  let dirty=true;
  h.api.open('contracts');
  h.api.registerGuardedForm('form',{
    shouldIntercept:()=>dirty,
    requestExit:()=>h.api.presentTransient('choice'),
  });
  const formId=h.api.open('form');
  const originalEntryId=h.history.state.child.id;
  assert.equal(originalEntryId,formId);

  const destination=h.entries[h.cursor-1].state;
  const claim=h.traversalGuards.get('child')({sameDocument:true,destinationState:destination,cancelable:true});
  assert.equal(typeof claim?.afterCancel,'function');
  assert.equal(h.history.state.child.id,formId);
  claim.afterCancel();

  assert.equal(h.api.top().key,'transient:choice');
  assert.equal(h.entries[h.cursor-1].state.child.id,formId);
  assert.equal(h.entries[h.cursor-1].state.child.id,originalEntryId);

  h.history.back();
  assert.equal(h.api.top().key,'form');
  assert.equal(h.history.state.child.id,originalEntryId);

  dirty=false;
  const cleanDestination=h.entries[h.cursor-1].state;
  const cleanClaim=h.traversalGuards.get('child')({sameDocument:true,destinationState:cleanDestination,cancelable:true});
  assert.equal(cleanClaim,false);
});

test('topmost child owns traversal before guarded parent form',async()=>{
  const h=await harness();
  let formClaims=0;
  let pickerClaims=0;
  h.api.registerGuardedForm('form',{
    shouldIntercept:()=>{formClaims++;return true;},
    requestExit:()=>{},
  });
  h.api.register('picker',{onTraverse:()=>{pickerClaims++;return true;}});
  h.api.open('form');
  h.api.open('picker');

  const destination=h.entries[h.cursor-1].state;
  const claim=h.traversalGuards.get('child')({sameDocument:true,destinationState:destination,cancelable:true});
  assert.equal(typeof claim?.afterCancel,'function');
  assert.equal(pickerClaims,1);
  assert.equal(formClaims,0);
});
