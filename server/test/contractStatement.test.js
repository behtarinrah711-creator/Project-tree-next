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
  const final=saveStatement(project,parent,null,'s2',{...body,statementType:'final',amount:120000000},actor,3);
  assert.equal(final.contract.stageAmount,50000000);
  assert.equal(final.contract.retentionAmount,5000000);
  assert.equal(final.contract.netAmount,45000000);
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
