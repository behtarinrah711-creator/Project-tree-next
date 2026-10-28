import { toPersianDigits } from '../../ui/digits.js';

export const retentionMethods = [
  {value:'first',label:'کسر از اولین پرداخت (با انتقال باقی‌مانده به مراحل بعد)'},
  {value:'all',label:'کسر متناسب از تمام پرداخت‌ها'}
];
const percent=value=>Number(value.toFixed(6));
export function calculatePaymentStages(state){
  const previous=Array.isArray(state.paymentStages)?state.paymentStages:[];
  const count=Math.min(10,Math.max(1,Math.trunc(Number(state.paymentStageCount)||previous.length||1)));
  const retention=Math.min(100,Math.max(0,Number(state.retentionPercent)||0));
  const amount=Math.max(0,Math.round(Number(state.amount)||0));
  const retained=Math.round(amount*retention/100);
  let remaining=retained, remainingPercent=retention, paid=0;
  return Array.from({length:count},(_,i)=>{
    const gross=Math.round(amount*(i+1)/count)-Math.round(amount*i/count);
    const grossPercent=100/count;
    const deductionPercent=state.retentionMethod==='all'?retention/count:Math.min(grossPercent,remainingPercent);
    remainingPercent=Math.max(0,remainingPercent-deductionPercent);
    const deduction=state.retentionMethod==='all'
      ? Math.round(retained*(i+1)/count)-Math.round(retained*i/count)
      : Math.min(gross,remaining);
    remaining-=deduction;
    const paymentAmount=gross-deduction;
    paid+=paymentAmount;
    return {id:previous[i]?.id||'ps_'+(i+1),progress:percent(100*(i+1)/count),
      paymentPercent:percent(grossPercent-deductionPercent),description:previous[i]?.description||'',
      grossAmount:gross,retentionAmount:deduction,paymentAmount,cumulativePaymentAmount:paid};
  });
}
export function syncPaymentStages(state){
  state.retentionMethod=state.retentionMethod==='all'?'all':'first';
  state.paymentStages=calculatePaymentStages(state);
  state.paymentStageCount=state.paymentStages.length;
  state.retentionAmount=String(state.paymentStages.reduce((sum,x)=>sum+x.retentionAmount,0));
  state.amountAfterRetention=String(state.paymentStages.reduce((sum,x)=>sum+x.paymentAmount,0));
  return state.paymentStages;
}
export function renderPaymentStages(body,state,{onDirty}={}){
  const stages=syncPaymentStages(state);
  const sec=document.createElement('div');
  sec.className='real-contract-section';
  sec.textContent='شرایط پرداخت';
  body.appendChild(sec);
  const list=document.createElement('div');
  list.className='contract-payment-stages';
  const money=value=>new Intl.NumberFormat('fa-IR').format(value)+' تومان';
  stages.forEach(x=>{
    const row=document.createElement('div');
    row.className='contract-payment-stage contract-payment-calculated';
    const progress=document.createElement('span');
    progress.textContent='پیشرفت '+toPersianDigits(String(x.progress))+'٪';
    const pay=document.createElement('span');
    pay.textContent='پرداخت '+toPersianDigits(String(x.paymentPercent))+'٪ — '+money(x.paymentAmount);
    pay.title='کسر حسن انجام کار: '+money(x.retentionAmount);
    const desc=document.createElement('input');
    desc.type='text';
    desc.placeholder='توضیح شرط پرداخت';
    desc.value=x.description;
    desc.oninput=()=>{x.description=desc.value;onDirty?.();};
    row.append(progress,pay,desc);
    list.appendChild(row);
  });
  body.appendChild(list);
  const release=document.createElement('div');
  release.className='contract-form-note';
  release.textContent='آزادسازی حسن انجام کار: '+money(Number(state.retentionAmount))+'، پس از تکمیل آخرین صورت‌وضعیت و پایان مدت نگهداری ('+(state.retentionDuration||'تعیین نشده')+') از '+(state.retentionBasis||'مبنای انتخاب‌شده');
  body.appendChild(release);
}
