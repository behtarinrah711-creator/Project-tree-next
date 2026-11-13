import {hasPaymentRowData,ensureOperationRows,isUnmeasuredRow,numericValue,rowAmount} from '../modules/contracts/contractPricing.js';

export function statementWorkRows(contract,records){
  return ensureOperationRows({...contract}).map((row,index)=>{
    const key=String(row.id ?? index);
    const measured=row.pricingMode==='quantity';
    const limit=measured?(isUnmeasuredRow(row,contract) || row.quantity==null || row.quantity===''?null:numericValue(row.quantity)):numericValue(row.agreedPrice);
    const previous=records.flatMap(record=>record.operations||[]).filter(item=>item.contractRowId===key)
      .reduce((sum,item)=>sum+numericValue(measured?item.quantity:item.agreedPrice),0);
    return {...row,key,measured,limit,previous};
  }).filter(hasPaymentRowData);
}

export function resolveStatementWork(rows,entries){
  if(!Array.isArray(entries) || !entries.length || new Set(entries.map(entry=>entry?.key)).size!==entries.length)return null;
  const operations=[];
  for(const entry of entries){
    const row=rows.find(item=>item.key===entry?.key);
    const value=entry?.value;
    if(!row || !Number.isFinite(value) || value<=0)return null;
    const percent=entry.method==='percent';
    if(percent ? (!row.measured || row.limit===null || value>100) : entry.method!==(row.measured?'quantity':'amount'))return null;
    const performed=percent?Number((row.limit*value/100).toPrecision(14)):value;
    if(row.limit!==null && performed>row.limit-row.previous+Number.EPSILON*Math.max(1,row.limit)*8)return null;
    const operation={contractRowId:row.key,description:row.description,pricingMode:row.measured?'quantity':'agreed',
      ...(row.measured?{unit:row.unit,quantity:performed,unitPrice:numericValue(row.unitPrice)}:{agreedPrice:performed})};
    if(!Number.isSafeInteger(rowAmount(operation)) || rowAmount(operation)<=0)return null;
    operations.push(operation);
  }
  return operations;
}
