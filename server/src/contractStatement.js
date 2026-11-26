import {statementWorkRows,resolveStatementWork} from '../../src/domain/statementWork.js';
import {rowAmount,numericValue} from '../../src/modules/contracts/contractPricing.js';
import {contractApproverIds,canEditAdvanceRequest} from '../../src/domain/contractApproval.js';
import {contractStatementTotals,accountStatements,statementsFor,statementAccount,statementAddenda,approvedStatement,statementAmounts,finalStatementSummary,contractAdvanceDeductionBalance,contractOnAccountBalance,isOnAccountPayment,advanceDeductionFromPercent,contractAdvanceRows} from '../../src/domain/contractStatements.js';

const fail=message=>({ok:false,message});

export function saveStatement(project,parent,current,id,body,actor,at){
  if(parent?.accountingStatus!=='accepted')return fail('ابتدا قرارداد اصلی باید در مالی تأیید شود');
  if(current && (current.statementType!==body.statementType || (current.statementType==='advance'?!canEditAdvanceRequest(current):current.status!=='draft' || current.approvalStatus==='pending')))return fail(current.statementType==='advance'?'پیش‌پرداخت در وضعیت فعلی قابل ویرایش نیست':'فقط صورت‌وضعیت برگشتی قابل اصلاح است');
  const {statementType,date,note}=body;
  if(!['interim','final','retention-release','advance'].includes(statementType) || typeof date!=='string' || !/^\d{4}\/(?:0?[1-9]|1[0-2])\/(?:0?[1-9]|[12]\d|3[01])$/.test(date))return fail('نوع و تاریخ صورت‌وضعیت را وارد کنید');
  const onAccount=statementType==='advance' && body.paymentPurpose==='on-account';
  if(current && isOnAccountPayment(current)!==onAccount)return fail('نوع درخواست پرداخت قابل تغییر نیست');
  if(body.paymentPurpose!==undefined && !onAccount)return fail('نوع درخواست پرداخت معتبر نیست');
  const addendumId=statementType==='advance'?null:current?current.addendumId:body.addendumId;
  const addendum=addendumId && statementAddenda(project,parent).find(item=>item.id===addendumId);
  if(addendumId && !addendum)return fail('الحاقیه تأییدشده این قرارداد را انتخاب کنید');
  const account=statementAccount(parent,addendum);
  const records=accountStatements(project,account).filter(record=>record.id!==id);
  if(['interim','final'].includes(statementType) && records.some(record=>record.statementType==='final' && approvedStatement(record)))return fail('صورت‌وضعیت قطعی قبلاً تأیید شده است');
  if(records.some(record=>record.statementType && record.statementType!=='advance' && statementType!=='advance' && !approvedStatement(record) && record.status!=='draft' && record.approvalStatus!=='rejected'))return fail('ابتدا صورت‌وضعیت در جریان را تعیین تکلیف کنید');
  const totals=contractStatementTotals(project,account);
  const final=statementType==='final'?finalStatementSummary(project,account):null;
  if(final && !final.ready)return fail('صدور صورت‌وضعیت قطعی پس از پوشش کامل مبلغ قرارداد در صورت‌وضعیت‌های موقت تأییدشده امکان‌پذیر است');
  const workRows=statementType==='interim'?statementWorkRows(account,records.filter(approvedStatement)):[];
  const linked=statementType==='interim' && (body.workEntries!==undefined || workRows.some(row=>row.description));
  const resolved=linked?resolveStatementWork(workRows,body.workEntries):null;
  if(linked && !resolved)return fail('کارکرد عملیات قرارداد را در محدوده مانده هر ردیف وارد کنید');
  const operations=final?.operations || resolved || [];
  if(!final && !linked && body.operations!==undefined){
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
  const entered=final?.gross ?? (!linked && body.operations===undefined?body.amount:operations.reduce((sum,row)=>sum+rowAmount(row),0));
  if(!Number.isSafeInteger(entered) || entered<0 || (['interim','advance'].includes(statementType) && entered===0))return fail('مبلغ صورت‌وضعیت نامعتبر است');
  const advanceRow=statementType==='advance' && !onAccount
    ? contractAdvanceRows(project,parent,id).find(row=>row.key===body.advanceRowKey)
    : null;
  if(statementType==='advance' && !onAccount && (!advanceRow || entered>advanceRow.balance)){
    return fail('ردیف پیش‌پرداخت قرارداد را انتخاب کنید و مبلغ را در محدوده مانده آن وارد کنید');
  }
  const gross=final?0:entered;
  if(statementType==='retention-release' && (entered<=0 || entered>totals.retained))return fail('مبلغ آزادسازی از مانده حسن انجام کار بیشتر است');
  if(statementType==='interim' && totals.remaining!==null && gross>totals.remaining)return fail('کارکرد از مبلغ به‌روز قرارداد بیشتر است');
  const amounts=statementAmounts(totals,account,gross,statementType);
  const deductsAdvance=statementType==='interim' && !addendumId;
  const advanceDeductionPercent=deductsAdvance?body.advanceDeductionPercent:undefined;
  const advanceBalance=contractAdvanceDeductionBalance(project,parent.id,id);
  const advanceDeduction=!deductsAdvance?0:advanceDeductionPercent===undefined
    ? body.advanceDeduction ?? 0
    : advanceDeductionFromPercent(advanceBalance.paid,advanceDeductionPercent);
  if(!Number.isSafeInteger(advanceDeduction) || advanceDeduction<0 ||
    advanceDeduction>advanceBalance.available || advanceDeduction>amounts.netAmount){
    return fail('درصد و مبلغ کسر پیش‌پرداخت باید در محدوده مانده پیش‌پرداخت و خالص صورت‌وضعیت باشند');
  }
  const onAccountDeduction=body.onAccountDeduction ?? 0;
  if(!Number.isSafeInteger(onAccountDeduction) || onAccountDeduction<0 ||
    (onAccountDeduction>0 && (statementType!=='interim' ||
      onAccountDeduction>contractOnAccountBalance(project,parent.id,id).available ||
      onAccountDeduction>amounts.netAmount-advanceDeduction))){
    return fail('کسر علی‌الحساب باید در محدوده مانده علی‌الحساب و خالص صورت‌وضعیت باشد');
  }
  const approvers=contractApproverIds(parent);
  const statementRecords=statementsFor(project,parent.id);
  const numberedRecords=statementType==='advance'
    ? statementRecords.filter(record=>record.statementType==='advance' && isOnAccountPayment(record)===onAccount)
    : statementRecords.filter(record=>!isOnAccountPayment(record));
  const sequence=current?.sequence ?? Math.max(0,...numberedRecords.map(record=>Number(record.sequence)||0),numberedRecords.length)+1;
  return {ok:true,contract:{...current,id,contractId:parent.id,addendumId:addendum?.id||null,addendumNo:addendum?.contractNo||null,statementType,sequence,date,note:String(note||'').trim().slice(0,2000),
    ...(statementType==='advance'?{
      creationEvent:current?.creationEvent || {action:'create',at:current?.createdAt??at,actor:current?current.submittedBy:actor},
      approvalHistory:[...(current?.approvalHistory||[]),...(current?[{action:'edit_advance',at,actor}]:[])],
    }:{}),
    ...(onAccount?{paymentPurpose:'on-account'}:{}),
    onAccountDeduction,
    operations,advanceRow:advanceRow?{key:advanceRow.key,number:advanceRow.number,description:advanceRow.description,dueText:advanceRow.dueText,total:advanceRow.total}:undefined,advanceDeduction,advanceDeductionPercent,workEntries:linked?body.workEntries:undefined,statementAmount:entered,...(final?{stageAmount:0,cumulativeAmount:final.gross,retentionAmount:0,netAmount:0,finalTotals:{gross:final.gross,retention:final.retention,net:final.net}}:{...amounts,netAmount:amounts.netAmount-advanceDeduction-onAccountDeduction}),status:statementType==='advance'?'draft':'final',isDraft:statementType==='advance',approvalStatus:statementType==='advance'?null:approvers.length?'pending':'approved',
    approvalContactIds:approvers,approvedContactIds:[],approvalRejectionReason:'',submittedAt:statementType==='advance'?null:at,submittedBy:statementType==='advance'?null:actor,
    accountingStatus:null,signedAt:null,signedBy:null,signedFiles:[],signedFilesUpdatedAt:at,createdAt:current?.createdAt ?? at,updatedAt:at}};
}

export function recordStatementPayment(statement,value,actor,at,receipts=[]){
  if(statement.statementType==='advance' && receipts.length!==1)return fail('برای هر پرداخت یک فیش واریزی بارگذاری کنید');
  if(statement.accountingStatus!=='accepted' || !Number.isSafeInteger(value) || value<=0 || value>statement.netAmount-(statement.paidAmount||0)){
    return fail('مبلغ پرداخت باید در محدوده مانده قابل پرداخت باشد');
  }
  const paymentEvent={action:'record_payment',at,actor,amount:value};
  return {ok:true,contract:{...statement,
    ...(statement.statementType==='advance'?{approvalHistory:[...(statement.approvalHistory||[]),paymentEvent],
      financeHistory:[...(statement.financeHistory||[]),paymentEvent]}:{}),
    paidAmount:(statement.paidAmount||0)+value,updatedAt:at,
    payments:[...(statement.payments||[]),{amount:value,actor,at,...(receipts.length?{receipts}:{})}]}};
}
