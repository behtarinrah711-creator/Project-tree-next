import {REJECTION_MIN_LENGTH} from '../../domain/contractApproval.js';
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

// Keep the original sheet and its history entry while editing the reason.
export function renderInlineContractReject(submit,onRejected){
  const button=document.createElement('button');
  button.type='button';
  button.className='contract-review-action danger';
  button.textContent='رد کردن';
  button.onclick=()=>{
    const sheet=button.closest('.wbs-sheet-overlay');
    const body=sheet.querySelector('.sheet-body');
    const header=sheet.querySelector('.sheet-head');
    const caption=header.querySelector('.sheet-caption');
    const close=header.querySelector('.close-btn');
    const originalTitle=caption.textContent;
    const scrollTop=body.scrollTop;
    const form=document.createElement('div');
    const reason=document.createElement('textarea');
    reason.className='wbs-input today-textarea';
    reason.required=true;
    const counter=document.createElement('div');
    counter.className='finance-rejection-count';
    counter.id='inline-contract-reject-count';
    counter.setAttribute('aria-live','polite');
    reason.setAttribute('aria-describedby',counter.id);
    const field=fieldRow('دلیل رد',reason);
    reason.before(counter);
    form.append(field);
    const back=document.createElement('button');
    back.type='button';back.className='close-btn';back.textContent='→';
    back.setAttribute('aria-label','بازگشت');
    const save=document.createElement('button');
    save.type='button';save.className='wbs-sheet-save';save.textContent='ذخیره';
    const number=new Intl.NumberFormat('fa-IR');
    let saving=false;
    const update=()=>{
      const length=reason.value.trim().length;
      const valid=length>=REJECTION_MIN_LENGTH;
      counter.textContent=number.format(length)+' از '+number.format(REJECTION_MIN_LENGTH)+' کاراکتر';
      counter.classList.toggle('is-valid',valid);
      save.disabled=!valid || saving;
      back.disabled=saving;
    };
    const content=[...body.childNodes];
    const restore=()=>{
      body.replaceChildren(...content);
      body.scrollTop=scrollTop;
      caption.textContent=originalTitle;
      sheet.setAttribute('aria-label',originalTitle);
      close.hidden=false;
      back.remove();save.remove();
      button.focus();
    };
    close.hidden=true;
    header.prepend(back);
    header.append(save);
    caption.textContent='دلیل رد';
    sheet.setAttribute('aria-label','دلیل رد');
    body.replaceChildren(form);
    back.onclick=restore;
    reason.oninput=update;
    save.onclick=async()=>{
      if(save.disabled)return;
      saving=true;update();
      try{
        const record=await submit(reason.value.trim());
        if(sheet.isConnected){restore();onRejected(record);}
      }catch(error){
        window.KarhaUI?.showToast?.(error.message);
        saving=false;update();
      }
    };
    update();
    reason.focus();
  };
  return button;
}
