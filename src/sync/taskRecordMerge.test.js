import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeTaskRecords } from './taskRecordMerge.js';

const normalize = value => ({ ...value, id:String(value.id) });

test('canonical merge keeps newer nested WBS task data regardless of source order', () => {
  const staleCloud = [{ id:'w1', updatedAt:100, workTasks:[] }];
  const newerLocal = [{ id:'w1', updatedAt:100, workTasks:[{ id:'wt1', title:'ارسال یخچال به پروژه', createdAt:300, updatedAt:300 }] }];

  const cloudFirst = mergeTaskRecords([staleCloud, newerLocal], normalize);
  const localFirst = mergeTaskRecords([newerLocal, staleCloud], normalize);

  assert.equal(cloudFirst[0].workTasks[0].id, 'wt1');
  assert.equal(localFirst[0].workTasks[0].id, 'wt1');
});

test('canonical merge preserves both distinct task ids', () => {
  const merged = mergeTaskRecords([[{ id:'a' }], [{ id:'b' }]], normalize);
  assert.deepEqual(merged.map(item => item.id), ['a', 'b']);
});
