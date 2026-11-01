import { toEnglishDigits } from '../../ui/digits.js';

export const amountMethods = [
  {value:'agreed',label:'توافقی'},
  {value:'quantity',label:'بر اساس مقدار'}
];
export const quantityUnits = ['عدد','متر','مترمربع','مترمکعب','کیلوگرم','تن','لیتر','دستگاه','دست','سری','ساعت','روز']
  .map(value=>({value,label:value}));
export function numericValue(value){
  const number=Number(toEnglishDigits(String(value??'')).replace(/[,٬]/g,'').replace(/٫/g,'.'));
  return Number.isFinite(number) && number>=0 ? number : 0;
}
export function rowAmount(row){
  if(row.pricingMode==='agreed') return Math.round(numericValue(row.agreedPrice));
  return Math.round(numericValue(row.quantity)*numericValue(row.unitPrice));
}
export function ensureAgreedRows(state){
  if(!Array.isArray(state.agreedRows)){
    state.agreedRows=[{id:'agreed_1',description:state.amountDescription||'',
      agreedPrice:state.agreedAmount ?? (state.amountMethod==='quantity'?'':state.amount||'')}];
  }
  return state.agreedRows;
}
export function ensureOperationRows(state){
  if(!Array.isArray(state.operationRows)){
    const isNew=state.amountMethod==='';
    const quantity=isNew || state.amountMethod==='quantity';
    const rows=isNew ? [makeQuantityRow()] : quantity ? (state.amountRows||[]) : ensureAgreedRows(state);
    state.operationRows=rows.map(row=>({...row,pricingMode:quantity?'quantity':'agreed'}));
  }
  return state.operationRows;
}
export function isUnmeasuredRow(row,state={}){
  return row.pricingMode!=='agreed' && !!(row.remeasurement ?? state.remeasurement);
}
export function hasUnmeasuredOperations(state){
  const rows=state.operationRows ?? (state.amountMethod==='quantity'?state.amountRows:null);
  return Array.isArray(rows) ? rows.some(row=>isUnmeasuredRow(row,state)) : !!state.remeasurement;
}
export function syncContractAmount(state){
  const rows=state.operationRows ?? (state.amountMethod==='quantity'?state.amountRows:null);
  if(Array.isArray(rows)){
    rows.forEach(row=>{if(row.remeasurement==null)row.remeasurement=isUnmeasuredRow(row,state);});
    state.remeasurement=hasUnmeasuredOperations(state);
    state.knownAmount=String(rows.filter(row=>!isUnmeasuredRow(row)).reduce((sum,row)=>sum+rowAmount(row),0));
  }
  if(state.remeasurement){state.amount=null;return null;}
  if(Array.isArray(state.operationRows)){
    state.amount=String(state.operationRows.reduce((sum,row)=>sum+rowAmount(row),0));
    return state.amount;
  }
  if(state.amountMethod==='quantity') state.amount=String((state.amountRows||[]).reduce((sum,row)=>sum+rowAmount(row),0));
  if(state.amountMethod==='agreed' && Array.isArray(state.agreedRows)) state.amount=String(state.agreedRows.reduce((sum,row)=>sum+Math.round(numericValue(row.agreedPrice)),0));
  return state.amount;
}
export function makeQuantityRow(){
  return {id:'qr_'+crypto.randomUUID(),description:'',unit:'',quantity:'',unitPrice:'',remeasurement:false};
}

