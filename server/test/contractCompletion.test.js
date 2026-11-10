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

test('completion routes to WBS reviewers on the server and stale snapshots cannot undo it',()=>{
  const contacts=[{id:'reviewer'},{id:'other'}];
  const tasks=[{id:'w',kind:'work',workTasks:[{id:'t',hasContract:true,contractApproverContactIds:['reviewer','other']}]}];
  const record={id:'c',status:'draft',projectItemId:'w',workTaskId:'t'};
  const previous={tasks,contacts,contracts:[record]};
  const submitted={...record,status:'final',isDraft:false,completedAt:1,completionDeclarationId:'new',
    approvalStatus:'approved',approvedContactIds:['reviewer'],submittedBy:{id:'forged'}};
  const actor={id:'writer'};
  for(const permissions of [{modules:{contracts:'create'}},{edit:true}]){
    const incoming={...previous,contracts:[submitted]};
    const merged=mergeSharedProjectPayload(previous,structuredClone(incoming),permissions,actor);
    stampContractCreation(merged,previous,actor.id,'',10);
    const saved=merged.contracts[0];
    assert.equal(saved.approvalStatus,'pending');
    assert.deepEqual(saved.approvalContactIds,['reviewer','other']);
    assert.deepEqual(saved.approvedContactIds,[]);
    assert.equal(saved.submittedBy.id,'writer');
    assert.deepEqual(saved.approvalHistory.map(event=>event.action),['complete','submit']);
    const stale=mergeSharedProjectPayload(merged,structuredClone(incoming),permissions,actor);
    stampContractCreation(stale,merged,actor.id,'',20);
    assert.deepEqual(stale.contracts[0],saved);
  }
});

test('declaring unchanged returned contracts complete starts a fresh review using authenticated permissions',()=>{
  const contacts=[{id:'reviewer'}];
  const actor={id:'writer'};
  for(const reviewers of [[],['reviewer']]){
    const record={id:'c',status:'draft',isDraft:true,title:'قرارداد بدون تغییر',amount:100,
      approvalStatus:'unapproved',revisionBaseline:null,contractApproverContactIds:reviewers,
      approvalHistory:[{action:'revoke',reason:'بررسی دوباره لازم است',at:1}]};
    const previous={contacts,contracts:[record]};
    const incoming={contacts,contracts:[{...record,status:'final',isDraft:false,
      completionDeclarationId:'new-round',completedAt:2}]};
    const save=permissions=>{
      const merged=mergeSharedProjectPayload(previous,structuredClone(incoming),permissions,actor);
      return stampContractCreation(merged,previous,actor.id,'',10).contracts[0];
    };
    const denied=save({modules:{contracts:'view',accounting:'full'}});
    assert.equal(denied.status,'draft');
    assert.equal(denied.approvalStatus,'unapproved');
    const saved=save({modules:{contracts:'create'}});
    assert.equal(saved.title,record.title);
    assert.equal(saved.amount,record.amount);
    assert.equal(saved.approvalStatus,reviewers.length?'pending':'approved');
    assert.deepEqual(saved.approvedContactIds,[]);
    assert.deepEqual(saved.approvalContactIds,reviewers);
    assert.equal(saved.completedBy.id,actor.id);
    assert.equal(saved.approvalHistory[0].reason,'بررسی دوباره لازم است');
    assert.deepEqual(saved.approvalHistory.map(event=>event.action),reviewers.length
      ? ['revoke','complete','submit'] : ['revoke','complete']);
  }
});
