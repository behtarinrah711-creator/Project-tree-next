import {contractApproverIds} from '../../src/domain/contractApproval.js';
import {contractStatementTotals,statementsFor,approvedStatement,statementAmounts} from '../../src/domain/contractStatements.js';

const fail=message=>({ok:false,message});

export function saveStatement(project,parent,current,id,body,actor,at){
  if(parent?.accountingStatus!=='accepted')return fail('ابتدا قرارداد اصلی باید در مالی تأیید شود');
  if(current && (!current.statementType || current.status!=='draft'))return fail('فقط صورت‌وضعیت برگشتی قابل اصلاح است');
  const {statementType,date,note}=body;
  if(!['interim','final'].includes(statementType) || typeof date!=='string' || !/^\d{4}\/(?:0?[1-9]|1[0-2])\/(?:0?[1-9]|[12]\d|3[01])$/.test(date))return fail('نوع و تاریخ صورت‌وضعیت را وارد کنید');
  const records=statementsFor(project,parent.id).filter(record=>record.id!==id);
  if(records.some(record=>record.statementType==='final' && approvedStatement(record)))return fail('صورت‌وضعیت قطعی قبلاً تأیید شده است');
  if(records.some(record=>record.statementType && !approvedStatement(record) && record.status!=='draft' && record.approvalStatus!=='rejected'))return fail('ابتدا صورت‌وضعیت در جریان را تعیین تکلیف کنید');
  const totals=contractStatementTotals(project,parent);
  const entered=body.amount;
  if(!Number.isSafeInteger(entered) || entered<0 || (statementType==='interim' && entered===0))return fail('مبلغ صورت‌وضعیت نامعتبر است');
  const gross=statementType==='final'?entered-totals.gross:entered;
  if(totals.remaining!==null && gross>totals.remaining)return fail('کارکرد از مبلغ به‌روز قرارداد بیشتر است');
  const approvers=contractApproverIds(parent);
  const sequence=current?.sequence ?? Math.max(0,...records.map(record=>Number(record.sequence)||0),records.length)+1;
  return {ok:true,contract:{...current,id,contractId:parent.id,statementType,sequence,date,note:String(note||'').trim().slice(0,2000),
    ...statementAmounts(totals,parent,gross),status:'final',isDraft:false,approvalStatus:approvers.length?'pending':'approved',
    approvalContactIds:approvers,approvedContactIds:[],submittedAt:at,submittedBy:actor,
    accountingStatus:null,signedAt:null,signedBy:null,signedFiles:[],signedFilesUpdatedAt:at,createdAt:current?.createdAt ?? at,updatedAt:at}};
}

export function recordStatementPayment(statement,value,actor,at){
  if(statement.accountingStatus!=='accepted' || !Number.isSafeInteger(value) || value<=0 || value>statement.netAmount-(statement.paidAmount||0)){
    return fail('مبلغ پرداخت باید در محدوده مانده قابل پرداخت باشد');
  }
  return {ok:true,contract:{...statement,paidAmount:(statement.paidAmount||0)+value,updatedAt:at,
    payments:[...(statement.payments||[]),{amount:value,actor,at}]}};
}
