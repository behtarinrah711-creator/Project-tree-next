import test from 'node:test';
import assert from 'node:assert/strict';
import { flattenNotebookItems } from './notebookExportView.js';

test('notebook export preserves every visible hierarchy depth',()=>{
  const rows=flattenNotebookItems([
    {id:'a',text:'A',children:[{id:'b',text:'B',children:[{id:'c',text:'C',children:[]}]}]},
    {id:'done',text:'Done',done:true,children:[]},
    {id:'trash',text:'Trash',trashed:true,children:[]},
  ]);
  assert.deepEqual(rows.map(row=>[row.key,row.depth,row.path]),[
    ['a',0,[]],['b',1,['A']],['c',2,['A','B']],
  ]);
});

test('notebook export does not mutate its source',()=>{
  const items=[{id:'a',text:'A',children:[]}];
  const before=JSON.stringify(items);
  flattenNotebookItems(items);
  assert.equal(JSON.stringify(items),before);
});
