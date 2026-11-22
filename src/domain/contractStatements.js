import {hasPaymentRowData,rowAmount} from '../modules/contracts/contractPricing.js';

export const statementsFor=(project,id)=>(project.contractStatusReports||[]).filter(record=>!record.trashed && String(record.contractId)===String(id));
export const approvedStatement=record=>record.accountingStatus==='accepted' || (!record.statementType && record.approvalStatus==='approved');
const amount=value=>Number.isFinite(Number(value))?Number(value):0;

export function statementAddenda(project,contract){
  return (project.contractAddenda||[]).filter(record=>!record.trashed && String(record.parentContractId)===String(contract.id) && record.accountingStatus==='accepted');
}

export function statementAccount(contract,addendum){
  if(!addendum)return contract;
  const document=addendum.accountingPackage?.contract || addendum;
  return {...contract,statementAddendumId:addendum.id,amount:document.amount,remeasurement:false,
    operationRows:(document.rows||[]).map(row=>({...row,remeasurement:false,
      pricingMode:row.pricingMode==='quantity' || (!row.pricingMode && row.unit)?'quantity':'agreed',
      agreedPrice:row.amount ?? row.agreedPrice}))};
}

export const accountStatements=(project,contract)=>statementsFor(project,contract.id)
  .filter(record=>(record.addendumId||null)===(contract.statementAddendumId||null));

export function contractAdvanceRows(project,contract,excludeId){
  const requests=statementsFor(project,contract.id).filter(record=>record.statementType==='advance' && record.id!==excludeId);
  const reserved=record=>record.status!=='draft' && record.approvalStatus!=='rejected' &&
    record.accountingStatus!=='rejected' ? amount(record.statementAmount) : amount(record.paidAmount);
  const rows=(contract.advanceRows||[]).filter(hasPaymentRowData).map((row,index)=>{
    const key=row.id || 'advance-'+index;
    const total=rowAmount(row);
    const linked=requests.filter(record=>record.advanceRow?.key===key);
    const balance=Math.max(0,total-linked.reduce((sum,record)=>sum+reserved(record),0));
    return {key,number:index+1,description:row.description||'',dueText:row.dueText||'',total,balance};
  });
  // Older documents have no row link; reserve their amounts in contract order.
  const keys=new Set(rows.map(row=>row.key));
  let unlinked=requests.filter(record=>!keys.has(record.advanceRow?.key)).reduce((sum,record)=>sum+reserved(record),0);
  for(const row of rows){
    const allocated=Math.min(unlinked,row.balance);
    row.balance-=allocated;
    unlinked-=allocated;
  }
  return rows;
}

export function contractAdvanceDeductionBalance(project,contractId,excludeId){
  const records=statementsFor(project,contractId).filter(record=>record.id!==excludeId);
  const paid=records.filter(record=>record.statementType==='advance' && approvedStatement(record))
    .reduce((sum,record)=>sum+amount(record.paidAmount),0);
  const committed=records.filter(record=>record.status!=='draft' &&
    record.approvalStatus!=='rejected' && !['rejected','withdrawn'].includes(record.accountingStatus))
    .reduce((sum,record)=>sum+amount(record.advanceDeduction),0);
  return {paid,available:Math.max(0,paid-committed)};
}

export function availableContractAdvance(project,contractId,excludeId){
  return contractAdvanceDeductionBalance(project,contractId,excludeId).available;
}

export function advanceDeductionFromPercent(paid,percent){
  return Number.isFinite(percent) && percent>=0 && percent<=100
    ? Math.round(paid*percent/100)
    : null;
}

export function contractStatementTotals(project,contract,{combined=false}={}){
  const original=contract.amount==null || contract.amount===''?null:amount(contract.amount);
  const adjustments=combined?statementAddenda(project,contract)
    .reduce((sum,record)=>sum+amount(record.accountingPackage?.contract?.amount ?? record.amount),0):0;
  const total=original===null?null:original+adjustments;
  const rate=Math.max(0,Math.min(100,amount(contract.retentionPercent)));
  const approved=(combined?statementsFor(project,contract.id):accountStatements(project,contract)).filter(approvedStatement);
  const gross=approved.reduce((sum,record)=>sum+amount(record.approvedAmount ?? record.stageAmount),0);
  const retained=approved.reduce((sum,record)=>sum+amount(record.retentionAmount),0);
  const released=approved.filter(record=>record.statementType==='retention-release').reduce((sum,record)=>sum+amount(record.netAmount),0);
  const paid=approved.reduce((sum,record)=>sum+amount(record.paidAmount),0);
  const estimatedRetention=total===null?null:Math.round(total*rate/100);
  return {original,adjustments,total,rate,gross,retained,released,paid,estimatedRetention,
    remaining:total===null?null:total-gross,payable:gross-retained-paid};
}

export function statementAmounts(totals,contract,gross,type){
  if(type==='advance')return {stageAmount:0,cumulativeAmount:totals.gross,retentionAmount:0,netAmount:gross};
  if(type==='retention-release')return {stageAmount:0,cumulativeAmount:totals.gross,retentionAmount:-gross,netAmount:gross};
  const nextGross=totals.gross+gross;
  const target=contract.retentionMethod==='first' && totals.estimatedRetention!==null
    ? Math.min(nextGross,totals.estimatedRetention)
    : Math.round(nextGross*totals.rate/100);
  const retentionAmount=Math.max(0,target-totals.retained-(totals.released||0));
  return {stageAmount:gross,cumulativeAmount:nextGross,retentionAmount,netAmount:gross-retentionAmount};
}


export function finalStatementSummary(project,contract){
  const totals=contractStatementTotals(project,contract);
  const interim=accountStatements(project,contract).filter(record=>
    (!record.statementType || record.statementType==='interim') && approvedStatement(record));
  const gross=interim.reduce((sum,record)=>sum+amount(record.approvedAmount ?? record.stageAmount),0);
  const retention=interim.reduce((sum,record)=>sum+amount(record.retentionAmount),0);
  const net=gross-retention;
  const operations=interim.flatMap(record=>{
    const rows=record.operations?.length?record.operations:[
      {description:'کارکرد ثبت‌شده',pricingMode:'agreed',agreedPrice:amount(record.approvedAmount ?? record.stageAmount)},
    ];
    return rows.map(row=>({...row,sourceStatementId:record.id,sourceSequence:record.sequence,sourceDate:record.date}));
  });
  const target=totals.total===null?null:totals.total-totals.estimatedRetention;
  const ready=interim.length>0 && totals.total!==null && gross===totals.total && net===target;
  return {operations,gross,retention,net,target,ready};
}
