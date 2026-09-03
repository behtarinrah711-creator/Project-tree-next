import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceExpansionLevel,
  collapseAll,
  expandAll,
  getExpandedIds,
  isExpanded,
  resetExpandState,
  seedCollapsed,
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

test('global expansion opens one depth per press and then collapses in a loop', () => {
  resetExpandState();
  const tree = [{ id:'root', subtasks:[
    { id:'short', subtasks:[] },
    { id:'deep', subtasks:[{ id:'leaf', subtasks:[] }] },
  ] }];
  seedCollapsed('loop');
  assert.deepEqual([...getExpandedIds('loop')], []);

  assert.deepEqual(advanceExpansionLevel('loop', tree), { collapsed:false, visibleDepth:1 });
  assert.deepEqual([...getExpandedIds('loop')], ['root']);

  assert.deepEqual(advanceExpansionLevel('loop', tree), { collapsed:false, visibleDepth:2 });
  assert.deepEqual([...getExpandedIds('loop')], ['root', 'deep']);

  assert.deepEqual(advanceExpansionLevel('loop', tree), { collapsed:true, visibleDepth:0 });
  assert.deepEqual([...getExpandedIds('loop')], []);
});

test('progressive expansion ignores trashed branches', () => {
  resetExpandState();
  const tree = [{ id:'root', subtasks:[
    { id:'visible', subtasks:[] },
    { id:'trashed', trashed:true, subtasks:[{ id:'hidden', subtasks:[] }] },
  ] }];
  advanceExpansionLevel('trash', tree);
  assert.equal(isExpanded('trash', 'root'), true);
  assert.deepEqual(advanceExpansionLevel('trash', tree), { collapsed:true, visibleDepth:0 });
});
