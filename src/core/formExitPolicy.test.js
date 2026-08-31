import assert from 'node:assert/strict';
import test from 'node:test';
import { createFormExitSession } from './formExitPolicy.js';

function makeHarness({creating,state={value:''}}={}){
  let draftSaves=0;
  let editSaves=0;
  let discards=0;
  let choice=null;
  const session=createFormExitSession({
    isNew:()=>!!creating,
    getState:()=>state,
    showChoice:cfg=>{choice=cfg;},
    onSaveDraft:()=>{draftSaves++;},
    onSaveChanges:()=>{editSaves++;},
    onDiscard:()=>{discards++;},
  });
  session.captureBaseline();
  return {session,get choice(){return choice;},counts:()=>({draftSaves,editSaves,discards})};
}

test('new unchanged form exits without prompt',()=>{
  const h=makeHarness({creating:true});
  assert.equal(h.session.requestExit(false),'closed');
  assert.equal(h.choice,null);
  assert.deepEqual(h.counts(),{draftSaves:0,editSaves:0,discards:1});
});

test('new changed form offers draft save',()=>{
  const state={value:''};
  const h=makeHarness({creating:true,state});
  state.value='x';
  assert.equal(h.session.requestExit(false),'prompt');
  h.choice.onYes();
  assert.deepEqual(h.counts(),{draftSaves:1,editSaves:0,discards:0});
});

test('existing unchanged form exits without prompt',()=>{
  const h=makeHarness({creating:false,state:{value:'saved'}});
  assert.equal(h.session.requestExit(false),'closed');
  assert.equal(h.choice,null);
  assert.deepEqual(h.counts(),{draftSaves:0,editSaves:0,discards:1});
});

test('existing changed form saves changes and never creates draft',()=>{
  const state={value:'saved'};
  const h=makeHarness({creating:false,state});
  state.value='edited';
  assert.equal(h.session.requestExit(false),'prompt');
  assert.match(h.choice.text,/تغییرات/);
  h.choice.onYes();
  assert.deepEqual(h.counts(),{draftSaves:0,editSaves:1,discards:0});
});
