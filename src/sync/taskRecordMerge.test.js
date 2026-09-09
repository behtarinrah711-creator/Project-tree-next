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

test('canonical merge unions distinct workTasks instead of replacing the whole Work record', () => {
  const cloud = [{
    id:'w1', updatedAt:'2026-09-09T10:00:00.000Z',
    workTasks:[{ id:'cloud-task', title:'قدیمی ابری', updatedAt:100 }],
  }];
  const local = [{
    id:'w1', updatedAt:'2026-09-09T09:00:00.000Z',
    workTasks:[{ id:'local-task', title:'ارسال یخچال به پروژه', updatedAt:300 }],
  }];

  const merged = mergeTaskRecords([cloud, local], normalize);
  assert.deepEqual(merged[0].workTasks.map(item => item.id), ['cloud-task', 'local-task']);
});

test('ISO WBS timestamps participate in scalar conflict resolution', () => {
  const older = [{ id:'w1', title:'نسخه قدیمی', updatedAt:'2026-09-09T09:00:00.000Z' }];
  const newer = [{ id:'w1', title:'نسخه جدید', updatedAt:'2026-09-09T10:00:00.000Z' }];
  const merged = mergeTaskRecords([older, newer], normalize);
  assert.equal(merged[0].title, 'نسخه جدید');
});

test('canonical merge preserves both distinct task ids', () => {
  const merged = mergeTaskRecords([[{ id:'a' }], [{ id:'b' }]], normalize);
  assert.deepEqual(merged.map(item => item.id), ['a', 'b']);
});
