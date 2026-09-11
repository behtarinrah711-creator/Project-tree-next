import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppDataStore } from '../../data/appDataStore.js';
import { workTaskApi } from './workTaskApi.js';
import { rollupProgress } from './estimate.js';

function installFixture(){
  const store = createAppDataStore({ storage:null });
  store.replaceSnapshot({ schemaVersion:8, activeTab:'p1', viewMode:'simple', starredOrder:[], projects:[{
    id:'p1',
    contacts:[{ id:'c1', name:'مهندس احمدی' }],
    tasks:[{ id:'s1', kind:'stage', subtasks:[{
      id:'w1', kind:'work', text:'اجرای کابینت', progress:35, done:false, status:'in_progress', subtasks:[],
    }] }],
  }] });
  globalThis.KarhaAppData = store;
  return store;
}

function draft(overrides = {}){
  return {
    title:'نصب یونیت زمینی',
    type:'اجرا',
    scheduleStart:'1405/06/01',
    scheduleEnd:'1405/06/03',
    priority:'high',
    assigneeContactId:'c1',
    weight:1,
    ...overrides,
  };
}

test.afterEach(() => { delete globalThis.KarhaAppData; });

test('task API validates references and dates and persists a canonical Work reference', () => {
  installFixture();
  assert.equal(workTaskApi.create('p1', 'w1', draft({ assigneeContactId:'missing' })).code, 'assignee');
  assert.equal(workTaskApi.create('p1', 'w1', draft({ scheduleEnd:'1405/05/30' })).code, 'dates');

  const created = workTaskApi.create('p1', 'w1', draft({ weight:undefined }), () => 100);
  assert.equal(created.ok, false);
  assert.equal(created.code, 'weight');

  const valid = workTaskApi.create('p1', 'w1', draft(), () => 100);
  assert.equal(valid.ok, true);
  assert.equal(valid.task.workId, 'w1');
  assert.equal(valid.task.assigneeContactId, 'c1');
  assert.equal(typeof valid.task.weight, 'number');
});

test('task weight edits and weighted completion drive Work completion', () => {
  const store = installFixture();
  const first = workTaskApi.create('p1', 'w1', draft({ title:'خرید', weight:2 }), () => 100).task;
  const second = workTaskApi.create('p1', 'w1', draft({ title:'اجرا', weight:1 }), () => 200).task;

  const edited = workTaskApi.update('p1', 'w1', second.id, { weight:3, type:'خدمات' }, () => 300);
  assert.equal(edited.ok, true);
  assert.equal(edited.task.weight, 3);
  assert.equal(edited.task.type, 'خدمات');

  workTaskApi.setCompleted('p1', 'w1', second.id, true, () => 400);
  let work = store.getSnapshot().projects[0].tasks[0].subtasks[0];
  assert.equal(work.progress, 60);
  assert.equal(work.done, false);
  assert.equal(rollupProgress(store.getSnapshot().projects[0].tasks), 60);

  workTaskApi.setCompleted('p1', 'w1', first.id, true, () => 500);
  work = store.getSnapshot().projects[0].tasks[0].subtasks[0];
  assert.equal(work.progress, 100);
  assert.equal(work.done, true);
  assert.equal(work.status, 'completed');
  assert.equal(rollupProgress(store.getSnapshot().projects[0].tasks), 100);
});

test('first and last Task transfer Work predecessors without orphaning the network', () => {
  const store = installFixture();
  const project = store.getSnapshot().projects[0];
  const work = project.tasks[0].subtasks[0];
  project.tasks[0].subtasks.unshift({ id:'w0', kind:'work', text:'پیش‌نیاز', subtasks:[] });
  work.predecessorIds = ['w0'];
  const created = workTaskApi.create('p1', 'w1', draft(), () => 100);
  assert.equal(created.ok, true);
  assert.deepEqual(created.task.predecessorIds, ['w0']);
  assert.deepEqual(workTaskApi.list('p1', 'w1').length, 1);
  let savedWork = store.getSnapshot().projects[0].tasks[0].subtasks.find(item => item.id === 'w1');
  assert.deepEqual(savedWork.predecessorIds, []);
  assert.equal(workTaskApi.remove('p1', 'w1', created.task.id, () => 200).ok, true);
  savedWork = store.getSnapshot().projects[0].tasks[0].subtasks.find(item => item.id === 'w1');
  assert.deepEqual(savedWork.predecessorIds, ['w0']);
  assert.equal(savedWork.workTasks.length, 1);
  assert.equal(savedWork.workTasks[0].trashed, true);
  assert.deepEqual(workTaskApi.list('p1', 'w1'), []);
});


test('Task reorder persists active order without reviving deleted Tasks', () => {
  const store = installFixture();
  const first = workTaskApi.create('p1', 'w1', draft({ title:'اول' }), () => 100).task;
  const second = workTaskApi.create('p1', 'w1', draft({ title:'دوم' }), () => 200).task;
  const third = workTaskApi.create('p1', 'w1', draft({ title:'سوم' }), () => 300).task;
  assert.equal(workTaskApi.remove('p1', 'w1', second.id, () => 400).ok, true);
  assert.equal(workTaskApi.reorder('p1', 'w1', [third.id, first.id], () => 500).ok, true);
  assert.deepEqual(workTaskApi.list('p1', 'w1').map(task => task.id), [third.id, first.id]);
  const raw = store.getSnapshot().projects[0].tasks[0].subtasks[0].workTasks;
  assert.equal(raw.find(task => task.id === second.id).trashed, true);
});
