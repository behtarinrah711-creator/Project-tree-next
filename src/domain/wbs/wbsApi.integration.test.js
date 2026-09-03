import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { createAppDataStore } from '../../data/appDataStore.js';
import { projectRepository } from '../../data/projectRepository.js';
import { wbsApi } from './wbsApi.js';
import { generalCostApi } from './generalCostApi.js';
import { exportProjectWbs, validateWbsExport, WBS_EXPORT_SCHEMA } from './exportSchema.js';

function memoryStorage(){
  const map = new Map();
  return {
    getItem(key){ return map.has(key) ? map.get(key) : null; },
    setItem(key, value){ map.set(key, String(value)); },
    removeItem(key){ map.delete(key); },
  };
}

function boot(project){
  const storage = memoryStorage();
  const store = createAppDataStore({ storage });
  store.replaceSnapshot({
    schemaVersion: 8,
    projects: [project],
    activeTab: project.id,
    viewMode: 'simple',
    starredOrder: [],
  });
  globalThis.KarhaAppData = store;
  globalThis.window = Object.assign(globalThis.window || {}, { KarhaAppData: store });
  return store;
}

describe('wbs domain API', { concurrency: false }, () => {
const t1 = () => new Date('2026-01-01T00:00:00.000Z');
const t2 = () => new Date('2026-01-02T00:00:00.000Z');
const t3 = () => new Date('2026-01-03T00:00:00.000Z');

test('createStage may nest stages and works, but work items cannot own children', () => {
  boot({ id:'p-wbs-1', name:'P', tasks:[] });
  const stage = wbsApi.createStage('p-wbs-1', 'فونداسیون', null, t1);
  const nestedStage = wbsApi.createStage('p-wbs-1', 'بتن‌ریزی', stage.id, t1);
  const work = wbsApi.createWorkItem('p-wbs-1', 'بتن', nestedStage.id, { quantity:2, unitCost:10 }, t1);
  const rejected = wbsApi.createWorkItem('p-wbs-1', 'زیرکار', work.id, {}, t1);
  assert.equal(stage.kind, 'stage');
  assert.equal(nestedStage.kind, 'stage');
  assert.equal(work.kind, 'work');
  assert.equal(rejected, null);
  const tree = projectRepository.find('p-wbs-1').tasks;
  assert.equal(tree[0].text, 'فونداسیون');
  assert.equal(tree[0].subtasks[0].text, 'بتن‌ریزی');
  assert.equal(tree[0].subtasks[0].subtasks[0].text, 'بتن');
  assert.equal(tree[0].subtasks[0].subtasks[0].subtasks.length, 0);
});

test('cannot create any child under a work item', () => {
  boot({ id:'p-wbs-2', name:'P', tasks:[] });
  const work = wbsApi.createWorkItem('p-wbs-2', 'کار', null, {}, t1);
  assert.equal(wbsApi.createStage('p-wbs-2', 'مرحله', work.id, t1), null);
  assert.equal(wbsApi.createWorkItem('p-wbs-2', 'زیرکار', work.id, {}, t1), null);
  assert.equal((wbsApi.get('p-wbs-2', work.id).subtasks || []).length, 0);
});

test('updateItem keeps createdAt and changes updatedAt', () => {
  boot({ id:'p-wbs-3', name:'P', tasks:[] });
  const work = wbsApi.createWorkItem('p-wbs-3', 'کار', null, {}, t1);
  const updated = wbsApi.updateItem('p-wbs-3', work.id, { text:'کار ویرایش' }, t2);
  assert.equal(updated.createdAt, '2026-01-01T00:00:00.000Z');
  assert.equal(updated.updatedAt, '2026-01-02T00:00:00.000Z');
});

test('reorder stamps updatedAt on persisted siblings', () => {
  boot({ id:'p-wbs-4', name:'P', tasks:[] });
  const a = wbsApi.createWorkItem('p-wbs-4', 'A', null, {}, t1);
  const b = wbsApi.createWorkItem('p-wbs-4', 'B', null, {}, t1);
  const ordered = wbsApi.reorder('p-wbs-4', a.id, [b.id, a.id], null, t3);
  assert.equal(ordered[0].id, b.id);
  assert.equal(ordered[0].createdAt, '2026-01-01T00:00:00.000Z');
  assert.equal(ordered[0].updatedAt, '2026-01-03T00:00:00.000Z');
  assert.equal(projectRepository.find('p-wbs-4').tasks[0].id, b.id);
});

test('reorder persists sibling stages below the root', () => {
  boot({ id:'p-wbs-nested-order', name:'P', tasks:[] });
  const root = wbsApi.createStage('p-wbs-nested-order', 'Root', null, t1);
  const first = wbsApi.createStage('p-wbs-nested-order', 'First', root.id, t1);
  const second = wbsApi.createStage('p-wbs-nested-order', 'Second', root.id, t1);

  const ordered = wbsApi.reorder(
    'p-wbs-nested-order',
    root.id,
    [second.id, first.id],
    root.id,
    t3,
  );

  assert.ok(ordered);
  assert.deepEqual(
    projectRepository.find('p-wbs-nested-order').tasks[0].subtasks.map(item => item.id),
    [second.id, first.id],
  );
});

test('attachActivity dedupes and detachActivity removes', () => {
  boot({ id:'p-wbs-5', name:'P', tasks:[] });
  const work = wbsApi.createWorkItem('p-wbs-5', 'کار', null, { activities:['act-1'] }, t1);
  const once = wbsApi.attachActivity('p-wbs-5', work.id, 'act-2', t2);
  const twice = wbsApi.attachActivity('p-wbs-5', work.id, 'act-2', t3);
  assert.deepEqual(once.activityIds, ['act-1', 'act-2']);
  assert.deepEqual(twice.activityIds, ['act-1', 'act-2']);
  const detached = wbsApi.detachActivity('p-wbs-5', work.id, 'act-1', t3);
  assert.deepEqual(detached.activityIds, ['act-2']);
  assert.deepEqual(detached.activities, ['act-2']);
});

test('old activities field and legacy cost remain readable', () => {
  boot({
    id:'p-wbs-6',
    name:'قدیمی',
    tasks:[{ id:'old-1', text:'آیتم قدیمی', cost:40, activities:['a9'], subtasks:[] }],
  });
  const item = wbsApi.get('p-wbs-6', 'old-1');
  assert.equal(item.kind, 'work');
  assert.equal(item.unitCost, 40);
  assert.deepEqual(item.activityIds, ['a9']);
  assert.equal(item.createdAt, undefined);
  const tasks = projectRepository.find('p-wbs-6').tasks;
  assert.equal(tasks[0].text, 'آیتم قدیمی');
  assert.equal(tasks.length, 1);
});

test('done maps to completed status and 100 progress', () => {
  boot({ id:'p-wbs-7', name:'P', tasks:[{ id:'d1', text:'x', done:true, subtasks:[] }] });
  const item = wbsApi.get('p-wbs-7', 'd1');
  assert.equal(item.status, 'completed');
  assert.equal(item.progress, 100);
});

test('progress is canonical and checkbox-style reset clears completed state', () => {
  boot({ id:'p-wbs-progress', name:'P', tasks:[] });
  const work = wbsApi.createWorkItem('p-wbs-progress', 'کار', null, { progressWeight:10 }, t1);
  const completed = wbsApi.updateItem('p-wbs-progress', work.id, { progress:100 }, t2);
  assert.equal(completed.done, true);
  assert.equal(completed.status, 'completed');
  const reset = wbsApi.updateItem('p-wbs-progress', work.id, { progress:0 }, t3);
  assert.equal(reset.done, false);
  assert.equal(reset.status, 'not_started');
  assert.equal(reset.progress, 0);
  assert.equal(reset.completedAt, null);
  assert.equal(reset.progressWeight, 10);
});

test('unrelated functional updates preserve partial progress', () => {
  boot({ id:'p-wbs-partial', name:'P', tasks:[] });
  const work = wbsApi.createWorkItem('p-wbs-partial', 'کار', null, {}, t1);
  wbsApi.updateItem('p-wbs-partial', work.id, { progress:40 }, t2);
  const attached = wbsApi.attachActivity('p-wbs-partial', work.id, 'activity-1', t3);
  assert.equal(attached.progress, 40);
  assert.equal(attached.status, 'in_progress');
  assert.equal(attached.done, false);
});

test('stage child type is locked by its first active child', () => {
  boot({ id:'p-wbs-child-kind', name:'P', tasks:[] });
  const stageParent = wbsApi.createStage('p-wbs-child-kind', 'مراحل', null, { progressWeight:2 }, t1);
  wbsApi.createStage('p-wbs-child-kind', 'زیرمرحله', stageParent.id, { progressWeight:3 }, t1);
  assert.equal(wbsApi.createWorkItem('p-wbs-child-kind', 'کار نامعتبر', stageParent.id, {}, t1), null);
  const workParent = wbsApi.createStage('p-wbs-child-kind', 'کارها', null, { progressWeight:4 }, t1);
  wbsApi.createWorkItem('p-wbs-child-kind', 'کار', workParent.id, {}, t1);
  assert.equal(wbsApi.createStage('p-wbs-child-kind', 'زیرمرحله نامعتبر', workParent.id, { progressWeight:1 }, t1), null);
});

test('general cost create update soft-delete restore', () => {
  boot({ id:'p-wbs-8', name:'P', tasks:[] });
  const created = generalCostApi.create('p-wbs-8', 'نگهبانی', t1);
  generalCostApi.update('p-wbs-8', created.id, { quantity:12, unit:'ماه', unitCost:2 }, t2);
  const removed = generalCostApi.remove('p-wbs-8', created.id, t3);
  assert.equal(removed.trashed, true);
  assert.equal(generalCostApi.list('p-wbs-8').length, 0);
  assert.equal(generalCostApi.listAll('p-wbs-8').length, 1);
  const restored = generalCostApi.restore('p-wbs-8', created.id, t3);
  assert.equal(restored.trashed, false);
  assert.equal(generalCostApi.list('p-wbs-8').length, 1);
});

test('project estimate includes WBS and general conditions but not trashed general', () => {
  boot({ id:'p-wbs-9', name:'P', tasks:[] });
  wbsApi.createWorkItem('p-wbs-9', 'کار', null, { quantity:2, unitCost:10 }, t1);
  const g = generalCostApi.create('p-wbs-9', 'ایمنی', t1);
  generalCostApi.update('p-wbs-9', g.id, { quantity:3, unitCost:5 }, t2);
  assert.equal(wbsApi.estimate('p-wbs-9').projectTotal, 35);
  generalCostApi.remove('p-wbs-9', g.id, t3);
  assert.equal(wbsApi.estimate('p-wbs-9').projectTotal, 20);
});

test('export reads live project and keeps schema timestamps activityIds', () => {
  boot({
    id:'p-wbs-10',
    name:'صادرات',
    tasks:[{
      id:'w1', kind:'work', text:'خرید میلگرد', activities:['act-x'],
      quantity:1, unitCost:8, createdAt:'2026-01-01T00:00:00.000Z', updatedAt:'2026-01-02T00:00:00.000Z',
      subtasks:[],
    }],
    generalConditions:[{ id:'g1', title:'اداری', quantity:1, unitCost:4, createdAt:'2026-01-01T00:00:00.000Z' }],
  });
  const payload = exportProjectWbs('p-wbs-10', t3);
  assert.equal(validateWbsExport(payload).ok, true);
  assert.equal(payload.schema, WBS_EXPORT_SCHEMA);
  assert.equal(payload.version, 1);
  assert.deepEqual(payload.items[0].activityIds, ['act-x']);
  assert.equal(payload.items[0].createdAt, '2026-01-01T00:00:00.000Z');
  assert.equal(payload.generalConditions[0].title, 'اداری');
  assert.equal(payload.totals.project, 12);
});

test('reparent moves work between stages and keeps the same id', () => {
  boot({ id:'p-wbs-11', name:'P', tasks:[] });
  const a = wbsApi.createStage('p-wbs-11', 'A', null, t1);
  const b = wbsApi.createStage('p-wbs-11', 'B', null, t1);
  const work = wbsApi.createWorkItem('p-wbs-11', 'کار', a.id, {}, t1);
  const moved = wbsApi.reparent('p-wbs-11', work.id, b.id, null, t2);
  assert.equal(moved.id, work.id);
  assert.equal(wbsApi.get('p-wbs-11', a.id).subtasks.length, 0);
  assert.equal(wbsApi.get('p-wbs-11', b.id).subtasks[0].id, work.id);
});

test('reparent does not stamp unrelated roots', () => {
  boot({ id:'p-wbs-13', name:'P', tasks:[] });
  const keep = wbsApi.createStage('p-wbs-13', 'ثابت', null, t1);
  const from = wbsApi.createStage('p-wbs-13', 'مبدا', null, t1);
  const to = wbsApi.createStage('p-wbs-13', 'مقصد', null, t1);
  const work = wbsApi.createWorkItem('p-wbs-13', 'کار', from.id, {}, t1);
  const before = wbsApi.get('p-wbs-13', keep.id).updatedAt;
  wbsApi.reparent('p-wbs-13', work.id, to.id, null, t3);
  const after = wbsApi.get('p-wbs-13', keep.id);
  assert.equal(after.updatedAt, before);
  assert.equal(after.createdAt, keep.createdAt);
  assert.equal(wbsApi.get('p-wbs-13', work.id).createdAt, work.createdAt);
  assert.equal(wbsApi.get('p-wbs-13', work.id).updatedAt, '2026-01-03T00:00:00.000Z');
});

test('reparent rejects any item under a work item', () => {
  boot({ id:'p-wbs-12', name:'P', tasks:[] });
  const work = wbsApi.createWorkItem('p-wbs-12', 'کار', null, {}, t1);
  const stage = wbsApi.createStage('p-wbs-12', 'مرحله', null, t1);
  const otherWork = wbsApi.createWorkItem('p-wbs-12', 'کار دیگر', null, {}, t1);
  assert.equal(wbsApi.reparent('p-wbs-12', stage.id, work.id), null);
  assert.equal(wbsApi.reparent('p-wbs-12', otherWork.id, work.id), null);
  assert.equal(wbsApi.list('p-wbs-12').some(item => item.id === stage.id), true);
  assert.equal(wbsApi.list('p-wbs-12').some(item => item.id === otherWork.id), true);
});
});
