import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppDataStore } from '../data/appDataStore.js';
import { docToProjectFromCloud } from './docToProject.js';

test('refresh hydration keeps a newly created WBS workTask over stale cloud project data', () => {
  const appDataStore = createAppDataStore({ storage:null });
  const localExisting = {
    id:'p1', name:'کشتارگاه', ownerUid:'u1',
    tasks:[{
      id:'w-fridge', title:'خرید یخچال', updatedAt:100,
      workTasks:[{ id:'wt-send-fridge', title:'ارسال یخچال به پروژه', createdAt:300, updatedAt:300 }],
    }],
  };
  const doc = {
    id:'p1',
    data:() => ({
      name:'کشتارگاه', ownerUid:'u1', schemaVersion:8,
      tasks:[{ id:'w-fridge', title:'خرید یخچال', updatedAt:100, workTasks:[] }],
    }),
  };

  const project = docToProjectFromCloud(doc, localExisting, {
    appDataStore,
    normalizeTaskRecord:value => ({ ...value, id:String(value.id) }),
    getRecoveredLocalTasks:() => [],
  });

  assert.equal(project.tasks.length, 1);
  assert.equal(project.tasks[0].workTasks.length, 1);
  assert.equal(project.tasks[0].workTasks[0].title, 'ارسال یخچال به پروژه');
});

test('cloud hydration shares receipts and allocations with other project members', () => {
  const project = docToProjectFromCloud({
    id:'p1',
    data:() => ({
      name:'P', ownerUid:'u1',
      fundingReceipts:[{id:'r1',amount:50}],
      fundingAllocations:[{taskId:'t1',amount:20}],
      fundingLedgerVersion:1,
    }),
  }, {id:'p1',fundingReceipts:[],fundingAllocations:[]}, {
    appDataStore:createAppDataStore({storage:null}),
  });
  assert.equal(project.fundingReceipts[0].amount,50);
  assert.equal(project.fundingAllocations[0].amount,20);
  assert.equal(project.fundingLedgerVersion,1);
});
