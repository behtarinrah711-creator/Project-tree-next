import test from 'node:test';
import assert from 'node:assert/strict';
import { findNestedItem, findParentItem, itemChildren, walkItems } from './taskTree.js';

test('tree traversal preserves nested order, parents, depths, and lookup',()=>{
  const grandchild={id:'g'};const child={id:'c',subtasks:[grandchild]};const root={id:'r',subtasks:[child]};
  const visited=[];walkItems([root],(item,parent,depth)=>visited.push([item.id,parent?.id||null,depth]));
  assert.deepEqual(visited,[['r',null,0],['c','r',1],['g','c',2]]);
  assert.equal(findNestedItem([root],'g'),grandchild);
  assert.equal(findParentItem(root.subtasks,'g'),child);
  const empty={id:'e'};assert.equal(itemChildren(empty),empty.subtasks);assert.deepEqual(empty.subtasks,[]);
});
