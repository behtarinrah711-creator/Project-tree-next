import test from 'node:test';
import assert from 'node:assert/strict';
import {saveStatement,recordStatementPayment} from '../src/contractStatement.js';
import {contractOnAccountBalance,contractAdvanceDeductionBalance} from '../../src/domain/contractStatements.js';

test('on-account payments fund manual deductions only after payment',()=>{
  const parent={id:'c',accountingStatus:'accepted',amount:1000};
  const actor={id:'a'};
  const project={contractStatusReports:[]};
  const save=(id,fields)=>saveStatement(project,parent,null,id,{date:'1405/09/05',...fields},actor,1);
  const request=save('request',{statementType:'advance',paymentPurpose:'on-account',amount:100});
  assert.equal(request.ok,true);
  assert.equal(request.contract.advanceRow,undefined);
  const accepted={...request.contract,accountingStatus:'accepted'};
  project.contractStatusReports.push(accepted);
  assert.equal(contractOnAccountBalance(project,'c').available,0);
  assert.equal(recordStatementPayment(accepted,60,actor,2).ok,false);
  project.contractStatusReports[0]=recordStatementPayment(accepted,60,actor,2,[{id:'receipt'}]).contract;
  assert.equal(contractOnAccountBalance(project,'c').available,60);
  assert.equal(contractAdvanceDeductionBalance(project,'c').available,0);
  assert.equal(save('too-high',{statementType:'interim',amount:90,onAccountDeduction:61}).ok,false);
  assert.equal(save('above-net',{statementType:'interim',amount:20,onAccountDeduction:30}).ok,false);
  assert.equal(save('default',{statementType:'interim',amount:90}).contract.netAmount,90);
  const statement=save('interim',{statementType:'interim',amount:90,onAccountDeduction:30});
  assert.equal(statement.contract.netAmount,60);
  project.contractStatusReports.push(statement.contract);
  assert.equal(contractOnAccountBalance(project,'c').available,30);
});
