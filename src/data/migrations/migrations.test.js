import test from 'node:test';
import assert from 'node:assert/strict';
import { runDataMigrations } from './index.js';
import { APP_DATA_STORAGE_KEY } from '../appDataStore.js';

test('v8 project and legacy global workspace data migrate without shape loss',()=>{
  const contact={id:'c1',trashed:true,deletedProjectId:'p2'};
  const activity={id:'a1'};
  const snapshot={schemaVersion:8,activeTab:'p1',projects:[
    {id:'p1',tasks:[{id:'t1',done:true}],contacts:[],activityTemplates:[]},
    {id:'p2',tasks:[],contacts:[],activityTemplates:[]},
  ],contacts:[contact],activityTemplates:[activity]};
  const dirty=[];
  runDataMigrations(snapshot,{schemaVersion:8,activeProjectId:'p1',markDirty:id=>dirty.push(id)});
  assert.equal(snapshot.schemaVersion,8);
  assert.equal(APP_DATA_STORAGE_KEY,'ptnext-v1:app-data');
  assert.equal(snapshot.projects[0].tasks[0].completedAt,0);
  assert.equal(snapshot.projects[0].archived,false);
  assert.equal(snapshot.projects[0].trashed,false);
  assert.deepEqual(snapshot.projects[0].activityTemplates,[activity]);
  assert.deepEqual(snapshot.projects[1].contacts,[contact]);
  assert.equal('deletedProjectId' in contact,false);
  assert.deepEqual(dirty,['p2','p1']);
  assert.equal('contacts' in snapshot,false);
  assert.equal('activityTemplates' in snapshot,false);
});

test('migration is idempotent and preserves normalized defaults',()=>{
  const snapshot={schemaVersion:8,projects:[{id:'p',tasks:[],contracts:[{id:'c'}],contractTemplates:[{id:'t'}]}]};
  const context={schemaVersion:8,activeProjectId:'p',markDirty(){}};
  runDataMigrations(snapshot,context);
  const once=JSON.stringify(snapshot);
  runDataMigrations(snapshot,context);
  assert.equal(JSON.stringify(snapshot),once);
  assert.deepEqual(snapshot.projects[0].contracts[0],{id:'c',trashed:false,progressTimeline:[],progressPercent:0});
  assert.equal(snapshot.projects[0].contractTemplates[0].trashed,false);
});
