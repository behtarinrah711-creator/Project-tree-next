import test from 'node:test';
import assert from 'node:assert/strict';
import { collectTodayItems, contractorForItem, itemsForMode, remainingLabel, tehranTodayJalali } from './todayDomain.js';

function project(){
  return { contacts:[{ id:'contractor', name:'قراردادی' },{ id:'manual', name:'دستی' }], contracts:[{ id:'c1', projectItemId:'w1', contractorId:'contractor' }], tasks:[
    { id:'s1', kind:'stage', text:'سازه', subtasks:[
      { id:'w1', kind:'work', text:'فونداسیون', scheduleStart:'1405/06/01', scheduleEnd:'1405/06/20', contractorContactId:'manual', workTasks:[
        { id:'t1', workId:'w1', title:'قالب‌بندی', type:'اجرا', scheduleStart:'1405/06/18', scheduleEnd:'1405/06/18' },
        { id:'t2', workId:'w1', title:'آرماتور', type:'اجرا', scheduleStart:'', scheduleEnd:'' },
      ] },
      { id:'w2', kind:'work', text:'بتن', scheduleStart:'1405/06/19', scheduleEnd:'1405/06/22', workTasks:[] },
    ] },
  ] };
}

test('Today aggregation shows Tasks instead of their Work and falls back to a taskless Work', () => {
  const items = collectTodayItems(project(), '1405/06/18');
  assert.deepEqual(items.map(item => item.id), ['t1','t2','w2']);
  assert.equal(items.find(item => item.id === 't1').mode, 'today');
  assert.equal(items.find(item => item.id === 't2').mode, 'unscheduled');
  assert.equal(items.find(item => item.id === 'w2').mode, 'future');
  assert.equal(itemsForMode(project(), 'today', '1405/06/18').length, 1);
});

test('same-day work is rendered once and contract contractor overrides manual fallback', () => {
  const item = collectTodayItems(project(), '1405/06/18')[0];
  assert.equal(remainingLabel(item.entity, '1405/06/18'), 'امروز');
  assert.equal(contractorForItem(project(), item).contact.id, 'contractor');
  const withoutContract = project();
  withoutContract.contracts = [];
  item.entity.contractorContactId = 'manual';
  assert.equal(contractorForItem(withoutContract, item).contact.id, 'manual');
});

test('Tehran calendar crosses into Nowruz independently from UTC date', () => {
  assert.equal(tehranTodayJalali(new Date('2026-03-20T21:00:00.000Z')), '1405/01/01');
});
