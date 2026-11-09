import { REPORT_MIN_LENGTH, todayApi } from '../../domain/wbs/todayApi.js';
import { executionReportDay, tehranTodayJalali } from '../../domain/wbs/todayDomain.js';
import { toPersianDigits } from '../../ui/digits.js';
import { openNumpadGeneric } from '../../ui/numpad.js';
import { fieldRow, openWbsSheet } from './wbsSheet.js';
import { mountFileUploader } from '../files/fileUploader.js';
import { openFileViewer } from '../files/fileViewer.js';

export function todayReportOf(entity, day = tehranTodayJalali()){
  return (entity?.executionReports || []).filter(report => report && !report.trashed && executionReportDay(report) === day).at(-1) || null;
}

function textarea(documentRef, value){
  const field=documentRef.createElement('textarea');
  field.className='wbs-input today-textarea';
  field.name='reportDescription';
  field.value=value || '';
  return field;
}

function progressInput(documentRef, value){
  const button=documentRef.createElement('button');
  button.type='button';
  button.name='reportProgress';
  button.className='wbs-input today-progress-input';
  button.dataset.value=String(Math.min(100,Math.max(0,Number(value)||0)));
  const paint=()=>{ button.textContent='٪'+toPersianDigits(button.dataset.value); };
  button.addEventListener('click',()=>openNumpadGeneric('',raw=>{
    if(raw!==''){
      button.dataset.value=String(Number(raw));
      paint();
    }
  },{prefix:'٪',suffix:'',maxLen:3,group:false,validate:raw=>Number(raw)>100?'درصد پیشرفت حداکثر ۱۰۰ است':''}));
  paint();
  return button;
}

const toast=message=>window.KarhaUI?.showToast?.(message);

export function appendReportPhotos(root,photos){
  for(const [index,photo] of (photos||[]).entries()){
    const button=root.ownerDocument.createElement('button');
    button.type='button';
    button.className='today-report-photo';
    button.textContent='مشاهدهٔ عکس '+toPersianDigits(index+1);
    button.addEventListener('click',()=>openFileViewer(photo,{onError:toast,compactImageHeader:true}));
    root.appendChild(button);
  }
}

export function openDailyExecutionReport({ projectId, item, actor, onChanged, onSubmitted, subject='کار' }){
  const current=todayReportOf(item.entity);
  const photos=[...(current?.photos||[])];
  const ref={kind:item.kind,id:item.id,workId:item.workId};
  let uploader;
  const sheet=openWbsSheet({
    title:`ثبت گزارش:\n${item.entity.title || item.entity.text || subject}`,
    saveLabel:'ذخیره', presentation:'stage-create', autoFocus:false,
    historyKey:`execution-report:${projectId}:${item.id}:${tehranTodayJalali()}`,
    body(root){
      const progress=fieldRow('وارد کردن درصد پیشرفت',progressInput(document,current?.progress ?? item.entity.progress));
      progress.classList.add('today-report-progress-row');
      root.append(progress,fieldRow('شرح گزارش',textarea(document,current?.description||'')));
      const attachments=document.createElement('div');
      const note=document.createElement('div');
      note.className='today-upload-note';
      note.innerHTML='<span>پیوست‌ها</span>';
      note.appendChild(attachments);
      root.appendChild(note);
      uploader=mountFileUploader(attachments,{projectId,recordId:item.id,category:'reports',files:photos,
        label:'افزودن عکس',buttonLabel:true,allowReplace:true,onError:toast});
      const placeholders=document.createElement('div');
      placeholders.className='today-upload-placeholders';
      placeholders.innerHTML='<button type="button" disabled>ویدئو<small>به‌زودی</small></button><button type="button" disabled>فایل<small>به‌زودی</small></button>';
      note.appendChild(placeholders);
    },
    onSave(root){
      if(uploader?.isBusy()){
        toast('ابتدا بارگذاری عکس‌ها را تمام کنید');
        return false;
      }
      const progress=root.querySelector('[name="reportProgress"]').dataset.value;
      const result=todayApi.saveReport(projectId,ref,root.querySelector('[name="reportDescription"]').value,
        actor,Date.now,progress,{files:photos,completeAt100:true});
      if(!result.ok){
        toast(result.code==='report_too_short' ? `شرح گزارش حداقل ${toPersianDigits(REPORT_MIN_LENGTH)} حرف باشد` : 'ذخیرهٔ گزارش انجام نشد');
        return false;
      }
      if(Number(progress)===100) onSubmitted?.(result.entity);
      onChanged?.();
      return true;
    },
  });
  sheet.classList.add('today-report-sheet');
  const observer=new MutationObserver(()=>{
    if(!sheet.isConnected){
      uploader?.destroy();
      observer.disconnect();
    }
  });
  observer.observe(document.body,{childList:true});
}

export function progressCircle(documentRef, entity, { pending=false, disabled=false, onClick } = {}){
  const progress=Math.min(100,Math.max(0,Number(entity?.progress)||0));
  const button=documentRef.createElement('button');
  button.type='button'; button.className='today-progress-circle'; button.disabled=disabled;
  const ring=`<svg class="today-progress-ring" viewBox="0 0 42 42" aria-hidden="true"><circle class="today-progress-track" cx="21" cy="21" r="18" pathLength="100"/><circle class="today-progress-value" cx="21" cy="21" r="18" pathLength="100" stroke-dasharray="${progress} 100"/></svg>`;
  if(pending){
    button.classList.add('is-pending'); button.innerHTML=`${ring}<span class="today-progress-symbol">◷</span>`;
    button.setAttribute('aria-label','در انتظار تأیید');
  }else{
    button.innerHTML=`${ring}<span>${toPersianDigits(progress)}٪</span>`;
    button.setAttribute('aria-label',`ثبت گزارش روزانه؛ پیشرفت ${progress} درصد`);
  }
  if(onClick) button.addEventListener('click',onClick);
  return button;
}
