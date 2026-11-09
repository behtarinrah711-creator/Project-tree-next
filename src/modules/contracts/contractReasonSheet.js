import {FINANCE_REASON_MIN_LENGTH} from '../../domain/contractHandoff.js';
import {openWbsSheet,closeWbsSheet,fieldRow} from '../wbs/wbsSheet.js';

export function openContractReasonSheet({title,saveLabel='ذخیره',historyKey,fieldLabel,submit,minLength=FINANCE_REASON_MIN_LENGTH}){
  const count=new Intl.NumberFormat('fa-IR');
  let reason,counter,saving=false;
  const sheet=openWbsSheet({
    title,saveLabel,historyKey,
    body(body){
      reason=document.createElement('textarea');
      reason.name='reason';reason.className='wbs-input today-textarea';reason.required=true;
      reason.setAttribute('aria-describedby','finance-reason-count');
      counter=document.createElement('div');counter.id='finance-reason-count';counter.className='finance-rejection-count';
      const field=fieldRow(fieldLabel,reason);
      reason.before(counter);
      body.append(field);
    },
    onSave(){
      if(save.disabled)return false;
      saving=true;
      updateCounter();
      submit(reason.value.trim()).then(ok=>{
        saving=false;
        if(ok && sheet.isConnected)closeWbsSheet();
        else if(sheet.isConnected)updateCounter();
      });
      return false;
    },
  });
  const save=sheet.querySelector('.wbs-sheet-save');
  const updateCounter=()=>{
    const length=reason.value.trim().length;
    const valid=length>=minLength;
    counter.textContent=count.format(length)+' از '+count.format(minLength)+' کاراکتر';
    counter.classList.toggle('is-valid',valid);
    save.disabled=!valid || saving;
  };
  reason.addEventListener('input',updateCounter);
  updateCounter();
  return sheet;
}
