import test, { describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { createAppDataStore } from '../../data/appDataStore.js';
import { wbsApi } from '../../domain/wbs/wbsApi.js';

globalThis.window = Object.assign(globalThis.window || {}, {
  location: { search:'', hash:'', href:'http://localhost/' },
});
globalThis.document = globalThis.document || { getElementById(){ return null; } };

const {
  selectProjectItem,
  selectActivity,
  selectContractTemplate,
  openContractTemplatePicker,
  contractActivityChoices,
} = await import('./contractPickers.js');

function boot(project){
  const map = new Map();
  const storage = {
    getItem(key){ return map.has(key) ? map.get(key) : null; },
    setItem(key, value){ map.set(key, String(value)); },
  };
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

describe('contract WBS activity flow', { concurrency: false }, () => {
test('zero-activity work item persists selected activity back onto the item', () => {
  boot({
    id:'p-c1',
    tasks:[{ id:'w0', text:'کار خالی', activities:[], subtasks:[] }],
    activityTemplates:[{ id:'act-a', name:'قالب‌بندی', trashed:false }],
    contractTemplates:[],
  });
  const state = {};
  selectProjectItem('p-c1', state, { name:'کار خالی', _raw:{ id:'w0', activities:[] } });
  assert.equal(state.activityId, '');
  selectActivity('p-c1', state, { id:'act-a' });
  assert.deepEqual(wbsApi.get('p-c1', 'w0').activityIds, ['act-a']);
  assert.equal(state.activityId, 'act-a');
});

test('single activity work item consumes that activity and auto-selects its only template', () => {
  boot({
    id:'p-c2',
    tasks:[{ id:'w1', text:'کار یک‌فعالیته', activities:['act-b'], subtasks:[] }],
    activityTemplates:[{ id:'act-b', name:'آرماتور', trashed:false }],
    contractTemplates:[{ id:'tpl-1', activityId:'act-b', paymentItems:[{ id:'pay' }], items:[{ title:'بند' }] }],
  });
  const state = {};
  selectProjectItem('p-c2', state, { name:'کار', _raw:{ id:'w1', activities:['act-b'] } });
  assert.equal(state.activityId, 'act-b');
  assert.equal(state.templateId, 'tpl-1');
  assert.equal(state.items.length, 1);
});

test('multiple activities restrict picker choices to attached ids', () => {
  boot({
    id:'p-c3',
    tasks:[{ id:'w2', text:'کار چندفعالیته', activities:['act-1','act-2'], subtasks:[] }],
    activityTemplates:[
      { id:'act-1', name:'A', trashed:false },
      { id:'act-2', name:'B', trashed:false },
      { id:'act-3', name:'C', trashed:false },
    ],
    contractTemplates:[],
  });
  const state = {};
  selectProjectItem('p-c3', state, { name:'کار', _raw:{ id:'w2', activities:['act-1','act-2'] } });
  assert.equal(state.activityId, '');
  const choices = contractActivityChoices('p-c3', state);
  assert.deepEqual(choices.map(x => x.id), ['act-1', 'act-2']);
  selectActivity('p-c3', state, { id:'act-1' });
  assert.equal(state.activityId, 'act-1');
  assert.deepEqual(state.activityIds, ['act-1', 'act-2']);
  assert.deepEqual(contractActivityChoices('p-c3', state).map(x => x.id), ['act-1', 'act-2']);
});

test('multiple templates for one activity are not auto-selected', () => {
  boot({
    id:'p-c4',
    tasks:[{ id:'w3', text:'کار', activities:['act-d'], subtasks:[] }],
    activityTemplates:[{ id:'act-d', name:'D', trashed:false }],
    contractTemplates:[
      { id:'tpl-a', activityId:'act-d', paymentItems:[], items:[] },
      { id:'tpl-b', activityId:'act-d', paymentItems:[], items:[] },
    ],
  });
  const state = {};
  selectProjectItem('p-c4', state, { name:'کار', _raw:{ id:'w3', activities:['act-d'] } });
  assert.equal(state.activityId, 'act-d');
  assert.equal(state.templateId, '');
  assert.deepEqual(state.items, []);
});

test('user can pick one of multiple templates into contract state', () => {
  boot({
    id:'p-c5',
    tasks:[{ id:'w5', text:'کار', activities:['act-e'], subtasks:[] }],
    activityTemplates:[{ id:'act-e', name:'E', trashed:false }],
    contractTemplates:[
      { id:'tpl-a', title:'قالب الف', activityId:'act-e', paymentItems:[{ id:'p1' }], items:[{ text:'بند الف' }] },
      { id:'tpl-b', title:'قالب ب', activityId:'act-e', paymentItems:[{ id:'p2' }], items:[{ text:'بند ب' }] },
    ],
  });
  const state = {};
  selectProjectItem('p-c5', state, { name:'کار', _raw:{ id:'w5', activities:['act-e'] } });
  assert.equal(state.templateId, '');
  let opened = null;
  window.KarhaSearchTemplate = {
    open(opts){ opened = opts; return true; },
  };
  openContractTemplatePicker('p-c5', state, () => {});
  assert.deepEqual(opened.items.map(x => x.id), ['tpl-a', 'tpl-b']);
  assert.equal(selectContractTemplate('p-c5', state, 'tpl-b'), true);
  assert.equal(state.templateId, 'tpl-b');
  assert.equal(state.items.length, 1);
  assert.equal(state.paymentItems[0].id, 'p2');
});
});
