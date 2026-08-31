import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnoseTaskVisibility } from './diagnose-task-visibility.mjs';

test('reports only exact ID references and never changes the supplied snapshot',()=>{
  const snapshot={projects:[{
    id:'project-7',name:'تستی',
    tasks:[
      {id:'task-1',done:false,subtasks:[{id:'sub-1',done:true,trashed:true,deletedAt:123,deletedType:'subtask'}]},
      {id:'task-2',done:true,trashed:false,subtasks:[]},
    ],
    contacts:[{id:'contact-1'}],
    contracts:[
      {id:'contract-1',projectItemId:'sub-1',contractorId:'contact-1'},
      {id:'contract-2',projectItemId:'missing',contactId:'missing-contact'},
      {id:'ignored-trashed-contract',projectItemId:'task-2',trashed:true},
    ],
  }]};
  const before=structuredClone(snapshot);
  const report=diagnoseTaskVisibility(snapshot,'project-7');

  assert.deepEqual(report.counts,{tasks:2,records:3,trashed:1,done:2,visible:2});
  assert.deepEqual(report.referencedTrashed,[{
    contractId:'contract-1',id:'sub-1',kind:'subtask',rootTaskId:'task-1',parentId:'task-1',
    trashed:true,done:true,pendingDelete:false,deletedAt:123,deletedType:'subtask',deletedParentId:null,
  }]);
  assert.equal(report.itemReferences[1].target,null);
  assert.deepEqual(report.contactReferences.map(item=>item.exists),[true,false]);
  assert.deepEqual(snapshot,before);
});

test('requires project ID and does not select a project by name',()=>{
  const snapshot={projects:[{id:'real-id',name:'تستی',tasks:[]}]};
  assert.throws(()=>diagnoseTaskVisibility(snapshot,''),/projectId is required/);
  assert.deepEqual(diagnoseTaskVisibility(snapshot,'تستی'),{projectId:'تستی',found:false});
});
