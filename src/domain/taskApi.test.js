import test from 'node:test';
import assert from 'node:assert/strict';
import { canDeleteTask, findTaskReferences } from './deleteGuard.js';

test('task delete is blocked if the node or a descendant is referenced by contract.projectItemId', () => {
  const projects = [{
    id:'p1',
    tasks:[{ id:'t1', subtasks:[{ id:'s1', subtasks:[] }] }],
    contracts:[{ id:'rc1', projectItemId:'s1' }],
  }];
  assert.equal(canDeleteTask(projects, 't1').ok, false);
  assert.equal(canDeleteTask(projects, 't1', 's1').ok, false);
  assert.deepEqual(findTaskReferences(projects, 't1').map(r => r.kind), ['contract']);
});

test('unreferenced sibling subtask can be deleted even if parent task is referenced', () => {
  const projects = [{
    id:'p1',
    tasks:[{ id:'t1', subtasks:[{ id:'s1' }, { id:'s2' }] }],
    contracts:[{ id:'rc1', projectItemId:'t1' }],
  }];
  assert.equal(canDeleteTask(projects, 't1').ok, false);
  assert.equal(canDeleteTask(projects, 't1', 's2').ok, true);
});
