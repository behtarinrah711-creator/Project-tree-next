import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppDataStore } from '../data/appDataStore.js';
import { createPersistOrchestrator } from './persistAdapter.js';

test('persist orchestration clears dirty only after cloud sync resolves', async () => {
  const store=createAppDataStore({storage:null});
  store.setProjects([{id:'canonical'}]);
  store.markProjectDirty('canonical');
  const synced=[];
  let resolveSync;
  const syncDone=new Promise(resolve=>{resolveSync=resolve;});
  const persist=createPersistOrchestrator({
    appDataStore:store,
    isCloudEnabled:()=>true,
    findProject:id=>store.getProjects().find(p=>p.id===id),
    syncProject:p=>{synced.push(p.id);return syncDone;},
    delay:0,
  });
  persist({local:false});
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(synced,['canonical']);
  assert.equal(store.isProjectDirty('canonical'),true);
  resolveSync(true);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(store.isProjectDirty('canonical'),false);
});

test('older cloud acknowledgement cannot clear a newer mutation', async () => {
  const store=createAppDataStore({storage:null});
  store.setProjects([{id:'p1'}]);
  store.markProjectDirty('p1');
  let resolveSync;
  const persist=createPersistOrchestrator({
    appDataStore:store,
    isCloudEnabled:()=>true,
    findProject:id=>store.getProjects().find(p=>p.id===id),
    syncProject:()=>new Promise(resolve=>{resolveSync=resolve;}),
    delay:0,
  });
  persist({local:false});
  await new Promise(resolve=>setImmediate(resolve));
  store.markProjectDirty('p1');
  resolveSync(true);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(store.isProjectDirty('p1'),true);
});
