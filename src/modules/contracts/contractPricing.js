import { toEnglishDigits } from '../../ui/digits.js';

export const amountMethods = [
  {value:'agreed',label:'توافقی'},
  {value:'quantity',label:'بر اساس مقدار'}
];
export const paymentMethods = [
  {value:'quantity',label:'بر اساس مقدار کار انجام شده'},
  {value:'percent',label:'بر اساس درصد کار انجام شده'},
  {value:'stages',label:'بر اساس مراحل انجام شده'},
  {value:'time',label:'بر اساس مدت زمان انجام شده'}
];
export const quantityUnits = ['عدد','متر','مترمربع','مترمکعب','کیلوگرم','تن','لیتر','دستگاه','دست','سری','ساعت','روز']
  .map(value=>({value,label:value}));
export function numericValue(value){
  const number=Number(toEnglishDigits(String(value??'')).replace(/[,٬]/g,'').replace(/٫/g,'.'));
  return Number.isFinite(number) && number>=0 ? number : 0;
}
export function rowAmount(row){
  return Math.round(numericValue(row.quantity)*numericValue(row.unitPrice));
}
export function syncContractAmount(state){
  if(state.amountMethod==='quantity') state.amount=String((state.amountRows||[]).reduce((sum,row)=>sum+rowAmount(row),0));
  return state.amount;
}
export function makeQuantityRow(){
  return {id:'qr_'+crypto.randomUUID(),description:'',unit:'',quantity:'',unitPrice:''};
}

// Same row editor for pricing and payment quantities; arrays remain independent.
export function renderQuantityRows(root,rows,{numberRow,selectRow,pick,onChange,onDirty}){
  const money=value=>new Intl.NumberFormat('fa-IR').format(value)+' تومان';
  const list=document.createElement('div');
  list.className='contract-quantity-list';
  rows.forEach((row,index)=>{
    const card=document.createElement('div');
    card.className='contract-quantity-row form-template';
    const header=document.createElement('div');
    header.className='contract-quantity-heading';
    const label=document.createElement('span');
    label.textContent='ردیف '+new Intl.NumberFormat('fa-IR').format(index+1);
    const remove=document.createElement('button');
    remove.type='button';remove.textContent='حذف';remove.setAttribute('aria-label','حذف ردیف '+(index+1));
    remove.onclick=()=>{rows.splice(index,1);onChange();};
    header.append(label,remove);card.appendChild(header);
    const descLabel=document.createElement('label');
    descLabel.className='contract-quantity-description';
    const title=document.createElement('span');title.textContent='شرح عملیات';
    const description=document.createElement('textarea');
    description.rows=2;description.value=row.description||'';
    description.setAttribute('aria-label','شرح عملیات ردیف '+(index+1));
    // Mirror wraps in normal document flow, so all text stays visible without timers.
    const wrap=document.createElement('div');wrap.className='contract-growing-text';
    wrap.dataset.value=description.value+' ';
    description.oninput=()=>{row.description=description.value;wrap.dataset.value=description.value+' ';onDirty();};
    wrap.appendChild(description);descLabel.append(title,wrap);card.appendChild(descLabel);
    selectRow(card,'واحد',row.unit,()=>pick('انتخاب واحد','واحدها',quantityUnits,row.unit,value=>{row.unit=value;onChange();}));
    numberRow(card,'مقدار',row.quantity,value=>{row.quantity=value;},{suffix:row.unit||'',allowDecimal:true});
    numberRow(card,'بهای واحد',row.unitPrice,value=>{row.unitPrice=value;},{suffix:'تومان'});
    const total=document.createElement('div');total.className='ft-calc';total.textContent='بهای کل: '+money(rowAmount(row));
    card.appendChild(total);list.appendChild(card);
  });
  const add=document.createElement('button');add.type='button';add.className='ctf-add-material';add.textContent='+ افزودن ردیف';
  add.onclick=()=>{rows.push(makeQuantityRow());onChange();};
  list.appendChild(add);root.appendChild(list);
}
