import test from 'node:test';
import assert from 'node:assert/strict';
import { saveStatement, recordStatementPayment } from '../src/contractStatement.js';
import { contractStatementTotals } from '../../src/domain/contractStatements.js';

test('approved addenda increase the retention basis and only approved statements affect balances',()=>{
  const parent={id:'c',amount:100000000,retentionPercent:10,retentionMethod:'all',accountingStatus:'accepted'};
  const project={contractAddenda:[
    {parentContractId:'c',amount:20000000,accountingStatus:'accepted'},
    {parentContractId:'c',amount:50000000,accountingStatus:'sent'},
  ],contractStatusReports:[]};
  const actor={id:'member'};
  const body={statementType:'interim',date:'1405/08/26',amount:70000000};
  const result=saveStatement(project,parent,null,'s1',body,actor,1);
  assert.equal(result.ok,true);
  assert.equal(result.contract.retentionAmount,7000000);
  project.contractStatusReports.push(result.contract);
  assert.equal(contractStatementTotals(project,parent).estimatedRetention,12000000);
  assert.equal(contractStatementTotals(project,parent).gross,0);
  assert.equal(saveStatement(project,parent,null,'s2',body,actor,2).ok,false);
  Object.assign(result.contract,{accountingStatus:'accepted'});
  assert.equal(recordStatementPayment(result.contract,64000000,actor,2).ok,false);
  project.contractStatusReports[0]=recordStatementPayment(result.contract,50000000,actor,2).contract;
  const totals=contractStatementTotals(project,parent);
  assert.equal(totals.remaining,50000000);
  assert.equal(totals.payable,13000000);
  const request={...body,statementType:'final',amount:1};
  assert.equal(saveStatement(project,parent,null,'s2',request,actor,3).ok,false);
  const remaining=saveStatement(project,parent,null,'s2',{...body,amount:50000000},actor,3).contract;
  project.contractStatusReports.push(remaining);
  assert.equal(saveStatement(project,parent,null,'s3',request,actor,4).ok,false);
  remaining.accountingStatus='accepted';
  const final=saveStatement(project,parent,null,'s3',request,actor,4).contract;
  assert.deepEqual(final.finalTotals,{gross:120000000,retention:12000000,net:108000000});
  assert.equal(final.operations.length,2);
  assert.equal(final.stageAmount,0);
  assert.equal(final.netAmount,0);
  assert.equal(final.statementAmount,120000000);
});

test('first-payment retention covers the contract and approved addenda without exceeding current work',()=>{
  const parent={id:'c',amount:100,retentionPercent:10,retentionMethod:'first',accountingStatus:'accepted'};
  const project={contractAddenda:[{parentContractId:'c',accountingStatus:'accepted',amount:20}],contractStatusReports:[]};
  const body={statementType:'interim',date:'1405/08/26',amount:8};
  const first=saveStatement(project,parent,null,'s1',body,{id:'actor'},1).contract;
  assert.equal(first.retentionAmount,8);
  project.contractStatusReports.push({...first,accountingStatus:'accepted'});
  const second=saveStatement(project,parent,null,'s2',body,{id:'actor'},2).contract;
  assert.equal(second.retentionAmount,4);
  assert.equal(second.netAmount,4);
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
