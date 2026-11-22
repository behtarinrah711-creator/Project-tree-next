import test from 'node:test';
import assert from 'node:assert/strict';
import { saveStatement, recordStatementPayment } from '../src/contractStatement.js';
import { contractStatementTotals } from '../../src/domain/contractStatements.js';

test('approved addenda have a separate retention basis and only approved statements affect balances',()=>{
  const parent={id:'c',amount:100000000,retentionPercent:10,retentionMethod:'all',accountingStatus:'accepted'};
  const project={contractAddenda:[
    {id:'a',parentContractId:'c',amount:20000000,accountingStatus:'accepted'},
    {parentContractId:'c',amount:50000000,accountingStatus:'sent'},
  ],contractStatusReports:[]};
  const actor={id:'member'};
  const body={statementType:'interim',date:'1405/08/26',amount:70000000};
  const result=saveStatement(project,parent,null,'s1',body,actor,1);
  assert.equal(result.ok,true);
  assert.equal(result.contract.retentionAmount,7000000);
  project.contractStatusReports.push(result.contract);
  assert.equal(contractStatementTotals(project,parent).estimatedRetention,10000000);
  assert.equal(contractStatementTotals(project,parent).gross,0);
  assert.equal(saveStatement(project,parent,null,'s2',body,actor,2).ok,false);
  Object.assign(result.contract,{accountingStatus:'accepted'});
  assert.equal(recordStatementPayment(result.contract,64000000,actor,2).ok,false);
  project.contractStatusReports[0]=recordStatementPayment(result.contract,50000000,actor,2).contract;
  const totals=contractStatementTotals(project,parent);
  assert.equal(totals.remaining,30000000);
  assert.equal(totals.payable,13000000);
  const request={...body,statementType:'final',amount:1};
  assert.equal(saveStatement(project,parent,null,'s2',request,actor,3).ok,false);
  const remaining=saveStatement(project,parent,null,'s2',{...body,amount:30000000},actor,3).contract;
  project.contractStatusReports.push(remaining);
  assert.equal(saveStatement(project,parent,null,'s3',request,actor,4).ok,false);
  remaining.accountingStatus='accepted';
  const final=saveStatement(project,parent,null,'s3',request,actor,4).contract;
  assert.deepEqual(final.finalTotals,{gross:100000000,retention:10000000,net:90000000});
  assert.equal(final.operations.length,2);
  assert.equal(final.stageAmount,0);
  assert.equal(final.netAmount,0);
  assert.equal(final.statementAmount,100000000);
  const addendum=saveStatement(project,parent,null,'a1',{...body,addendumId:'a',amount:20000000},actor,5);
  assert.equal(addendum.contract.retentionAmount,2000000);
  assert.equal(addendum.contract.cumulativeAmount,20000000);
  assert.equal(addendum.contract.addendumId,'a');
});

test('first-payment retention covers only the contract without exceeding current work',()=>{
  const parent={id:'c',amount:100,retentionPercent:10,retentionMethod:'first',accountingStatus:'accepted'};
  const project={contractAddenda:[{parentContractId:'c',accountingStatus:'accepted',amount:20}],contractStatusReports:[]};
  const body={statementType:'interim',date:'1405/08/26',amount:8};
  const first=saveStatement(project,parent,null,'s1',body,{id:'actor'},1).contract;
  assert.equal(first.retentionAmount,8);
  project.contractStatusReports.push({...first,accountingStatus:'accepted'});
  const second=saveStatement(project,parent,null,'s2',body,{id:'actor'},2).contract;
  assert.equal(second.retentionAmount,2);
  assert.equal(second.netAmount,6);
});

