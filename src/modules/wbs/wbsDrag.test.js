import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDrop } from './wbsDrag.js';

test('drop onto a stage reparents the dragged node', () => {
  const calls = [];
  applyDrop({
    draggedId: 'w1',
    targetId: 's1',
    targetKind: 'stage',
    onReparentInto: (...args) => { calls.push(args); return true; },
    onReorderSiblings: () => false,
  });
  assert.deepEqual(calls, [['w1', 's1']]);
});

test('drop onto a work item reorders as sibling', () => {
  const calls = [];
  applyDrop({
    draggedId: 'w1',
    targetId: 'w2',
    targetKind: 'work',
    onReparentInto: () => false,
    onReorderSiblings: (...args) => { calls.push(args); return true; },
  });
  assert.deepEqual(calls, [['w1', 'w2']]);
});

test('dropping a node onto itself is ignored', () => {
  assert.equal(applyDrop({ draggedId:'w1', targetId:'w1', targetKind:'work' }), false);
});
