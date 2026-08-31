import test from 'node:test';
import assert from 'node:assert/strict';
import {flattenProject} from './recursiveProjectExport.js';

test('project export flattens every visible descendant depth',()=>{
  globalThis.window={KarhaLegacy:{isPendingDeleted:()=>false}};
  const project={tasks:[{
    id:'a',text:'parent',subtasks:[{
      id:'b',text:'child',subtasks:[{
        id:'c',text:'grandchild',subtasks:[{id:'d',text:'great-grandchild',subtasks:[]}]
      }]
    },{id:'done',text:'done',done:true,subtasks:[]}]
  }]};
  const rows=flattenProject(project,'p1');
  assert.deepEqual(rows.map(row=>[row.item.id,row.depth]),[['a',0],['b',1],['c',2],['d',3]]);
  assert.equal(new Set(rows.map(row=>row.key)).size,4);
  delete globalThis.window;
});