// Same row editor for pricing and payment quantities; arrays remain independent.
export function renderQuantityRows(root,rows,{numberRow,selectRow,pick,onChange,onDirty,operations=false,agreed=false,mixed=false}){
  const money=value=>new Intl.NumberFormat('fa-IR').format(value)+' تومان';
  const list=document.createElement('div');
  list.className='contract-quantity-list';
  rows.forEach((row,index)=>{
    const card=document.createElement('div');
    card.className='contract-quantity-row form-template';
    const header=document.createElement('div');
    header.className='contract-quantity-heading';
    const label=document.createElement('span');
    label.textContent=(operations?'عملیات ':'مرحله ')+new Intl.NumberFormat('fa-IR').format(index+1)+(operations?'':' پرداخت');
    const remove=document.createElement('button');
    remove.type='button';remove.textContent='حذف';remove.setAttribute('aria-label',(operations?'حذف عملیات ':'حذف ردیف ')+(index+1));
    remove.onclick=()=>{rows.splice(index,1);onChange();};
    header.appendChild(label);
    header.appendChild(remove);
    card.appendChild(header);
    const descLabel=document.createElement('label');
    descLabel.className='contract-quantity-description';
    const title=document.createElement('span');title.textContent='شرح عملیات';
    const description=document.createElement('textarea');
    description.rows=2;description.value=row.description||'';
    description.setAttribute('aria-label',(operations?'شرح عملیات ':'شرح عملیات ردیف ')+(index+1));
    // Mirror wraps in normal document flow, so all text stays visible without timers.
    const wrap=document.createElement('div');wrap.className='contract-growing-text';
    wrap.dataset.value=description.value+' ';
    description.oninput=()=>{row.description=description.value;wrap.dataset.value=description.value+' ';onDirty();};
    wrap.appendChild(description);descLabel.append(title,wrap);card.appendChild(descLabel);
    if(mixed){
      const choices=document.createElement('div');
      choices.className='ft-row contract-operation-method';
      choices.setAttribute('role','group');
      choices.setAttribute('aria-label','روش محاسبه عملیات '+(index+1));
      [{value:'agreed',label:'مبلغ توافقی'},{value:'quantity',label:'بر اساس مقدار'}].forEach(option=>{
        const label=document.createElement('label');
        const radio=document.createElement('input');
        radio.type='radio';radio.name='operation-method-'+row.id;
        radio.value=option.value;radio.checked=row.pricingMode===option.value;
        radio.onchange=()=>{if(radio.checked){row.pricingMode=option.value;onChange();}};
        label.append(radio,document.createTextNode(option.label));choices.appendChild(label);
      });
      card.appendChild(choices);
    }
    if(operations && row.pricingMode==='quantity'){
      const measurement=document.createElement('label');measurement.className='ft-row';
      const check=document.createElement('input');check.type='checkbox';check.checked=!!row.remeasurement;
      check.onchange=()=>{row.remeasurement=check.checked;onChange();};
      measurement.append(check,document.createTextNode('مقدار نهایی بعداً مشخص می‌شود'));card.appendChild(measurement);
    }
    const rateOnly=operations && isUnmeasuredRow(row);
    if(mixed && row.pricingMode!=='quantity'){
      numberRow(card,'بهای عملیات',row.agreedPrice,value=>{row.agreedPrice=value;},{suffix:'تومان'});
    }else if(agreed){
      numberRow(card,'بهای توافقی',row.agreedPrice,value=>{row.agreedPrice=value;},{suffix:'تومان'});
    }else{
      selectRow(card,'واحد',row.unit,()=>pick('انتخاب واحد','واحدها',quantityUnits,row.unit,value=>{row.unit=value;onChange();}));
      if(!rateOnly)numberRow(card,'مقدار',row.quantity,value=>{row.quantity=value;},{suffix:row.unit||'',allowDecimal:true});
      numberRow(card,'بهای واحد',row.unitPrice,value=>{row.unitPrice=value;},{suffix:'تومان'});
      const total=document.createElement('div');total.className='ft-row';
      const totalLabel=document.createElement('div');totalLabel.className='ft-label';totalLabel.textContent=mixed?'بهای عملیات:':'بهای کل:';
      const totalValue=document.createElement('div');totalValue.className='ft-value';totalValue.textContent=rateOnly?'پس از متره مشخص می‌شود':money(rowAmount(row));
      total.append(totalLabel,totalValue);
      card.appendChild(total);
    }
    list.appendChild(card);
  });
  const add=document.createElement('button');add.type='button';add.className='ctf-add-material contract-quantity-add';add.textContent=operations?'+ افزودن عملیات':'+ افزودن مرحله';
  add.onclick=()=>{rows.push({...makeQuantityRow(),...(mixed?{pricingMode:'quantity',agreedPrice:''}:{})});onChange();};
  list.appendChild(add);
  root.appendChild(list);
}


export function hasPaymentRowData(row){
  return ['description','unit','quantity','unitPrice','agreedPrice'].some(key=>String(row?.[key] ?? '').trim()!=='');
}
