import test from 'node:test';
import assert from 'node:assert/strict';
import { validInitialRelations } from './predecessorField.js';

test('hidden stale predecessors are discarded before an unchanged task is saved', () => {
  const relations = validInitialRelations([
    { predecessorId:'existing', type:'SS', lagDays:2 },
    { predecessorId:'deleted', type:'FS', lagDays:0 },
  ], [{ id:'existing' }]);

  assert.deepEqual(relations, [{ predecessorId:'existing', type:'SS', lagDays:2 }]);
});
