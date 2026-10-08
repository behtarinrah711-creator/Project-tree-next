import { REPORT_MIN_LENGTH, todayApi } from '../../domain/wbs/todayApi.js';
import { tehranTodayJalali } from '../../domain/wbs/todayDomain.js';
import { toEnglishDigits, toPersianDigits } from '../../ui/digits.js';
import { openNumpadGeneric } from '../../ui/numpad.js';
import { closeWbsSheet, fieldRow, openWbsSheet } from './wbsSheet.js';

const SEND_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 20.5 22 12 3 3.5v6l13 2.5-13 2.5v6Z"/></svg>';

function reportDay(report){
  return report?.reportDay || (report?.createdAt ? tehranTodayJalali(new Date(report.createdAt)) : '');
}

export function todayReportOf(entity, day = tehranTodayJalali()){
  return (entity?.executionReports || []).filter(report => report && !report.trashed && reportDay(report) === day).at(-1) || null;
}

function textarea(documentRef, value){
  const field=documentRef.createElement('textarea');
  field.className='wbs-input today-textarea';
  field.name='reportDescription';
  field.value=value || '';
  return field;
}

function progressInput(documentRef, value, onChange){
  const button=documentRef.createElement('button');
  button.type='button'; button.name='reportProgress'; button.className='wbs-input wbs-inline-number today-progress-input';
  button.dataset.value=String(Math.min(100,Math.max(0,Number(value)||0)));
  const paint=()=>{ button.textContent=`${toPersianDigits(button.dataset.value)}٪`; onChange?.(Number(button.dataset.value)); };
  button.addEventListener('click',()=>openNumpadGeneric(button.dataset.value,raw=>{
    button.dataset.value=String(Math.min(100,Math.max(0,Number(toEnglishDigits(String(raw)).replace(/\D/g,''))||0)));
    paint();
  },{suffix:'٪',maxLen:3,group:false}));
  paint(); return button;
}

function save(projectId,item,actor,root){
  return todayApi.saveReport(projectId,{kind:item.kind,id:item.id,workId:item.workId},root.querySelector('[name="reportDescription"]').value,actor,Date.now,root.querySelector('[name="reportProgress"]').dataset.value);
}

export function openDailyExecutionReport({ projectId, item, actor, onChanged, onSubmitted, subject='کار' }){
  const current=todayReportOf(item.entity);
  openWbsSheet({
    title:current ? `ویرایش گزارش امروز ${subject}` : `ثبت گزارش امروز ${subject}`,
    saveLabel:'ذخیره', presentation:'stage-create', autoFocus:false,
    historyKey:`execution-report:${projectId}:${item.id}:${tehranTodayJalali()}`,
    body(root){
      let progress=Number(item.entity.progress)||0;
      const send=document.createElement('button');
      send.type='button'; send.className='today-submit-approval';
      send.innerHTML=`${SEND_ICON}<span>ارسال جهت تأیید</span>`;
      const syncSend=value=>{ progress=value; send.hidden=value!==100; };
      root.appendChild(fieldRow('درصد پیشرفت',progressInput(document,current?.progress ?? item.entity.progress,syncSend)));
      root.appendChild(fieldRow('شرح گزارش',textarea(document,current?.description||'')));
      const note=document.createElement('div'); note.className='today-upload-note'; note.innerHTML='<span>پیوست‌ها</span><div><button type="button" disabled>عکس<small>به‌زودی</small></button><button type="button" disabled>ویدئو<small>به‌زودی</small></button><button type="button" disabled>فایل<small>به‌زودی</small></button></div>'; root.appendChild(note);
      root.appendChild(send); syncSend(progress);
      send.addEventListener('click',()=>{
        const description=root.querySelector('[name="reportDescription"]').value.trim();
        if(description || current){
          const saved=save(projectId,item,actor,root);
          if(!saved.ok){ window.KarhaUI?.showToast?.(`شرح گزارش حداقل ${toPersianDigits(REPORT_MIN_LENGTH)} حرف باشد`); return; }
        }
        const result=todayApi.markComplete(projectId,{kind:item.kind,id:item.id,workId:item.workId},actor);
        if(!result.ok){ window.KarhaUI?.showToast?.('ارسال جهت تأیید ممکن نیست'); return; }
        closeWbsSheet(); onSubmitted?.(result.entity); onChanged?.();
      });
    },
    onSave(root){
      const result=save(projectId,item,actor,root);
      if(!result.ok){ window.KarhaUI?.showToast?.(`شرح گزارش حداقل ${toPersianDigits(REPORT_MIN_LENGTH)} حرف باشد`); return false; }
      onChanged?.(); return true;
    },
  });
}

export function progressCircle(documentRef, entity, { pending=false, disabled=false, onClick } = {}){
  const progress=Math.min(100,Math.max(0,Number(entity?.progress)||0));
  const button=documentRef.createElement('button');
  button.type='button'; button.className='today-progress-circle'; button.disabled=disabled;
  button.style.setProperty('--today-progress',`${progress * 3.6}deg`);
  if(pending){
    button.classList.add('is-pending'); button.innerHTML='<span class="today-progress-symbol">◷</span>';
    button.setAttribute('aria-label','در انتظار تأیید');
  }else if(progress===100){
    button.classList.add('is-ready'); button.innerHTML=`<span class="today-progress-send">${SEND_ICON}<small>ارسال</small></span>`;
    button.setAttribute('aria-label','ثبت گزارش یا ارسال جهت تأیید');
  }else{
    button.innerHTML=`<span>${toPersianDigits(progress)}٪</span>`;
    button.setAttribute('aria-label',`ثبت گزارش روزانه؛ پیشرفت ${progress} درصد`);
  }
  if(onClick) button.addEventListener('click',onClick);
  return button;
}
