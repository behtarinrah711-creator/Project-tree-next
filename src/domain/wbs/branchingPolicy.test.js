import test from 'node:test';
import assert from 'node:assert/strict';
import { allowsNestedStages, stageAddKinds, stageModeOf } from './branchingPolicy.js';
import { createAppDataStore } from '../../data/appDataStore.js';
import { projectRepository } from '../../data/projectRepository.js';
import { wbsApi } from './wbsApi.js';

const stage = (id, subtasks=[]) => ({ id, kind:'stage', subtasks });
test('single mode uses package → stage → work without a choice', () => {
  const project={settings:{stageMode:'single'},tasks:[stage('package',[stage('phase')])]};
  assert.equal(allowsNestedStages(project), false);
  assert.deepEqual(stageAddKinds(project,'package'),['stage']);
  assert.deepEqual(stageAddKinds(project,'phase'),['work']);
  project.settings={allowNestedStages:false};
  assert.deepEqual(stageAddKinds(project,'phase'),['work']);
});
test('only explicit true enables deeper stages; works never accept stages', () => {
  const project={settings:{allowNestedStages:true},tasks:[stage('package',[stage('phase',[stage('nested')])])]};
  assert.deepEqual(stageAddKinds(project,'nested'),['stage','work']);
  assert.deepEqual(stageAddKinds(project,'phase'),['stage']);
  assert.equal(allowsNestedStages({settings:{allowNestedStages:'true'}}), false);
  assert.deepEqual(stageAddKinds({tasks:[{id:'work',kind:'work'}]},'work'),[]);
});
test('disabling preserves existing descendants and does not expose another stage action', () => {
  const project={tasks:[stage('package',[stage('phase',[stage('nested')])])]};
  const before=JSON.stringify(project.tasks);
  assert.deepEqual(stageAddKinds(project,'phase'),[]);
  assert.deepEqual(stageAddKinds(project,'nested'),['work']);
  assert.equal(JSON.stringify(project.tasks),before);
});
test('domain rejects deeper stages by default, and setting is isolated per project', () => {
  const store=createAppDataStore();
  store.replaceSnapshot({projects:[{id:'off',tasks:[],settings:{stageMode:'single'}},{id:'on',tasks:[],settings:{allowNestedStages:true}}]});
  globalThis.KarhaAppData=store;
  for(const id of ['off','on']){
    const root=wbsApi.createStage(id,'package');
    const phase=wbsApi.createStage(id,'phase',root.id);
    const nested=wbsApi.createStage(id,'nested',phase.id);
    assert.equal(!!nested,id==='on');
    if(id==='off') assert.ok(wbsApi.createWorkItem(id,'work',phase.id));
  }
  assert.equal(projectRepository.find('off').settings.stageMode,'single');
  delete globalThis.KarhaAppData;
});
test('none is the default; explicit mode takes precedence over the legacy boolean', () => {
  for(const settings of [undefined,{}, {stageMode:'invalid'},{allowNestedStages:false}]){
    const project={settings,tasks:[stage('package')]};
    assert.equal(stageModeOf(project),'none');
    assert.deepEqual(stageAddKinds(project,'package'),['work']);
  }
  assert.equal(stageModeOf({settings:{stageMode:'none',allowNestedStages:true}}),'none');
  assert.equal(stageModeOf({settings:{allowNestedStages:true}}),'multiple');
});
test('multiple mode retains the existing legacy root-work continuation', () => {
  const project={settings:{stageMode:'multiple'},tasks:[stage('package',[{id:'work',kind:'work'}])]};
  assert.deepEqual(stageAddKinds(project,'package'),['work']);
});
test('no-stage project creates work directly and cannot create a phase', () => {
  const store=createAppDataStore();
  store.replaceSnapshot({projects:[{id:'none',tasks:[]}]});
  globalThis.KarhaAppData=store;
  const root=wbsApi.createStage('none','package');
  assert.equal(wbsApi.createStage('none','phase',root.id),null);
  assert.ok(wbsApi.createWorkItem('none','work',root.id));
  delete globalThis.KarhaAppData;
});


test('base projects create root work and reject packages and phases without migrating legacy settings', () => {
  const store=createAppDataStore();
  globalThis.KarhaAppData=store;
  store.replaceSnapshot({projects:[{id:'base',settings:{stageMode:'base'},tasks:[]}]});
  assert.equal(stageModeOf({settings:{stageMode:'base'}}),'base');
  assert.equal(stageModeOf({tasks:[]}),'none');
  assert.equal(wbsApi.createStage('base','بسته'),null);
  const work=wbsApi.createWorkItem('base','کار');
  assert.equal(work.kind,'work');
  assert.deepEqual(stageAddKinds(projectRepository.find('base'),work.id),[]);
  assert.equal(wbsApi.createStage('base','مرحله',work.id),null);
});
