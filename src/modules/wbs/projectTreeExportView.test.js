import test from 'node:test';
import assert from 'node:assert/strict';
import {setTreeExportSelection,treeExportNodes,visibleTreeExportRows} from './projectTreeExportView.js';

test('tree export preserves completed work, expansion and independent output order',()=>{
  const source=[{id:'parent',kind:'stage',text:'مرحله',subtasks:[
    {id:'a',kind:'work',text:'اول',done:true},
    {id:'b',kind:'work',text:'دوم'},
    {id:'deleted',kind:'work',trashed:true},
  ]}];
  const nodes=treeExportNodes(source);
  const [parent]=nodes;
  const rows=open=>visibleTreeExportRows(nodes,new Set(open)).map(({node})=>node.id);
  assert.deepEqual(rows([]),['parent']);
  assert.deepEqual(rows([parent.key]),['parent','a','b']);
  assert.equal(parent.children[0].done,true);
  parent.children.reverse();
  assert.deepEqual(rows([parent.key]),['parent','b','a']);
  assert.equal(source[0].subtasks[0].id,'a');
  setTreeExportSelection(parent,false);
  assert.deepEqual(rows([parent.key]),[]);
  setTreeExportSelection(parent,true);
  assert.deepEqual(rows([parent.key]),['parent','b','a']);
});
