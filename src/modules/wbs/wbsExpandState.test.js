import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collapseAll,
  expandAll,
  getExpandedIds,
  isExpanded,
  resetExpandState,
  seedRootLevel,
} from './wbsExpandState.js';

test('each project seeds its own roots and keeps collapse local', () => {
  resetExpandState();
  const projectA = [{ id:'a-root', subtasks:[{ id:'a-child' }] }];
  const projectB = [{ id:'b-root', subtasks:[{ id:'b-child' }] }];
  seedRootLevel('A', projectA);
  assert.equal(isExpanded('A', 'a-root'), true);
  assert.equal(isExpanded('A', 'a-child'), false);
  collapseAll('A');
  assert.equal(getExpandedIds('A').size, 0);
  seedRootLevel('B', projectB);
  assert.equal(isExpanded('B', 'b-root'), true);
  assert.equal(isExpanded('A', 'a-root'), false);
  assert.equal(isExpanded('B', 'a-root'), false);
  expandAll('A', projectA);
  assert.equal(isExpanded('A', 'a-child'), true);
  assert.equal(isExpanded('B', 'b-child'), false);
});
