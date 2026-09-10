import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEffectiveNetwork, calculateCpm, plannedProgress, validatePredecessors } from './scheduling.js';

test('planned progress is calendar-day based and bounded', () => {
  assert.equal(plannedProgress('1405/01/01', '1405/01/10', 20532), 0);
  const start = 20533;
  assert.equal(plannedProgress('1405/01/01', '1405/01/10', start), 0);
  assert.equal(plannedProgress('1405/01/01', '1405/01/10', start + 9), 100);
});

test('predecessors reject cycles and package plus descendant duplication', () => {
  const tree = [{ id:'s', kind:'stage', subtasks:[{ id:'a', kind:'work', predecessorIds:[], workTasks:[] }, { id:'b', kind:'work', predecessorIds:['a'], workTasks:[] }] }];
  assert.equal(validatePredecessors(tree, 'a', ['b']).code, 'cycle');
  assert.equal(validatePredecessors(tree, 'b', ['s', 'a']).code, 'duplicate_scope');
});

test('CPM uses latest predecessor and only reports float on anchored paths', () => {
  const result = calculateCpm([
    { id:'a', duration:3 }, { id:'b', duration:5 }, { id:'c', duration:2, predecessorIds:['a','b'] },
  ], { projectFinish:10 });
  assert.equal(result.ok, true);
  assert.equal(result.rows.get('c').earlyStart, 5);
  assert.equal(result.rows.get('c').totalFloat, 3);
  const open = calculateCpm([{ id:'x', duration:2 }]);
  assert.equal(open.rows.get('x').totalFloat, null);
});

test('package predecessors expand to all effective Task leaves', () => {
  const tree = [
    { id:'package', kind:'stage', subtasks:[{ id:'source', kind:'work', workTasks:[{ id:'t1' }, { id:'t2' }] }] },
    { id:'target', kind:'work', predecessorIds:['package'], workTasks:[] },
  ];
  const network = buildEffectiveNetwork(tree);
  assert.deepEqual(network.activities.find(row => row.id === 'target').predecessorIds, ['t1','t2']);
  assert.deepEqual(network.unresolved, []);
});
