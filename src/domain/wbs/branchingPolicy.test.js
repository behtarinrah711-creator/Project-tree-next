import test from 'node:test';
import assert from 'node:assert/strict';
import { allowsNestedStages, stageAddKinds } from './branchingPolicy.js';
import { createAppDataStore } from '../../data/appDataStore.js';
import { projectRepository } from '../../data/projectRepository.js';
import { wbsApi } from './wbsApi.js';

const stage = (id, subtasks=[]) => ({ id, kind:'stage', subtasks });
test('default and explicit false use package → stage → work without a choice', () => {
  const project={tasks:[stage('package',[stage('phase')])]};
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
  store.replaceSnapshot({projects:[{id:'off',tasks:[]},{id:'on',tasks:[],settings:{allowNestedStages:true}}]});
  globalThis.KarhaAppData=store;
  for(const id of ['off','on']){
    const root=wbsApi.createStage(id,'package');
    const phase=wbsApi.createStage(id,'phase',root.id);
    const nested=wbsApi.createStage(id,'nested',phase.id);
    assert.equal(!!nested,id==='on');
    if(id==='off') assert.ok(wbsApi.createWorkItem(id,'work',phase.id));
  }
  assert.equal(projectRepository.find('off').settings,undefined);
  delete globalThis.KarhaAppData;
});
