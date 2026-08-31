import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeCollection,
  pickRecordByConflict,
  mergeProjectMetadata,
  shouldUploadCollection,
} from './mergePolicy.js';

test('empty cloud does not wipe non-empty local', () => {
  const r = mergeCollection([{ id:'a', name:'A' }], [], {});
  assert.equal(r.items.length, 1);
  assert.equal(r.keptLocalEmptyCloud, true);
  assert.equal(r.needsRepair, true);
});

test('empty local takes cloud', () => {
  const r = mergeCollection([], [{ id:'b' }], {});
  assert.equal(r.items[0].id, 'b');
});

test('without updatedAt on either side, local wins on conflict', () => {
  assert.equal(pickRecordByConflict({ id:'1', name:'L' }, { id:'1', name:'C' }).name, 'L');
});

test('with both updatedAt, newer wins', () => {
  const newer = pickRecordByConflict(
    { id:'1', name:'L', updatedAt: 1 },
    { id:'1', name:'C', updatedAt: 9 }
  );
  assert.equal(newer.name, 'C');
});

test('dirty flags force local collection', () => {
  const r = mergeCollection([{ id:'a' }], [{ id:'b' }], { dirty: true });
  assert.deepEqual(r.items.map(i => i.id), ['a']);
});

test('projectDirty keeps local metadata', () => {
  const m = mergeProjectMetadata(
    { name:'Local', trashed:false, archived:false },
    { name:'Cloud', trashed:true, archived:true },
    { projectDirty: true }
  );
  assert.equal(m.name, 'Local');
  assert.equal(m.trashed, false);
  assert.equal(m.archived, false);
});

test('shouldUploadCollection blocks empty payload over full store', () => {
  assert.equal(shouldUploadCollection([{ id:1 }], []), false);
  assert.equal(shouldUploadCollection([{ id:1 }], [{ id:1 }]), true);
});
