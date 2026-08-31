import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppDataStore } from '../data/appDataStore.js';
import { applyOwnedCloudProjects, createOwnedSnapshotHandler } from './cloudHydration.js';

function doc(id, data){ return { id, data:()=>data }; }
const convert = (entry, local)=>({ ...local, ...entry.data(), id:entry.id, tasks:local?.tasks || [] });

test('cloud hydrate replaces stale metadata in the canonical D3 project list without duplicates', () => {
  const store=createAppDataStore({storage:null});
  store.setProjects([{id:'p1',name:'stale',ownerUid:'u1',tasks:[{id:'t1'}]}]);
  const previous=globalThis.window;
  globalThis.window={KarhaAppData:store};
  try{
    applyOwnedCloudProjects({appDataStore:store,currentUser:{uid:'u1'},ownedDocs:[doc('p1',{name:'cloud',ownerUid:'u1'})],docToProject:convert});
    assert.equal(store.getProjects().length,1);
    assert.equal(store.getProjects()[0].name,'cloud');
    assert.deepEqual(store.getProjects()[0].tasks,[{id:'t1'}]);
  }finally{ globalThis.window=previous; }
});

test('dirty canonical Store project wins over a stale cloud/local copy', () => {
  const store=createAppDataStore({storage:null});
  const canonical={id:'p1',name:'canonical',ownerUid:'u1'};
  store.setProjects([canonical]);
  store.markProjectDirty('p1');
  const previous=globalThis.window;
  globalThis.window={KarhaAppData:store};
  try{
    applyOwnedCloudProjects({appDataStore:store,currentUser:{uid:'u1'},ownedDocs:[doc('p1',{name:'stale-cloud',ownerUid:'u1'})],docToProject:convert});
    assert.equal(store.getProjects()[0].name,'canonical');
  }finally{ globalThis.window=previous; }
});

test('owned listener handler applies once before task hydrate', async () => {
  const store=createAppDataStore({storage:null});
  const previous=globalThis.window;
  globalThis.window={KarhaAppData:store};
  const order=[];
  try{
    const handler=createOwnedSnapshotHandler({appDataStore:store,getCurrentUser:()=>({uid:'u1'}),docToProject:convert,persistLocal:()=>order.push('persist'),hydrateProjects:()=>order.push('tasks')});
    await handler([doc('p1',{name:'owned',ownerUid:'u1'}),doc('p1',{name:'owned',ownerUid:'u1'})]);
    assert.equal(store.getProjects().filter(p=>p.id==='p1').length,1);
    assert.deepEqual(order,['persist','tasks']);
  }finally{ globalThis.window=previous; }
});
