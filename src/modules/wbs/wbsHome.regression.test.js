import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { createAppDataStore } from '../../data/appDataStore.js';
import { wbsApi } from '../../domain/wbs/wbsApi.js';
import { generalCostApi } from '../../domain/wbs/generalCostApi.js';
import { exportProjectWbs, validateWbsExport } from '../../domain/wbs/exportSchema.js';

globalThis.window = Object.assign(globalThis.window || {}, {
  location: { search:'', hash:'', href:'http://localhost/' },
});
globalThis.document = globalThis.document || { getElementById(){ return null; } };

const {
  selectActivity,
  selectProjectItem,
} = await import('../contracts/contractPickers.js');

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

describe('WBS home regression path', { concurrency: false }, () => {
  test('stage/work/estimate/contract/export stay on one Project.tasks tree', () => {
    boot({
      id:'p-reg',
      name:'رگرسیون',
      tasks:[],
      activityTemplates:[{ id:'act-1', name:'قالب', trashed:false }],
      contractTemplates:[{ id:'tpl-1', activityId:'act-1', items:[{ text:'بند' }], paymentItems:[] }],
    });
    const stage = wbsApi.createStage('p-reg', 'فونداسیون');
    const work = wbsApi.createWorkItem('p-reg', 'بتن', stage.id, { quantity:2, unitCost:10 });
    generalCostApi.create('p-reg', 'ایمنی');
    const state = {};
    selectProjectItem('p-reg', state, { name: work.text, _raw: work });
    selectActivity('p-reg', state, { id:'act-1' });
    assert.deepEqual(wbsApi.get('p-reg', work.id).activityIds, ['act-1']);
    assert.equal(state.templateId, 'tpl-1');
    assert.equal(wbsApi.estimate('p-reg').wbs, 20);
    const payload = exportProjectWbs('p-reg');
    assert.equal(validateWbsExport(payload).ok, true);
    assert.equal(payload.items[0].kind, 'stage');
    assert.equal(payload.items[0].children[0].id, work.id);
  });
});
