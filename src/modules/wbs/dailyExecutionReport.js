import {projectRepository} from '../../data/projectRepository.js';
import { REPORT_MIN_LENGTH, todayApi } from '../../domain/wbs/todayApi.js';
import { collectTodayItems, dailyExecutionStatus, INACTIVE_REASONS, executionReportDay, tehranTodayJalali } from '../../domain/wbs/todayDomain.js';
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
    button.addEventListener('click',()=>openFileViewer(photo,{onError:toast,compactImageHeader:true,gallery:photos}));
    root.appendChild(button);
  }
}

function statusFields(root,projectId,entity,day){
  const current=dailyExecutionStatus(entity,day);
  const state={status:current.status,reasonId:current.reasonId||''};
  const row=document.createElement('fieldset');
  row.className='today-report-status-row';
  const question=document.createElement('span');
  question.textContent='وضعیت این کار چگونه است؟';
  row.setAttribute('aria-label',question.textContent);
  row.append(question);
  const reasons=new Map(Object.entries(INACTIVE_REASONS));
  const project=projectRepository.find(projectId);
  for(const {entity:work} of collectTodayItems(project,day,{includeApproved:true})){
    for(const entry of work.executionHistory||[]){
      if(entry.type==='daily_status' && entry.reasonId?.startsWith('custom:'))reasons.set(entry.reasonId,entry.reason);
    }
  }
  const reason=document.createElement('button');
  reason.type='button';reason.className='wbs-input';
  const reasonRow=fieldRow('دلیل غیرفعال بودن',reason);
  const selectReason=id=>{state.reasonId=id;reason.textContent=reasons.get(id)||'انتخاب کنید';};
  selectReason(state.reasonId);
  reason.onclick=async()=>{
    const {openStaticChoicePicker}=await import("../contracts/contractPickers.js");
    openStaticChoicePicker('دلیل غیرفعال بودن','دلیل‌ها',
    [...reasons].map(([value,label])=>({value,label})),state.reasonId,selectReason,()=>{
      window.KarhaSearchTemplate?.close?.();
      const input=document.createElement('input');
      input.className='wbs-input';input.maxLength=120;
      const add=document.createElement('button');
      add.type='button';add.textContent='افزودن دلیل';
      const field=fieldRow('دلیل جدید',input);
      field.append(add);reasonRow.append(field);
      add.onclick=()=>{
        const label=input.value.trim();
        if(!label)return;
        const id='custom:'+label;
        reasons.set(id,label);selectReason(id);field.remove();
      };
      input.focus();
    },{preserveOrder:true});
  };
  const choices=[];
  const paint=()=>{
    reasonRow.hidden=state.status!=='inactive';
    reasonRow.classList.toggle('hidden',reasonRow.hidden);
    choices.forEach(input=>{input.checked=input.value===state.status;});
  };
  for(const [value,label] of [['active','فعال'],['inactive','غیرفعال'],['unknown','هنوز نامشخص']]){
    const option=document.createElement('label');
    const input=document.createElement('input');
    input.type='checkbox';input.value=value;choices.push(input);
    input.onchange=()=>{state.status=value;paint();};
    option.append(input,label);row.append(option);
  }
  root.append(row,reasonRow);paint();
  return state;
}

export function openDailyExecutionReport({ projectId, item, actor, onChanged, onSubmitted, onReturn, statusControls=false, day=tehranTodayJalali(), subject='کار' }){
  const current=todayReportOf(item.entity,day);
  const photos=[...(current?.photos||[])];
  const ref={kind:item.kind,id:item.id,workId:item.workId};
  let uploader,dailyStatus;
  const sheet=openWbsSheet({
    title:statusControls?`ثبت گزارش ${item.entity.title || item.entity.text || subject}`:`ثبت گزارش:\n${item.entity.title || item.entity.text || subject}`,
    saveLabel:'ذخیره', presentation:'stage-create', autoFocus:false,
    historyKey:`execution-report:${projectId}:${item.id}:${day}`,
    ...(onReturn?{requestClose:onReturn,reuseHistoryOnReplace:true}:{}),
    body(root){
      if(statusControls)dailyStatus=statusFields(root,projectId,item.entity,day);
      const progress=fieldRow(statusControls?'درصد پیشرفت':'وارد کردن درصد پیشرفت',progressInput(document,current?.progress ?? item.entity.progress));
      progress.classList.add('today-report-progress-row');
      if(statusControls)progress.classList.add('today-report-progress-compact');
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
      if(day!==tehranTodayJalali()){toast('روز تغییر کرده است. فرم گزارش امروز را دوباره باز کنید');return false;}
      if(uploader?.isBusy()){
        toast('ابتدا بارگذاری عکس‌ها را تمام کنید');
        return false;
      }
      const progress=root.querySelector('[name="reportProgress"]').dataset.value;
      const description=root.querySelector('[name="reportDescription"]').value;
      const statusOnly=statusControls && !current && !description.trim() && !photos.length && Number(progress)===(Number(item.entity.progress)||0);
      const result=statusOnly
        ? todayApi.setDailyStatus(projectId,ref,dailyStatus.status,dailyStatus.reasonId,'',actor)
        : todayApi.saveReport(projectId,ref,description,actor,Date.now,progress,{files:photos,completeAt100:true,dailyStatus});
      if(!result.ok){
        if(result.code==='invalid_reason'){toast('دلیل غیرفعال بودن را انتخاب کنید');return false;}
        toast(result.code==='report_too_short' ? `شرح گزارش حداقل ${toPersianDigits(REPORT_MIN_LENGTH)} حرف باشد` : 'ذخیرهٔ گزارش انجام نشد');
        return false;
      }
      if(!statusOnly && Number(progress)===100) onSubmitted?.(result.entity);
      onChanged?.();
      if(onReturn){onReturn();return false;}
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

export function progressCircle(documentRef, entity, { pending=false, disabled=false, onClick, summary } = {}){
  const progress=Math.min(100,Math.max(0,Number(entity?.progress)||0));
  const button=documentRef.createElement(summary && !onClick?'span':'button');
  button.className='today-progress-circle';
  if(!summary || onClick){button.type='button';button.disabled=disabled;}
  const ring=`<svg class="today-progress-ring" viewBox="0 0 42 42" aria-hidden="true"><circle class="today-progress-track" cx="21" cy="21" r="18" pathLength="100"/><circle class="today-progress-value" cx="21" cy="21" r="18" pathLength="100" stroke-dasharray="${progress} 100"/></svg>`;
  if(summary){
    button.innerHTML=ring;
    const value=documentRef.createElement('span');
    value.textContent=summary.value ?? (toPersianDigits(progress)+'٪');
    button.appendChild(value);
    if(!onClick)button.setAttribute('role','img');
    else button.setAttribute('aria-haspopup','dialog');
    button.setAttribute('aria-label',summary.label ?? ('پیشرفت '+value.textContent));
    if(summary.label)button.title=summary.label;
  }else if(pending){
    button.classList.add('is-pending'); button.innerHTML=`${ring}<span class="today-progress-symbol">◷</span>`;
    button.setAttribute('aria-label','در انتظار تأیید');
  }else{
    button.innerHTML=`${ring}<span>${toPersianDigits(progress)}٪</span>`;
    button.setAttribute('aria-label',`ثبت گزارش روزانه؛ پیشرفت ${progress} درصد`);
  }
  if(onClick) button.addEventListener('click',onClick);
  return button;
}
