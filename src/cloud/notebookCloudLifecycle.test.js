import assert from 'node:assert/strict';
import test from 'node:test';
import { createNotebookCloudLifecycle, hasGuestNotebookData } from './notebookCloudLifecycle.js';
import { createNotebookItem, createNotebookRepository } from '../data/notebookRepository.js';

const tick = () => new Promise(resolve => setTimeout(resolve,0));
function storage(){
  const values = new Map();
  return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};
}
function harness(cloudByUid={}){
  let authCallback;
  const writes=[];
  const listeners=new Map();
  const auth={onAuthStateChanged(callback){authCallback=callback;return()=>{};}};
  const db={collection(name){assert.equal(name,'notebooks');return{doc(uid){return{
    async get(){const data=cloudByUid[uid];return{exists:!!data,data:()=>data};},
    async set(value){cloudByUid[uid]={...(cloudByUid[uid]||{}),...value};writes.push({uid,value});listeners.get(uid)?.({exists:true,data:()=>cloudByUid[uid]});},
    onSnapshot(next){listeners.set(uid,next);return()=>listeners.delete(uid);},
  };}};}};
  const guestRepository=createNotebookRepository({storage:storage(),storageKey:'guest'});
  const lifecycle=createNotebookCloudLifecycle({auth,db,guestRepository,consoleRef:{warn(){}}});
  return{auth:user=>authCallback(user),writes,cloudByUid,guestRepository,lifecycle};
}

test('first login migrates the guest notebook once and clears only the guest workspace after server success',async()=>{
  const h=harness();
  h.guestRepository.mutate(notebook=>notebook.lists[0].items.push(createNotebookItem('یادداشت مهمان')));
  assert.equal(hasGuestNotebookData(h.guestRepository.get()),true);

  h.auth({uid:'user-1'});
  await tick();await tick();

  assert.equal(h.cloudByUid['user-1'].ownerUid,'user-1');
  assert.equal(h.cloudByUid['user-1'].notebook.lists[0].items[0].text,'یادداشت مهمان');
  assert.equal(h.lifecycle.get().lists[0].items[0].text,'یادداشت مهمان');
  assert.equal(hasGuestNotebookData(h.guestRepository.get()),false);
});

test('logout immediately detaches account data and a second user sees only their own notebook',async()=>{
  const cloud={
    u1:{ownerUid:'u1',notebook:{version:1,activeListId:'a',lists:[{id:'a',title:'دفتر کاربر یک',items:[]}]}},
    u2:{ownerUid:'u2',notebook:{version:1,activeListId:'b',lists:[{id:'b',title:'دفتر کاربر دو',items:[]}]}},
  };
  const h=harness(cloud);
  h.auth({uid:'u1'});await tick();
  assert.equal(h.lifecycle.get().lists[0].title,'دفتر کاربر یک');

  h.auth(null);
  assert.equal(h.lifecycle.get().lists[0].title,'کارهای شخصی');
  assert.equal(h.lifecycle.get().lists[0].items.length,0);

  h.auth({uid:'u2'});await tick();
  assert.equal(h.lifecycle.get().lists[0].title,'دفتر کاربر دو');
});

test('authenticated mutations are written only to the active uid document',async()=>{
  const h=harness();
  h.auth({uid:'u1'});await tick();await tick();
  h.writes.length=0;
  h.lifecycle.mutate(notebook=>notebook.lists[0].items.push(createNotebookItem('حساب یک')));
  await tick();
  assert.deepEqual(h.writes.map(write=>write.uid),['u1']);
  assert.equal(h.cloudByUid.u1.notebook.lists[0].items[0].text,'حساب یک');
});
