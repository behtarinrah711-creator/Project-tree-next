import { syncContractAmount, numericValue, ensureAgreedRows } from './contractPricing.js';
import { syncPaymentStages } from './paymentStagesModule.js';
import { contractApi } from '../../domain/contractApi.js';
import * as realContractDomain from './realContractDomain.js';

function today(){
  const d=new Date();
  return d.toISOString().slice(0,10);
}

export function saveRealContract(projectId, draft, helpers={}){
  const project=realContractDomain.getProject(projectId);
  if(!project || !draft) return {ok:false};

  const toast=helpers.showToast || (()=>{});
  const todayJalali=helpers.todayJalaliStr || today;
  const findActivity=helpers.findActivityTemplate || ((id,p)=>
    (p.activityTemplates||[]).find(a=>String(a.id)===String(id)));

  if(!draft.contractDate){toast('تاریخ تنظیم قرارداد را انتخاب کنید');return {ok:false,incomplete:true};}
  if(draft.contractDate>todayJalali()){toast('تاریخ تنظیم قرارداد نمی‌تواند بعد از امروز باشد');return {ok:false,incomplete:true};}
  if(!draft.projectItemId){toast('ابتدا آیتم پروژه را انتخاب کنید');return {ok:false,incomplete:true};}
  if(!draft.employerId){toast('ابتدا کارفرما را انتخاب کنید');return {ok:false,incomplete:true};}
  if(!draft.contractorId){toast('ابتدا پیمانکار را انتخاب کنید');return {ok:false,incomplete:true};}
  if(String(draft.employerId)===String(draft.contractorId)){
    toast('کارفرما و پیمانکار نمی‌توانند یک مخاطب باشند');return {ok:false,incomplete:true};
  }
  if(!draft.activityId){toast('ابتدا فعالیت پیمانکار را انتخاب کنید');return {ok:false,incomplete:true};}
  draft.activityIds=[draft.activityId];
  if(!draft.startDate){toast('تاریخ شروع قرارداد را انتخاب کنید');return {ok:false,incomplete:true};}
  if(!draft.endDate){toast('تاریخ پایان قرارداد را انتخاب کنید');return {ok:false,incomplete:true};}
  if(draft.endDate && draft.startDate && draft.endDate<draft.startDate){
    toast('تاریخ پایان نمی‌تواند قبل از تاریخ شروع باشد');return {ok:false,incomplete:true};
  }
  if(Array.isArray(draft.operationRows)){
    if(!draft.operationRows.length || draft.operationRows.some(row=>
      !String(row.description||'').trim() ||
      (row.pricingMode==='quantity'
        ? !row.unit || numericValue(row.quantity)<=0 || numericValue(row.unitPrice)<=0
        : row.pricingMode!=='agreed' || numericValue(row.agreedPrice)<=0))){
      toast('شرح و بهای عملیات‌ها و در حالت مقداری، واحد و مقدار را کامل کنید');return {ok:false,incomplete:true};
    }
  }
  if(!Array.isArray(draft.operationRows) && draft.amountMethod==='agreed'){
    const rows=ensureAgreedRows(draft);
    if(!rows.length || rows.some(row=>!String(row.description||'').trim() || numericValue(row.agreedPrice)<=0)){
      toast('شرح عملیات و بهای توافقی عملیات‌ها را کامل کنید');return {ok:false,incomplete:true};
    }
  }
  syncContractAmount(draft);
  if(draft.paymentMethod==='quantity'){
    const rows=draft.paymentRows;
    if(!Array.isArray(rows) || !rows.length || rows.some(row=>
      !String(row.description||'').trim() || (row.pricingMode==='agreed'
        ? numericValue(row.agreedPrice)<=0
        : !row.unit || numericValue(row.quantity)<=0 || numericValue(row.unitPrice)<=0))){
      toast('شرح و بهای مراحل پرداخت و در حالت مقداری، واحد و مقدار را کامل کنید');return {ok:false,incomplete:true};
    }
  }
  for(const rows of [!Array.isArray(draft.operationRows) && draft.amountMethod==='quantity'?draft.amountRows:null].filter(rows=>rows!==null)){
    if(!Array.isArray(rows) || !rows.length){toast('حداقل یک ردیف وارد کنید');return {ok:false,incomplete:true};}
    if(rows.some(row=>!String(row.description||'').trim() || !row.unit || numericValue(row.quantity)<=0 || numericValue(row.unitPrice)<=0)){
      toast('شرح عملیات، واحد، مقدار و بهای واحد ردیف‌ها را کامل کنید');return {ok:false,incomplete:true};
    }
  }
  if(!String(draft.amount||'').trim()||Number(draft.amount)<=0){
    toast('مبلغ کل قرارداد را وارد کنید');return {ok:false,incomplete:true};
  }
  if(Number(draft.retentionPercent)<0||Number(draft.retentionPercent)>100){
    toast('درصد حسن انجام کار باید بین صفر تا صد باشد');return {ok:false,incomplete:true};
  }
  if(!draft.retentionDuration){toast('مدت نگهداری حسن انجام کار را انتخاب کنید');return {ok:false,incomplete:true};}

  const s=JSON.parse(JSON.stringify(draft));
  s.contactId=s.contractorId;

  if(helpers.syncContractPartyData) helpers.syncContractPartyData(s,project);

  const activity=findActivity(s.activityId,project);
  const template=(project.contractTemplates||[]).find(t=>!t.trashed && String(t.id)===String(s.templateId));
  s.title=template?.title || s.title || 'قرارداد '+(activity?.name||'');
  s.items=(s.items||[]).map(x=>({...x,children:(x.children||[]).map(c=>({...c,children:[]}))}));
  realContractDomain.renumberRealContractItems(s.items);

  const toEnglish=helpers.toEnglishDigits || (v=>String(v??''));
  s.amount=toEnglish(s.amount||'').replace(/[^\d]/g,'');
  s.retentionPercent=toEnglish(s.retentionPercent||'').replace(/[^\d]/g,'');
  const finalRetention=(Number(s.amount)||0)*(Number(s.retentionPercent)||0)/100;
  s.retentionAmount=String(Math.round(finalRetention));
  s.amountAfterRetention=String(Math.max(0,Math.round((Number(s.amount)||0)-finalRetention)));
  syncPaymentStages(s);
  s.updatedAt=Date.now();
  s.trashed=false;

  const saved=contractApi.save(project.id,s);
  if(!saved.ok) return {ok:false, message:saved.message};
  return {ok:true,contract:saved.contract};
}
