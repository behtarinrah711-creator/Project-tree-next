import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeSharedProjectPayload} from '../src/app.js';
test('content editors cannot change the revision baseline or the approval state',()=>{
 const current={tasks:[],contracts:[{id:'c',approvalStatus:'unapproved',revisionBaseline:'original',title:'قبل',updatedAt:1}]};
 const incoming={tasks:[],contracts:[{...current.contracts[0],revisionBaseline:'forged',approvalStatus:'approved',title:'بعد',updatedAt:2}]};
 const result=mergeSharedProjectPayload(current,incoming,{modules:{contracts:'edit'}});
 assert.equal(result.contracts[0].title,'بعد');
 assert.equal(result.contracts[0].revisionBaseline,'original');
 assert.equal(result.contracts[0].approvalStatus,'unapproved');
});
