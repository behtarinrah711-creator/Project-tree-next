import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProjectCloudPayload } from '../../sync/cloudSyncProject.js';
import { docToProjectFromCloud } from '../../sync/docToProject.js';
import { projectFromCloudDoc } from '../../core/cloudProjectRecovery.js';
import { getProjectRouteSurface } from '../../core/projectRouteSurface.js';
import { createAppDataStore } from '../../data/appDataStore.js';

test('settings page has its own project workspace route and the Settings footer', () => {
  assert.deepEqual(getProjectRouteSurface('project-settings'),{
    pageId:'projectSettingsPage',footer:'Settings',subpage:'projectSettings'
  });
});
test('cloud payload defaults to none and preserves future settings', () => {
  const build=p=>buildProjectCloudPayload(p,{},null,x=>x,8);
  assert.deepEqual(build({}).settings,{stageMode:'none'});
  assert.deepEqual(build({settings:{allowNestedStages:true,future:'keep'}}).settings,
    {stageMode:'multiple',future:'keep'});
});
test('cloud hydration and project recovery retain settings', () => {
  const settings={allowNestedStages:true,future:2};
  const appDataStore=createAppDataStore();
  const doc={id:'p',data:()=>({name:'P',settings})};
  assert.deepEqual(docToProjectFromCloud(doc,null,{appDataStore}).settings,settings);
  assert.deepEqual(projectFromCloudDoc(doc,{}).settings,settings);
  const old={id:'p',tasks:[],settings};
  const legacy={id:'p',data:()=>({name:'Legacy'})};
  assert.deepEqual(docToProjectFromCloud(legacy,old,{appDataStore}).settings,settings);
  appDataStore.markProjectDirty('p');
  assert.deepEqual(docToProjectFromCloud({id:'p',data:()=>({settings:{allowNestedStages:false}})},old,{appDataStore}).settings,settings);
});
test('all explicit stage modes survive cloud payload and hydration', () => {
  const appDataStore=createAppDataStore();
  for(const stageMode of ['none','single','multiple']){
    const settings={stageMode,future:'keep'};
    const payload=buildProjectCloudPayload({settings},{},null,x=>x,8);
    assert.deepEqual(payload.settings,settings);
    assert.deepEqual(docToProjectFromCloud({id:'p',data:()=>payload},null,{appDataStore}).settings,settings);
  }
});
