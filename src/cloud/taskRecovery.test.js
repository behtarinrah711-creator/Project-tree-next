import test from 'node:test';
import assert from 'node:assert/strict';
import {createTaskRecoveryCache,mergeRecoveredTasks} from './taskRecovery.js';

test('valid local tasks survive an empty cloud snapshot without duplication',()=>{
  const normalize=value=>({...value,id:String(value.id)});
  const merged=mergeRecoveredTasks([],[],[{id:'t1'}],[{id:'t1'},{id:'t2'}],normalize);
  assert.deepEqual(merged.map(task=>task.id),['t1','t2']);
});

test('refresh merge keeps a newer nested WBS task over an older cloud work record',()=>{
  const normalize=value=>({...value,id:String(value.id)});
  const cloud=[{id:'w1',updatedAt:100,workTasks:[]}];
  const local=[{id:'w1',updatedAt:100,workTasks:[{id:'wt1',createdAt:300,updatedAt:300}]}];
  const merged=mergeRecoveredTasks(cloud,local,normalize);
  assert.equal(merged[0].workTasks.length,1);
  assert.equal(merged[0].workTasks[0].id,'wt1');
});

test('recovery cache retains a last-known-good non-empty task set',()=>{
  const values=new Map(),storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
  const cache=createTaskRecoveryCache({storage,normalizeTask:value=>({...value})});
  cache.remember({id:'p1',name:'P',tasks:[{id:'t1'}]});
  cache.remember({id:'p1',name:'P',tasks:[]});
  assert.deepEqual(cache.recover({id:'p1'}).map(task=>task.id),['t1']);
});
