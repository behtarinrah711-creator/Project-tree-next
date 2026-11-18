import test from 'node:test';
import assert from 'node:assert/strict';
import {reviseContract} from './contractRevision.js';

const actor={id:'member',name:'مسئول قرارداد'};
const contract={id:'c',contractNo:'CTR-1',status:'final',approvalStatus:'approved',accountingStatus:'accepted',handoffVersion:3};
const save=(documents,changes={title:'اصلاح عنوان'},reason='اصلاح عنوان')=>
  reviseContract({contractStatusReports:documents},contract,changes,reason,actor,10);

test('an unpaid document permits an audited revision to draft',()=>{
  const {contract:next}=save([{contractId:'c',accountingStatus:'accepted',paidAmount:0}],{id:'other',title:'اصلاح عنوان'});
  assert.equal(next.id,contract.id);
  assert.equal(next.contractNo,contract.contractNo);
  assert.equal(next.handoffVersion,4);
  assert.equal(next.status,'draft');
  assert.equal(next.accountingStatus,null);
  assert.equal(next.approvalHistory.at(-1).reason,'اصلاح عنوان');
  assert.equal(contract.accountingStatus,'accepted');
});
test('partial payments and payments against addenda lock the parent only',()=>{
  assert.equal(save([{contractId:'c',paidAmount:1}]).ok,false);
  assert.equal(save([{contractId:'c',addendumId:'a',payments:[{amount:1}]}]).ok,false);
  assert.equal(save([{contractId:'different',paidAmount:100}]).ok,true);
});
test('a revision requires its reason',()=>assert.equal(save([],{},' ').ok,false));
