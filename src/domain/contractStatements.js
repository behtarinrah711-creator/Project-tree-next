export const statementsFor=(project,id)=>(project.contractStatusReports||[]).filter(record=>!record.trashed && String(record.contractId)===String(id));
export const approvedStatement=record=>record.accountingStatus==='accepted' || (!record.statementType && record.approvalStatus==='approved');
const amount=value=>Number.isFinite(Number(value))?Number(value):0;

export function contractStatementTotals(project,contract){
  const original=contract.amount==null || contract.amount===''?null:amount(contract.amount);
  const adjustments=(project.contractAddenda||[]).filter(record=>!record.trashed && String(record.parentContractId)===String(contract.id) && record.accountingStatus==='accepted')
    .reduce((sum,record)=>sum+amount(record.accountingPackage?.contract?.amount ?? record.amount),0);
  const total=original===null?null:original+adjustments;
  const rate=Math.max(0,Math.min(100,amount(contract.retentionPercent)));
  const approved=statementsFor(project,contract.id).filter(approvedStatement);
  const gross=approved.reduce((sum,record)=>sum+amount(record.approvedAmount ?? record.stageAmount),0);
  const retained=approved.reduce((sum,record)=>sum+amount(record.retentionAmount),0);
  const paid=approved.reduce((sum,record)=>sum+amount(record.paidAmount),0);
  const estimatedRetention=total===null?null:Math.round(total*rate/100);
  return {original,adjustments,total,rate,gross,retained,paid,estimatedRetention,
    remaining:total===null?null:total-gross,payable:gross-retained-paid};
}

export function statementAmounts(totals,contract,gross){
  const nextGross=totals.gross+gross;
  const target=contract.retentionMethod==='first' && totals.estimatedRetention!==null
    ? Math.min(nextGross,totals.estimatedRetention)
    : Math.round(nextGross*totals.rate/100);
  const retentionAmount=target-totals.retained;
  return {stageAmount:gross,cumulativeAmount:nextGross,retentionAmount,netAmount:gross-retentionAmount};
}