test('operation totals are calculated by the server and an approved release does not add work or get deducted again',()=>{
  const parent={id:'c',amount:1000,retentionPercent:10,retentionMethod:'all',accountingStatus:'accepted'};
  const project={contractStatusReports:[]};
  const actor={id:'member'};
  const agreed=value=>({description:'عملیات',pricingMode:'agreed',agreedPrice:value});
  const save=(type,operations)=>saveStatement(project,parent,null,'s'+project.contractStatusReports.length,
    {statementType:type,date:'1405/08/26',operations,amount:999},actor,1);
  const interim=save('interim',[agreed(200),{description:'نصب',pricingMode:'quantity',unit:'عدد',quantity:2,unitPrice:100}]);
  assert.equal(interim.contract.statementAmount,400);
  assert.equal(interim.contract.retentionAmount,40);
  project.contractStatusReports.push({...interim.contract,accountingStatus:'accepted'});
  assert.equal(save('retention-release',[agreed(41)]).ok,false);
  const release=save('retention-release',[agreed(30)]).contract;
  assert.equal(release.stageAmount,0);
  assert.equal(release.netAmount,30);
  project.contractStatusReports.push({...release,accountingStatus:'accepted'});
  assert.equal(contractStatementTotals(project,parent).retained,10);
  assert.equal(contractStatementTotals(project,parent).gross,400);
  assert.equal(save('interim',[agreed(100)]).contract.retentionAmount,10);
  project.contractStatusReports.push({...save('interim',[agreed(600)]).contract,accountingStatus:'accepted'});
  const final=save('final',[]).contract;
  assert.equal(final.operations.length,3);
  assert.equal(final.finalTotals.net,900);
  project.contractStatusReports.push({...final,accountingStatus:'accepted'});
  assert.equal(save('retention-release',[agreed(20)]).ok,true);
});

test('advance requests use a contract row and reserve its balance until released',()=>{
  const parent={id:'c',accountingStatus:'accepted',advanceRows:[
    {id:'first',description:'خرید مصالح',dueText:'پس از امضا',pricingMode:'agreed',agreedPrice:'۴۰٬۰۰۰'},
    {id:'second',pricingMode:'agreed',agreedPrice:20000},
  ]};
  const project={contractStatusReports:[]};
  const request={statementType:'advance',date:'1405/08/26',advanceRowKey:'first',amount:30000};
  const save=(patch={},current=null)=>saveStatement(project,parent,current,current?.id||'new',{...request,...patch},{id:'actor'},1);
  assert.equal(save({advanceRowKey:'missing'}).ok,false);
  const first=save().contract;
  assert.equal(first.advanceRow.dueText,'پس از امضا');
  assert.equal(first.advanceRow.total,40000);
  assert.equal(first.stageAmount,0);
  project.contractStatusReports.push({...first,id:'first-request',status:'final',isDraft:false,accountingStatus:'withdrawn'});
  assert.equal(save({amount:10001}).ok,false);
  assert.equal(save({amount:10000}).ok,true);
  assert.equal(save({advanceRowKey:'second',amount:20000}).ok,true);
  project.contractStatusReports[0].status='draft';
  assert.equal(save({amount:40000}).ok,true);
  project.contractStatusReports.push({id:'legacy',contractId:'c',statementType:'advance',statementAmount:25000,accountingStatus:'accepted'});
  assert.equal(save({amount:15001}).ok,false);
});

test('interim statements deduct a single percentage of the paid advance from combined work',()=>{
  const parent={id:'c',amount:100000,retentionPercent:10,accountingStatus:'accepted'};
  const advance={contractId:'c',statementType:'advance',statementAmount:50000,paidAmount:40000,accountingStatus:'accepted'};
  const project={contractStatusReports:[advance]};
  const operations=[10000,20000].map(agreedPrice=>({description:'کار',pricingMode:'agreed',agreedPrice}));
  const save=percent=>saveStatement(project,parent,null,'new',{
    statementType:'interim',date:'1405/08/26',operations,advanceDeductionPercent:percent,advanceDeduction:1,
  },{id:'actor'},1);
  assert.equal(save(20).contract.advanceDeduction,8000);
  assert.equal(save(20).contract.netAmount,19000);
  assert.equal(save(0).contract.advanceDeduction,0);
  assert.equal(save(101).ok,false);
  project.contractStatusReports.push({contractId:'c',status:'final',advanceDeduction:35000});
  assert.equal(save(20).ok,false);
});
