import {FINANCE_REJECTION_MIN_LENGTH} from '../../domain/contractHandoff.js';
import {canWriteProjectModule} from '../roleManagement/permissionState.js';
import {openConfirm} from '../../ui/confirm.js';
import {openWbsSheet,closeWbsSheet,fieldRow} from '../wbs/wbsSheet.js';
import {currentExecutionActor} from '../wbs/executionActor.js';
import {saveContractHandoff} from './contractHandoffApi.js';
export function renderContractFinanceReview(project,contract,{onChanged=()=>{}}={}){
  const label=contract.parentContractId?'الحاقیه':'قرارداد';
  const root=document.createElement('div');root.className='contract-workflow-row contract-finance-actions';root.onclick=e=>e.stopPropagation();
  const access=window.KarhaSaosaWorkspaceAccess?.[project.id],permissions=access?.permissions||{};
  const module=Object.hasOwn(permissions.modules||permissions,'accounting-contracts')?'accounting-contracts':'accounting';
  if(!canWriteProjectModule(project.id,module))return root;
  const toast=message=>window.KarhaLegacy?.showToast?.(message);let busy=false;
  const run=async(action,options={})=>{if(busy || !canWriteProjectModule(project.id,module))return false;busy=true;try{await saveContractHandoff(project.id,contract,action,options);onChanged();return true;}catch(error){toast(error.message);return false;}finally{busy=false;}};
  const button=(text,action,danger=false)=>{const b=document.createElement('button');b.type='button';b.className='contract-review-action'+(danger?' danger':'');b.textContent=text;b.onclick=action;root.appendChild(b);};
  const openRejection=action=>{
    const revoke=action==='revoke_finance';
    const title=contract.parentContractId?'رد کردن الحاقیه':revoke?'پس‌گرفتن تأیید مالی':'رد قرارداد توسط بخش مالی';
    const count=new Intl.NumberFormat('fa-IR');
    let reason,counter;
    const sheet=openWbsSheet({
      title,saveLabel:contract.parentContractId?'ذخیره':revoke?'ثبت پس‌گرفتن تأیید':'ثبت رد قرارداد',
      historyKey:(revoke?'finance-revoke:':'finance-reject:')+contract.id,
      body(body){
        reason=document.createElement('textarea');
        reason.name='reason';reason.className='wbs-input today-textarea';reason.required=true;
        reason.setAttribute('aria-describedby','finance-rejection-count');
        counter=document.createElement('div');counter.id='finance-rejection-count';counter.className='finance-rejection-count';
        const field=fieldRow('دلیل رد (الزامی)',reason);
        reason.before(counter);
        body.append(field);
      },
      onSave(){
        if(save.disabled)return false;
        save.disabled=true;
        run(action,{reason:reason.value.trim()}).then(ok=>{
          if(ok && sheet.isConnected)closeWbsSheet();
          else if(sheet.isConnected)updateCounter();
        });
        return false;
      },
    });
    sheet.classList.add('wbs-sheet-centered-header');
    const save=sheet.querySelector('.wbs-sheet-save');
    const updateCounter=()=>{
      const length=reason.value.trim().length;
      const valid=length>=FINANCE_REJECTION_MIN_LENGTH;
      counter.textContent=count.format(length)+' از '+count.format(FINANCE_REJECTION_MIN_LENGTH)+' کاراکتر';
      counter.classList.toggle('is-valid',valid);
      save.disabled=!valid || busy;
    };
    reason.addEventListener('input',updateCounter);
    updateCounter();
  };
  if(contract.accountingStatus==='accepted'){
    if(contract.accountingDecision?.actor?.id===currentExecutionActor(project).id){
      button(contract.parentContractId?'رد کردن الحاقیه':'پس‌گرفتن تأیید مالی',()=>openRejection('revoke_finance'),!!contract.parentContractId);
    }
  }else if(contract.accountingStatus==='sent'){
    button('تأیید '+label,()=>openConfirm(label+' توسط بخش مالی تأیید شود؟',()=>run('approve_finance'),'تأیید'));
    button('رد '+label,()=>openRejection('reject_finance'),true);
  }
  return root;
}
