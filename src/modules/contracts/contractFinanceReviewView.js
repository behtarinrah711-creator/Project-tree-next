import {openConfirm} from '../../ui/confirm.js';
import {openWbsSheet,closeWbsSheet,fieldRow} from '../wbs/wbsSheet.js';
import {currentExecutionActor} from '../wbs/executionActor.js';
import {saveContractHandoff} from './contractHandoffApi.js';
export function renderContractFinanceReview(project,contract,{onChanged=()=>{}}={}){
  const label=contract.parentContractId?'الحاقیه':'قرارداد';
  const root=document.createElement('div');root.className='contract-workflow-row contract-finance-actions';root.onclick=e=>e.stopPropagation();
  const access=window.KarhaSaosaWorkspaceAccess?.[project.id],permissions=access?.permissions||{};
  const levels=[permissions.modules?.accounting ?? permissions.accounting,permissions.modules?.['accounting-contracts'] ?? permissions['accounting-contracts']];
  const writable=!access || access.role==='owner' || levels.some(level=>['create','edit','full'].includes(level)) || (!permissions.modules && permissions.edit===true);
  if(!writable)return root;
  const toast=message=>window.KarhaLegacy?.showToast?.(message);let busy=false;
  const run=async(action,options={})=>{if(busy)return false;busy=true;try{await saveContractHandoff(project.id,contract,action,options);onChanged();return true;}catch(error){toast(error.message);return false;}finally{busy=false;}};
  const button=(text,action,danger=false)=>{const b=document.createElement('button');b.type='button';b.className='contract-review-action'+(danger?' danger':'');b.textContent=text;b.onclick=action;root.appendChild(b);};
  if(contract.accountingStatus==='accepted'){
    if(contract.accountingDecision?.actor?.id===currentExecutionActor(project).id)button('پس‌گرفتن تأیید مالی',()=>{const sheet=openWbsSheet({title:'پس‌گرفتن تأیید مالی',saveLabel:'ثبت پس‌گرفتن تأیید',historyKey:'finance-revoke:'+contract.id,
      body(body){const reason=document.createElement('textarea');reason.name='reason';reason.className='wbs-input today-textarea';reason.required=true;reason.minLength=5;body.appendChild(fieldRow('توضیح پس‌گرفتن تأیید (الزامی)',reason));},
      onSave(body){const reason=body.querySelector('[name="reason"]').value.trim();if(reason.length<5){toast('توضیح پس‌گرفتن تأیید مالی حداقل ۵ حرف باشد');return false;}run('revoke_finance',{reason}).then(ok=>{if(ok && sheet.isConnected)closeWbsSheet();});return false;}
    });});
  }else if(contract.accountingStatus==='sent'){
    button('تأیید '+label,()=>openConfirm(label+' توسط بخش مالی تأیید شود؟',()=>run('approve_finance'),'تأیید'));
    button('رد '+label,()=>{const sheet=openWbsSheet({title:'رد '+label+' توسط بخش مالی',saveLabel:'ثبت رد '+label,historyKey:'finance-reject:'+contract.id,
      body(body){const reason=document.createElement('textarea');reason.name='reason';reason.className='wbs-input today-textarea';reason.required=true;body.appendChild(fieldRow('دلیل رد '+label+' (الزامی)',reason));},
      onSave(body){const reason=body.querySelector('[name="reason"]').value.trim();if(reason.length<5){toast('دلیل رد قرارداد حداقل ۵ حرف باشد');return false;}run('reject_finance',{reason}).then(ok=>{if(ok && sheet.isConnected)closeWbsSheet();});return false;}
    });},true);
  }
  return root;
}
