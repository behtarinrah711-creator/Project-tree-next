import { syncContractAmount, hasPaymentRowData } from './contractPricing.js';
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
  const manual=new Set(helpers.manualFields || []);
  const deferred=key=>manual.has(key) && !String(draft[key]??'').trim();
  const findActivity=helpers.findActivityTemplate || ((id,p)=>
    (p.activityTemplates||[]).find(a=>String(a.id)===String(id)));

  if(!draft.contractDate && !deferred('contractDate')){toast('تاریخ تنظیم قرارداد را انتخاب کنید');return {ok:false,incomplete:true};}
  if(draft.contractDate>todayJalali()){toast('تاریخ تنظیم قرارداد نمی‌تواند بعد از امروز باشد');return {ok:false,incomplete:true};}
  if(!draft.employerId && !deferred('employerId')){toast('ابتدا کارفرما را انتخاب کنید');return {ok:false,incomplete:true};}
  if(draft.employerId && draft.contractorId && String(draft.employerId)===String(draft.contractorId)){
    toast('کارفرما و پیمانکار نمی‌توانند یک مخاطب باشند');return {ok:false,incomplete:true};
  }
  draft.activityIds=draft.activityId?[draft.activityId]:[];
  if(!draft.startDate && !deferred('startDate')){toast('تاریخ شروع قرارداد را انتخاب کنید');return {ok:false,incomplete:true};}
  if(!draft.endDate && !deferred('endDate')){toast('تاریخ پایان قرارداد را انتخاب کنید');return {ok:false,incomplete:true};}
  if(draft.endDate && draft.startDate && draft.endDate<draft.startDate){
    toast('تاریخ پایان نمی‌تواند قبل از تاریخ شروع باشد');return {ok:false,incomplete:true};
  }
  syncContractAmount(draft);
  if(Array.isArray(draft.paymentRows))draft.paymentRows=draft.paymentRows.filter(hasPaymentRowData);
  if(Number(draft.retentionPercent)<0||Number(draft.retentionPercent)>100){
    toast('درصد حسن انجام کار باید بین صفر تا صد باشد');return {ok:false,incomplete:true};
  }
  if(Number(draft.retentionPercent)>0 && !draft.retentionDuration && !deferred('retentionDuration')){toast('مدت نگهداری حسن انجام کار را انتخاب کنید');return {ok:false,incomplete:true};}

  const s=JSON.parse(JSON.stringify(draft));
  s.contactId=s.contractorId;
  if(deferred('employerId'))for(const key of ['employerName','employerNationalId','employerAddress','employerPhone'])s[key]='';

  if(helpers.syncContractPartyData) helpers.syncContractPartyData(s,project);

  const activity=findActivity(s.activityId,project);
  const template=(project.contractTemplates||[]).find(t=>!t.trashed && String(t.id)===String(s.templateId));
  s.title=s.title || template?.title || 'قرارداد '+(activity?.name||'');
  s.items=(s.items||[]).map(x=>({...x,children:(x.children||[]).map(c=>({...c,children:[]}))}));
  realContractDomain.renumberRealContractItems(s.items);

  const toEnglish=helpers.toEnglishDigits || (v=>String(v??''));
  s.amount=s.remeasurement ? null : toEnglish(s.amount||'').replace(/[^\d]/g,'');
  s.retentionPercent=toEnglish(s.retentionPercent||'').replace(/[^\d]/g,'');
  const finalRetention=(Number(s.amount)||0)*(Number(s.retentionPercent)||0)/100;
  s.retentionAmount=String(Math.round(finalRetention));
  s.amountAfterRetention=String(Math.max(0,Math.round((Number(s.amount)||0)-finalRetention)));
  if(s.remeasurement)s.retentionMethod='all';
  syncPaymentStages(s);
  s.updatedAt=Date.now();
  s.trashed=false;

  const saved=contractApi.save(project.id,s,{declareCompletion:!!helpers.declareCompletion,actor:helpers.actor,manualFields:[...manual].filter(key=>deferred(key))});
  if(!saved.ok) return {ok:false, message:saved.message};
  return {ok:true,contract:saved.contract};
}
