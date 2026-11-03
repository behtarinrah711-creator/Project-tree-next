import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeSharedProjectPayload,stampContractCreation} from '../src/app.js';
const permissions={modules:{contracts:'edit'}};
test('member cancellation preserves contract data, checks identity and signed/approval locks',()=>{
 const c={id:'c',status:'final',approvalStatus:'approved',completedAt:1,amount:100,contractApproverContactIds:[]};
 const current={tasks:[],contracts:[c]};
 const request={action:'cancel_completion',reason:'بازبینی قرارداد لازم است',at:2,by:'writer'};
 const incoming={contracts:[{...c,amount:999,completionCancellation:request}]};
 let saved=mergeSharedProjectPayload(current,incoming,permissions,{id:'writer'}).contracts[0];
 assert.equal(saved.status,'draft');assert.equal(saved.amount,100);assert.equal(saved.completedAt,null);
 assert.equal(saved.approvalHistory.at(-1).reason,request.reason);
 assert.equal(mergeSharedProjectPayload(current,incoming,permissions,{id:'other'}).contracts[0].status,'final');
 for(const extra of [{signedAt:3},{contractApproverContactIds:['reviewer']}]){
  assert.equal(mergeSharedProjectPayload({...current,contracts:[{...c,...extra}]},incoming,permissions,{id:'writer'}).contracts[0].status,'final');
 }
});
test('server stamps completion using authenticated actor and preserves manual-field declarations',()=>{
 const previous={contracts:[{id:'c',status:'draft'}]};
 const project={contacts:[{id:'a',firstName:'مهندس',lastName:'احمدی',phone:'0912'}],contracts:[{id:'c',status:'final',completionDeclarationId:'declare-1',completedAt:1,completedBy:{id:'forged'},manualCompletionFields:['startDate','unknown'],approvalHistory:[]}]};
 stampContractCreation(project,previous,'account-a','0912',10);
 const c=project.contracts[0];assert.equal(c.completedBy.id,'account-a');assert.equal(c.completedBy.name,'مهندس احمدی');
 assert.deepEqual(c.manualCompletionFields,['startDate']);assert.equal(c.approvalHistory[0].action,'complete');
});

test('replaying an old declaration does not duplicate completion history or replace its author',()=>{
 const old={contracts:[{id:'c',status:'final',completionDeclarationId:'same',completedAt:10,completedBy:{id:'author'},manualCompletionFields:[],approvalHistory:[{action:'complete',at:10}]}]};
 const next={contracts:[{...old.contracts[0],completedAt:1,completedBy:{id:'forged'}}]};
 stampContractCreation(next,old,'another','',20);
 assert.equal(next.contracts[0].completedAt,10);assert.equal(next.contracts[0].completedBy.id,'author');assert.equal(next.contracts[0].approvalHistory.length,1);
});
