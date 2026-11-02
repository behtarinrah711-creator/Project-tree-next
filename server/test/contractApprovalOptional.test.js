import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeSharedProjectPayload} from '../src/app.js';
test('member contracts skip approval only after completion and according to stored task reviewers',()=>{
 const task={id:'t',hasContract:true,contractApproverContactIds:[]};
 const current={tasks:[{id:'w',workTasks:[task]}],contracts:[]};
 const record={id:'c',projectItemId:'w',workTaskId:'t',status:'final',isDraft:false};
 const permissions={modules:{contracts:'edit'}};
 const merge=(c=current,r=record)=>mergeSharedProjectPayload(c,{tasks:c.tasks,contracts:[r]},permissions).contracts[0];
 assert.equal(merge().approvalStatus,'approved');assert.deepEqual(merge().approvedContactIds,[]);
 assert.notEqual(merge(current,{...record,status:'draft',isDraft:true}).approvalStatus,'approved');
 const required={...current,tasks:[{id:'w',workTasks:[{...task,contractApproverContactIds:['reviewer']}]}]};
 const saved=merge(required,{...record,approvalStatus:'approved',contractApproverContactIds:[]});
 assert.notEqual(saved.approvalStatus,'approved');assert.deepEqual(saved.contractApproverContactIds,['reviewer']);
 assert.notEqual(merge(current,{...record,workTaskId:'missing',approvalStatus:'approved'}).approvalStatus,'approved');
});
