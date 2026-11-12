import {rowAmount,numericValue} from '../../src/modules/contracts/contractPricing.js';
import {contractApproverIds} from '../../src/domain/contractApproval.js';
import {contractStatementTotals,statementsFor,approvedStatement,statementAmounts,finalStatementSummary} from '../../src/domain/contractStatements.js';

const fail=message=>({ok:false,message});

export function saveStatement(project,parent,current,id,body,actor,at){
  if(parent?.accountingStatus!=='accepted')return fail('ابتدا قرارداد اصلی باید در مالی تأیید شود');
  if(current && (!current.statementType || current.status!=='draft'))return fail('فقط صورت‌وضعیت برگشتی قابل اصلاح است');
  const {statementType,date,note}=body;
  if(!['interim','final','retention-release'].includes(statementType) || typeof date!=='string' || !/^\d{4}\/(?:0?[1-9]|1[0-2])\/(?:0?[1-9]|[12]\d|3[01])$/.test(date))return fail('نوع و تاریخ صورت‌وضعیت را وارد کنید');
  const records=statementsFor(project,parent.id).filter(record=>record.id!==id);
  if(statementType!=='retention-release' && records.some(record=>record.statementType==='final' && approvedStatement(record)))return fail('صورت‌وضعیت قطعی قبلاً تأیید شده است');
  if(records.some(record=>record.statementType && !approvedStatement(record) && record.status!=='draft' && record.approvalStatus!=='rejected'))return fail('ابتدا صورت‌وضعیت در جریان را تعیین تکلیف کنید');
  const totals=contractStatementTotals(project,parent);
  const final=statementType==='final'?finalStatementSummary(project,parent):null;
  if(final && !final.ready)return fail('صدور صورت‌وضعیت قطعی پس از پوشش کامل مبلغ قرارداد در صورت‌وضعیت‌های موقت تأییدشده امکان‌پذیر است');
  const operations=final?.operations || [];
  if(!final && body.operations!==undefined){
    if(!Array.isArray(body.operations) || !body.operations.length || body.operations.length>40)return fail('بین یک تا چهل عملیات وارد کنید');
    for(const row of body.operations){
      const description=typeof row?.description==='string'?row.description.trim().slice(0,500):'';
      const unit=typeof row?.unit==='string'?row.unit.trim().slice(0,30):'';
      if(!description || !['quantity','agreed'].includes(row?.pricingMode))return fail('شرح و روش محاسبه عملیات را مشخص کنید');
      const operation=row.pricingMode==='quantity'
        ? {description,pricingMode:'quantity',unit,quantity:numericValue(row.quantity),unitPrice:numericValue(row.unitPrice)}
        : {description,pricingMode:'agreed',agreedPrice:numericValue(row.agreedPrice)};
      if((operation.pricingMode==='quantity' && !unit) || !Number.isSafeInteger(rowAmount(operation)) || rowAmount(operation)<=0)return fail('مبلغ یا مقدار و بهای عملیات را معتبر وارد کنید');
      operations.push(operation);
    }
  }else if(statementType==='retention-release')return fail('عملیات آزادسازی را وارد کنید');
  const entered=final?.gross ?? (body.operations===undefined?body.amount:operations.reduce((sum,row)=>sum+rowAmount(row),0));
  if(!Number.isSafeInteger(entered) || entered<0 || (statementType==='interim' && entered===0))return fail('مبلغ صورت‌وضعیت نامعتبر است');
  const gross=final?0:entered;
  if(statementType==='retention-release' && (entered<=0 || entered>totals.retained))return fail('مبلغ آزادسازی از مانده حسن انجام کار بیشتر است');
  if(statementType!=='retention-release' && totals.remaining!==null && gross>totals.remaining)return fail('کارکرد از مبلغ به‌روز قرارداد بیشتر است');
  const approvers=contractApproverIds(parent);
  const sequence=current?.sequence ?? Math.max(0,...records.map(record=>Number(record.sequence)||0),records.length)+1;
  return {ok:true,contract:{...current,id,contractId:parent.id,statementType,sequence,date,note:String(note||'').trim().slice(0,2000),
    operations,statementAmount:entered,...(final?{stageAmount:0,cumulativeAmount:final.gross,retentionAmount:0,netAmount:0,finalTotals:{gross:final.gross,retention:final.retention,net:final.net}}:statementAmounts(totals,parent,gross,statementType)),status:'final',isDraft:false,approvalStatus:approvers.length?'pending':'approved',
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
