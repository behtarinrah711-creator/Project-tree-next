import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppDataStore } from '../data/appDataStore.js';
import { createPersistOrchestrator } from './persistAdapter.js';

test('persist orchestration consumes dirty ids only from canonical D4 owner', async () => {
  const store=createAppDataStore({storage:null});
  store.setProjects([{id:'canonical'}]);
  store.markProjectDirty('canonical');
  const synced=[];
  const persist=createPersistOrchestrator({appDataStore:store,isCloudEnabled:()=>true,findProject:id=>store.getProjects().find(p=>p.id===id),syncProject:p=>synced.push(p.id),delay:0});
  persist({local:false});
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(synced,['canonical']);
  assert.equal(store.isProjectDirty('canonical'),false);
});
