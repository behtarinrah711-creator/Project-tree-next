import {executionApproverIds} from "../../domain/wbs/workTaskModel.js";
import {INTERRUPTION_ELIGIBILITY,openExecutionDelayReport,openExecutionInterruption} from "./executionInterruption.js";
import {openSearchPicker} from '../../ui/searchPickerAdapter.js';
import {openNumpadGeneric} from '../../ui/numpad.js';
import {executionFilterTree,openExecutionBranchFilter} from './executionBranchFilter.js';
import {canDeletePlanning,canWritePlanning,planningAccessLevel} from '../roleManagement/planningAccess.js';
import {wbsApi} from '../../domain/wbs/wbsApi.js';
import {openStageEditSheet} from './stageEditSheet.js';
import {requestPlanningItemDelete} from './planningItemDelete.js';
import {openCreateWorkTaskSheet,openStandaloneWorkSheet,requestPlanningTaskDelete} from './workTaskView.js';
import {createStandaloneWork,updateStandaloneWork,deleteStandaloneWork} from '../../domain/wbs/workTaskApi.js';
import {contractActionsMenu} from '../contracts/contractActionsMenu.js';
import {openConfirm} from '../../ui/confirm.js';
import {openExecutionCalendar} from './executionCalendar.js';
import {projectRepository} from '../../data/projectRepository.js';
import { todayRepository } from '../../data/todayRepository.js';
import { canWriteProjectModule, projectPermissionState } from '../roleManagement/permissionState.js';
import { todayApi, COMMENT_MIN_LENGTH } from '../../domain/wbs/todayApi.js';
import { collectTodayItems, collectStandaloneWorks, executionInterruption, interruptionReportOf, executionWorkKey, executionReportDay, dailyExecutionStatus, DAILY_EXECUTION_LABELS, contractorForItem, executionStatus, itemsForMode, jalaliDayNumber, remainingLabel, TODAY_MODES, tehranTodayJalali, timeState } from '../../domain/wbs/todayDomain.js';
import { closeWbsSheet, fieldRow, openWbsSheet } from './wbsSheet.js';
import { toPersianDigits } from '../../ui/digits.js';
import { currentExecutionActor, isExecutionAssignee } from './executionActor.js';
import { appendReportPhotos, openDailyExecutionReport, progressCircle, todayReportOf } from './dailyExecutionReport.js';
import { fetchFile } from '../files/fileApi.js';
import { openFileViewer } from '../files/fileViewer.js';

export const TODAY_ICON = 'M200-80q-33 0-56.5-23.5T120-160v-560q0-33 23.5-56.5T200-800h40v-80h80v80h320v-80h80v80h40q33 0 56.5 23.5T840-720v255l-80 80v-175H200v400h248l80 80H200Zm0-560h560v-80H200v80Zm0 0v-80 80ZM662-60 520-202l56-56 85 85 170-170 56 57L662-60Z';
const LABELS = Object.freeze({ overdue:'عقب‌افتاده', today:'امروز', future:'آینده', pending:'تکمیل', unscheduled:'بی زمان', waiting:'انتظار', blocked:'متوقف' });
const TYPE_CLASSES = new Map([['اجرا','type-1'],['خرید','type-2'],['نیروی کار','type-3'],['پیمانکار','type-4'],['کرایه','type-5'],['خدمات','type-6'],['پیگیری','type-7'],['سایر','type-9']]);
const PRIORITY_LABELS = Object.freeze({ low:'بحرانی', normal:'عادی', high:'مهم' });
const PRIORITY_CLASSES = Object.freeze({ low:'priority-low', normal:'priority-normal', high:'priority-high' });
let standaloneMode='today';
let activeBranch='';
let activeDetails={};
let activeMode = 'today'; let activeProjectId = null;

function esc(value){ return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])); }
function contactName(contact){ return [contact?.type, contact?.firstName, contact?.lastName].filter(Boolean).join(' ').trim() || contact?.name || ''; }
function refOf(item){ return { kind:item.kind, id:item.id, workId:item.workId }; }
function formatDate(value){
  const parts = String(value || '').split('/');
  if(parts.length !== 3) return toPersianDigits(String(value || ''));
  return `${toPersianDigits(Number(parts[0]))}/${toPersianDigits(Number(parts[1]))}/${toPersianDigits(Number(parts[2]))}`;
}
const JALALI_MONTH_NAMES=['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
function formatScheduleEndpoint(value){
  const [,month,day]=String(value || '').split('/');
  const monthName=JALALI_MONTH_NAMES[Number(month)-1];
  return monthName && Number(day)>0 ? `${toPersianDigits(Number(day))} ${monthName}` : '';
}
function formatMoment(value){ return value ? new Intl.DateTimeFormat('fa-IR-u-ca-persian', { timeZone:'Asia/Tehran', year:'numeric', month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' }).format(new Date(value)) : ''; }
function reportsOf(entity){ return (entity.executionReports || []).filter(report => report && !report.trashed).slice().reverse(); }
function commentsOf(entity){ return (entity.executionComments || []).filter(comment => comment && !comment.trashed).slice().sort((a,b) => Number(b.createdAt) - Number(a.createdAt)); }
function detailRow(documentRef, label, value){
  const row = documentRef.createElement('div');
  row.className = 'wbs-costline-detail-row';
  const name = documentRef.createElement('span');
  if(label instanceof Node) name.appendChild(label);
  else name.textContent = label;
  const cell = documentRef.createElement('span');
  if(value instanceof Node) cell.appendChild(value);
  else cell.textContent = value || '—';
  row.append(name, cell);
  return row;
}
function inactiveReasonRow(documentRef,status,report){
  const note=String(status.description||'').trim();
  const description=String(report?.description||'').trim();
  const row=detailRow(documentRef,'دلیل',note && note!==description?[status.reason,note].join(' · '):status.reason);
  row.classList.add('today-detail-reason');
  return row;
}
function linkButton(documentRef, className, text, label){
  const button = documentRef.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = text;
  if(label) button.setAttribute('aria-label', label);
  return button;
}

function renderComments(documentRef,item,onChanged,editContext,comments=commentsOf(item.entity)){
  const host=documentRef.createElement('div'); host.className='today-comments'; let expanded=false; const list=documentRef.createElement('div');
  const paint=()=>{ list.replaceChildren(); (expanded?comments:comments.slice(0,2)).forEach(comment=>{ const row=documentRef.createElement('div'); row.className='today-comment'+(comment.type==='approval_rejected'?' is-rejection':''); row.innerHTML=`<p>${esc(comment.text)}</p><span>${esc(comment.createdBy?.name||'کاربر')} · ${esc(formatMoment(comment.createdAt))}</span>`; if(comment.updatedAt)row.lastChild.append(' · ویرایش‌شده '+formatMoment(comment.updatedAt));
    if(editContext && comment.createdBy?.id===editContext.actor.id && editContext.actor.id!=='guest' && comment.type!=='approval_rejected'){
      const edit=linkButton(documentRef,'today-show-comments','ویرایش');
      edit.onclick=()=>{
        const form=documentRef.createElement('form');form.className='today-detail-composer';
        const input=textArea(documentRef,comment.text,'editComment');
        const save=documentRef.createElement('button');save.textContent='ذخیره';
        const cancel=linkButton(documentRef,'','انصراف');cancel.onclick=paint;
        form.append(input,save,cancel);
        form.onsubmit=event=>{
          event.preventDefault();
          const result=todayApi.editComment(editContext.projectId,refOf(item),comment.id,input.value,editContext.actor);
          if(result.ok)onChanged?.();
          else window.KarhaUI?.showToast?.('ویرایش نظر ذخیره نشد. متن نظر را بررسی کنید.');
        };
        row.replaceChildren(form);input.focus();
      };
      row.append(edit);
    }
    list.appendChild(row); }); }; paint(); host.appendChild(list);
  if(comments.length>2){ const more=documentRef.createElement('button'); more.type='button'; more.className='today-show-comments'; more.textContent=`مشاهده ${toPersianDigits(comments.length-2)} نظر قبلی`; more.addEventListener('click',()=>{ expanded=true; paint(); more.remove(); }); host.appendChild(more); }
  return host;
}
function historyLabel(type){ return ({planned_pause:'وقفهٔ برنامه‌ریزی‌شده',execution_obstacle:'مانع اجرا',progress_updated:'درصد پیشرفت ثبت شد',odd_job_created:'خرده‌کار ایجاد شد',odd_job_edited:'خرده‌کار ویرایش شد',odd_job_deleted:'خرده‌کار حذف شد',started:'شروع شد',start_delayed:'دلیل شروع نشدن ثبت شد',start_cancelled:'شروع لغو شد',report_created:'گزارش ثبت شد',report_edited:'گزارش ویرایش شد',comment_added:'نظر ثبت شد',comment_edited:'نظر ویرایش شد',marked_complete:'انجام‌شده اعلام شد',completed_without_approval:'بدون نیاز به تأیید تکمیل شد',sent_for_approval:'برای تأیید ارسال شد',approval_rejected:'تأیید رد شد',approval_cancelled:'تأیید نهایی لغو شد',returned_to_active:'به فهرست فعال برگشت',completion_withdrawn:'تیک انجام‌شدن برداشته شد',returned_to_previous:'به تب قبلی برگشت',approved:'تأیید نهایی شد'})[type]||type; }
function renderHistory(documentRef,entity){ const history=[...(entity.executionHistory||[])];
  if(entity.oddJobType && entity.createdAt && !history.some(entry=>entry.type==='odd_job_created')){
    history.push({type:'odd_job_created',at:entity.createdAt,actor:entity.createdBy});
  }
  const logged=new Set(history.filter(entry=>entry.type==='report_created').map(entry=>entry.reportId));
  for(const report of reportsOf(entity)){
    if(report.createdAt && !logged.has(report.id))history.push({type:'report_created',at:report.createdAt,actor:report.createdBy,reportId:report.id});
  }
  history.sort((a,b)=>Number(b.at)-Number(a.at)); const details=documentRef.createElement('details'); details.className='today-history'; details.innerHTML='<summary>تاریخچه</summary>'; history.forEach(entry=>{ const row=documentRef.createElement('div'); const label=entry.type==='daily_status'?DAILY_EXECUTION_LABELS[entry.status]:historyLabel(entry.type); const extra=['start_delayed','daily_status','report_created','report_edited','marked_complete','sent_for_approval','completed_without_approval','approved'].includes(entry.type)?[entry.reason,entry.description,entry.day].filter(Boolean).map(value=>` · ${value}`).join(''):''; row.textContent=`${label} · ${entry.actor?.name||'کاربر'} · ${formatMoment(entry.at)}${extra}`; details.appendChild(row); }); return details; }
export function renderTodayCard(documentRef,project,item,today,onChanged,approval){
  return renderTodaySummary(documentRef,project,item,today,onChanged,undefined,approval);
}
function personInitial(name){
  const text=String(name||'').trim();
  return text ? text.charAt(0) : '؟';
}
function heroRemaining(entity,day){
  const label=remainingLabel(entity,day);
  if(!label || label==='امروز') return label;
  const end=jalaliDayNumber(entity.scheduleEnd);
  const now=jalaliDayNumber(day);
  if(end===null || now===null) return label;
  const difference=end-now;
  if(difference>0) return `${toPersianDigits(difference)} روز باقی‌مانده`;
  if(difference<0) return `${toPersianDigits(Math.abs(difference))} روز از موعد گذشته`;
  return 'امروز';
}
function elapsedShare(entity,day){
  const start=jalaliDayNumber(entity.scheduleStart);
  const end=jalaliDayNumber(entity.scheduleEnd);
  const now=jalaliDayNumber(day);
  if(start===null || end===null || now===null) return null;
  if(now<=start) return 0;
  if(end<=start) return now>start ? 1 : 0;
  return Math.min(1,Math.max(0,(now-start)/(end-start)));
}
function completionDay(entity){
  const explicit=jalaliDayNumber(entity.actualFinishDay);
  if(explicit!==null) return explicit;
  const approved=executionStatus(entity)==='approved' || entity.completed===true || entity.done===true;
  if(!approved) return null;
  const event=(entity.executionHistory||[]).find(entry=>['approved','completed_without_approval'].includes(entry?.type) && entry.at);
  const stamp=Number(entity.approvedAt || event?.at || entity.completedAt);
  if(!Number.isFinite(stamp)) return null;
  return jalaliDayNumber(tehranTodayJalali(new Date(stamp)));
}
function scheduleStatus(entity,day){
  const end=jalaliDayNumber(entity.scheduleEnd);
  const now=jalaliDayNumber(day);
  if(end===null || now===null) return null;
  const completed=executionStatus(entity)==='approved' || entity.completed===true || entity.done===true;
  if(completed){
    const finished=completionDay(entity);
    const delta=Number.isFinite(finished) ? finished-end : now-end;
    if(delta<0) return {text:`${toPersianDigits(Math.abs(delta))} روز زودتر از موعد انجام شد`,tone:'early'};
    if(delta>0) return {text:`با ${toPersianDigits(delta)} روز تأخیر انجام شد`,tone:'done-late'};
    return {text:'در موعد انجام شد',tone:'done'};
  }
  const remaining=end-now;
  if(remaining<0) return {text:`${toPersianDigits(Math.abs(remaining))} روز تأخیر`,tone:'late'};
  if(remaining>0) return {text:`${toPersianDigits(remaining)} روز زمان باقی مانده است`,tone:'remaining'};
  return {text:'امروز موعد پایان است',tone:'remaining'};
}
function scheduleBar(documentRef,entity,day){
  const share=elapsedShare(entity,day);
  if(share===null)return null;
  const status=scheduleStatus(entity,day);
  const overdue=status?.tone==='late' || status?.tone==='done-late';
  const complete=status?.tone==='early' || status?.tone==='done';
  const bar=documentRef.createElement('progress');
  bar.className='today-schedule-bar'+(overdue?' is-overdue':'')+(complete?' is-complete':'');
  bar.max=1;bar.value=share;
  bar.setAttribute('aria-label',status?.text || 'زمان سپری‌شده');
  return {bar,status};
}
function detailCard(documentRef,className=''){
  const card=documentRef.createElement('section');
  card.className='today-detail-card'+(className?' '+className:'');
  return card;
}
function detailPerson(documentRef,label,name){
  const row=documentRef.createElement('div');
  row.className='today-detail-person';
  const avatar=documentRef.createElement('span');
  avatar.className='today-detail-avatar';
  avatar.textContent=personInitial(name==='—'?'':name);
  const text=documentRef.createElement('div');
  const title=documentRef.createElement('small');
  title.textContent=label;
  const person=documentRef.createElement('b');
  person.textContent=name||'—';
  text.append(title,person);
  row.append(avatar,text);
  return row;
}
function reportThumbnails(documentRef,photos,{lazy=false}={}){
  const strip=documentRef.createElement('div');
  strip.className='today-detail-thumbs';
  const urls=[];
  const controllers=[];
  const pending=new Map();
  const Observer=documentRef.defaultView?.IntersectionObserver;
  const observer=lazy && Observer ? new Observer(entries=>{
    for(const entry of entries){
      if(!entry.isIntersecting)continue;
      observer.unobserve(entry.target);
      pending.get(entry.target)?.();
      pending.delete(entry.target);
    }
  },{rootMargin:'160px'}) : null;
  for(const photo of photos||[]){
    const button=documentRef.createElement('button');
    button.type='button';
    button.className='today-detail-thumb';
    button.setAttribute('aria-label',photo?.name||'نمایش عکس');
    const image=documentRef.createElement('img');
    image.alt=photo?.name||'عکس گزارش';
    button.appendChild(image);
    button.addEventListener('click',()=>openFileViewer(photo,{onError:message=>window.KarhaUI?.showToast?.(message),compactImageHeader:true,gallery:photos}));
    strip.appendChild(button);
    const load=()=>{
      const controller=new AbortController();
      controllers.push(controller);
      fetchFile(photo,true,{signal:controller.signal}).then(blob=>{
        if(controller.signal.aborted) return;
        const url=URL.createObjectURL(blob);
        urls.push(url);
        image.src=url;
      }).catch(error=>{ if(error?.name!=='AbortError') image.alt='عکس دریافت نشد'; });
    };
    if(observer){
      pending.set(button,load);
      observer.observe(button);
    }else load();
  }
  return {strip,release(){observer?.disconnect();pending.clear();controllers.forEach(controller=>controller.abort());urls.forEach(url=>URL.revokeObjectURL(url));}};
}
function renderExecutionReportCard(documentRef,entity,day,{historical=false}={}){
  const report=todayReportOf(entity,day);
  let release=()=>{};
  const reportCard=detailCard(documentRef,'today-detail-report');
  const reportHead=documentRef.createElement('div');
  reportHead.className='today-detail-rowline';
  const reportTitle=documentRef.createElement('h2');
  reportTitle.textContent=historical?'گزارش اجرا · '+formatDate(day):'گزارش اجرا';
  const reportTile=documentRef.createElement('span');
  reportTile.className='today-detail-pill '+(report?'is-saved':'is-empty');
  reportTile.textContent=report?'ثبت شده':'بدون گزارش';
  reportHead.append(reportTitle,reportTile);
  reportCard.appendChild(reportHead);
  if(report){
    const meta=documentRef.createElement('div');
    meta.className='today-detail-rowline today-detail-meta';
    const who=documentRef.createElement('b');
    who.textContent=report.createdBy?.name||'کاربر';
    const when=documentRef.createElement('time');
    when.textContent=formatMoment(report.createdAt);
    meta.append(who,when);
    const copy=documentRef.createElement('div');
    copy.className='today-detail-copy';
    for(const paragraph of String(report.description||'').split(/\n+/).filter(Boolean)){
      const line=documentRef.createElement('p');
      line.textContent=paragraph;
      copy.appendChild(line);
    }
    reportCard.append(meta,copy);
    if(report.updatedAt){
      const edited=documentRef.createElement('div');
      edited.className='today-detail-edited';
      edited.textContent=`ویرایش‌شده ${formatMoment(report.updatedAt)}`;
      reportCard.appendChild(edited);
    }
    if(report.photos?.length){
      const photos=reportThumbnails(documentRef,report.photos,{lazy:historical});
      release=photos.release;
      reportCard.appendChild(photos.strip);
    }
  }else{
    const empty=documentRef.createElement('p');
    empty.className='today-detail-meta today-detail-empty-report';
    empty.textContent=day===tehranTodayJalali()?'هنوز گزارش امروز ثبت نشده است':'برای این تاریخ گزارشی ثبت نشده است';
    reportCard.appendChild(empty);
  }
  if(historical){
    const status=dailyExecutionStatus(entity,day);
    reportCard.append(detailRow(documentRef,'وضعیت کار',DAILY_EXECUTION_LABELS[status.status]||'نامشخص'));
    if(status.reason)reportCard.append(inactiveReasonRow(documentRef,status,report));
  }
  return {reportCard,release};
}

function previousExecutionDays(documentRef,item,day,refresh,editContext){
  const {entity}=item;
  const comments=commentsOf(entity);
  const events=(entity.executionHistory||[]).filter(entry=>['planned_pause','execution_obstacle','daily_status'].includes(entry?.type));
  const dates=[...new Set([...reportsOf(entity).map(executionReportDay),...comments.map(executionReportDay),...events.map(entry=>entry.day)])]
    .filter(date=>date && (date<=day||events.some(entry=>entry.type==='planned_pause' && entry.day===date))).sort().reverse();
  const releases=[];
  const root=documentRef.createElement('div');
  let offset=0;
  const more=linkButton(documentRef,'today-detail-card today-report-link today-previous-days-button','مشاهدهٔ سابقه');
  more.onclick=()=>{
    for(const date of dates.slice(offset,offset+5)){
      const section=detailCard(documentRef);
      const heading=documentRef.createElement('h2');
      heading.textContent=formatDate(date);
      section.append(heading);
      if(todayReportOf(entity,date)){
        const report=renderExecutionReportCard(documentRef,entity,date,{historical:true});
        section.append(report.reportCard);
        releases.push(report.release);
      }
      for(const entry of events.filter(value=>value.day===date)){
        const label=entry.type==='planned_pause'?'انتظار':entry.type==='execution_obstacle'?(entry.multiday?'متوقف':'مانع اجرا'):DAILY_EXECUTION_LABELS[entry.status];
        section.append(detailRow(documentRef,label,[entry.reason,entry.description,entry.resumeOn?formatDate(entry.resumeOn):''].filter(Boolean).join(' · ')));
        appendReportPhotos(section,entry.photos);
      }
      const notes=comments.filter(comment=>executionReportDay(comment)===date);
      if(notes.length)section.append(renderComments(documentRef,item,refresh,editContext,notes));
      root.insertBefore(section,more);
    }
    offset+=5;
    more.textContent='نمایش بیشتر';
    if(offset>=dates.length)more.remove();
  };
  if(dates.length)root.append(more);
  return {root,release(){releases.forEach(release=>release());}};
}

function renderExecutionDetail(documentRef,project,item,day,refresh,afterClose,approval){
  const root=documentRef.createElement('div');
  root.className='today-detail';
  const entity=item.entity;
  const current=dailyExecutionStatus(entity,day);
  const currentActor=currentExecutionActor(project);
  const writable=!approval && canWriteProjectModule(project.id,'execution:today');

  const summary=detailCard(documentRef);
  const statusChip=documentRef.createElement('b');
  statusChip.className='today-detail-pill is-'+current.status;
  statusChip.textContent=DAILY_EXECUTION_LABELS[current.status]||'نامشخص';
  summary.append(detailRow(documentRef,day===tehranTodayJalali()?'وضعیت امروز':'وضعیت روز انتخاب‌شده',statusChip));
  const progress=detailCard(documentRef,'today-detail-progress');
  progress.append(detailRow(documentRef,'میزان پیشرفت',progressCircle(documentRef,entity,{summary:{}})));
  const schedule=detailCard(documentRef,'today-detail-schedule');
  const scheduleLabel=documentRef.createElement('span');
  scheduleLabel.textContent='زمان‌بندی';
  const remain=documentRef.createElement('strong');
  remain.textContent=scheduleStatus(entity,day)?.text || heroRemaining(entity,day) || 'بی‌زمان';
  schedule.append(scheduleLabel,remain);
  const timing=scheduleBar(documentRef,entity,day);
  if(timing){
    if(timing.status?.tone==='late')remain.className='today-schedule-delay';
    schedule.append(timing.bar,detailRow(documentRef,'شروع '+formatDate(entity.scheduleStart),'پایان '+formatDate(entity.scheduleEnd)));
  }
  const assignee=(project.contacts||[]).find(contact=>String(contact.id)===String(entity.assigneeContactId||''));
  const approvers=(project.contacts||[]).filter(contact=>executionApproverIds(entity).includes(String(contact.id)));
  const contractor=contractorForItem(project,item).contact;
  summary.append(detailRow(documentRef,'مسئول کار',assignee?contactName(assignee):'—'),
    detailRow(documentRef,'مسئول تأیید',approvers.map(contactName).join('، ')||'—'));
  if(contractor)summary.append(detailRow(documentRef,'پیمانکار',contactName(contractor)));
  if(current.reason)summary.append(inactiveReasonRow(documentRef,current,todayReportOf(entity,day)));
  root.append(schedule,progress,summary);
  if(item.kind==='standalone' && entity.oddJobType){
    const expense=detailCard(documentRef);
    if(entity.description)expense.append(detailRow(documentRef,'شرح کوتاه',entity.description));
    expense.append(detailRow(documentRef,'مبلغ',toPersianDigits(Number(entity.amount||0).toLocaleString('en-US'))+' تومان'));
    if(entity.expenseApproverContactId){
      const reviewer=(project.contacts||[]).find(contact=>String(contact.id)===String(entity.expenseApproverContactId));
      expense.append(detailRow(documentRef,'مسئول تأیید خرج',reviewer?contactName(reviewer):'—'),
        detailRow(documentRef,'تأیید خرج',entity.expenseApprovalStatus==='approved'?'تأیید شده':'در انتظار تأیید'));
    }
    appendReportPhotos(expense,entity.invoices);
    root.appendChild(expense);
  }

  if(!approval && executionStatus(entity)==='pending_approval'){
    const pending=detailCard(documentRef,'today-detail-pending');
    pending.textContent='در انتظار تأیید';
    root.appendChild(pending);
  }
  const interruption=interruptionReportOf(entity,day)||executionInterruption(entity,day);
  const upcoming=(entity.executionHistory||[]).filter(entry=>entry?.type==='planned_pause' && !entry.resumedOn && entry.day>day)
    .sort((a,b)=>a.day.localeCompare(b.day));
  const latestDate=reportsOf(entity).map(executionReportDay).filter(date=>date && date<=day).sort().at(-1);
  const lastObstacle=(entity.executionHistory||[]).findLast(entry=>entry?.type==='execution_obstacle' && entry.day<=day
    && !entry.resumedOn && (!latestDate||entry.day>=latestDate));
  const entry=interruption||upcoming[0]||lastObstacle;
  const latest=!entry && latestDate && renderExecutionReportCard(documentRef,entity,latestDate,{historical:latestDate!==day});
  if(entry){
    const card=detailCard(documentRef);
    const heading=documentRef.createElement('h2');
    heading.textContent=entry.isDailyReport?'گزارش توقف':'آخرین وضعیت';
    const label=entry.type==='planned_pause'?'انتظار':entry.multiday?'متوقف':'مانع اجرا';
    const details=detailRow(documentRef,label,
      ['شروع '+formatDate(entry.day),entry.resumeOn?'ادامه '+formatDate(entry.resumeOn):'',entry.reason,entry.description]
        .filter(Boolean).join(' · '));
    details.classList.add('today-interruption-details');
    card.append(heading,details);
    if(entry.type==='execution_obstacle')card.append(detailRow(documentRef,'وضعیت مجاز بودن',
      INTERRUPTION_ELIGIBILITY[entry.isDailyReport?'ineligible':entry.eligibility]||INTERRUPTION_ELIGIBILITY.pending));
    appendReportPhotos(card,entry.photos);
    root.append(card);
  }else if(latest){
    latest.reportCard.querySelector('h2').textContent='آخرین گزارش · '+formatDate(latestDate);
    root.appendChild(latest.reportCard);
  }

  const commentsCard=detailCard(documentRef);
  if(writable){
    const form=documentRef.createElement('form');
    form.className='today-detail-composer';
    const input=documentRef.createElement('input');
    input.name='commentText';
    input.maxLength=500;
    input.placeholder='نظر خود را بنویسید…';
    input.setAttribute('aria-label','نظر شما');
    const submit=documentRef.createElement('button');
    submit.type='submit';
    submit.textContent='ارسال';
    form.append(input,submit);
    form.addEventListener('submit',event=>{
      event.preventDefault();
      const result=todayApi.addComment(project.id,refOf(item),input.value,currentActor);
      if(!result.ok){
        window.KarhaUI?.showToast?.(`نظر حداقل ${toPersianDigits(COMMENT_MIN_LENGTH)} حرف باشد`);
        return;
      }
      refresh();
    });
    commentsCard.appendChild(form);
  }
  if(writable)root.appendChild(commentsCard);
  const previous=previousExecutionDays(documentRef,item,day,refresh,writable?{projectId:project.id,actor:currentActor}:null);
  root.append(previous.root);

  const reports=reportsOf(entity);
  const canBrowse=projectPermissionState(project.id,['reports:reports']).visible;
  if(canBrowse && (reports.length || (entity.executionHistory||[]).some(entry=>['start_delayed','planned_pause','execution_obstacle'].includes(entry?.type)))){
    const link=documentRef.createElement('a');
    link.className='today-detail-card today-report-link';
    link.textContent='همهٔ گزارش‌های این کار';
    const params=new URLSearchParams({work:executionWorkKey(refOf(item))});
    link.href=`#/projects/${encodeURIComponent(project.id)}/daily-execution-reports?${params}`;
    link.addEventListener('click',event=>{
      if(event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      afterClose(()=>{window.location.hash=new URL(link.href).hash;});
    });
    root.appendChild(link);
  }
  const history=renderHistory(documentRef,entity);
  history.classList.add('today-detail-card');
  previous.root.append(history);
  return {root,release(){latest?.release();previous.release();}};
}

function openTodayDetails(documentRef,project,item,today,onChanged,returnToCalendar,approval){
  const key='execution-details:'+project.id+':'+executionWorkKey(refOf(item));
  const afterClose=action=>{
    const history=window.KarhaChildHistory;
    if(history?.isOpen(key) || (returnToCalendar && history?.isOpen('execution-calendar:'+project.id))){
      history.afterNextPop(action);
      closeWbsSheet();
    }else{
      closeWbsSheet();
      action();
    }
  };
  const frame=documentRef.createElement('div');
  frame.className='wbs-today-frame today-detail-frame';
  let release=()=>{};
  const paint=current=>{
    release();
    const view=renderExecutionDetail(documentRef,project,current,today,refresh,afterClose,approval);
    release=view.release;
    frame.replaceChildren(view.root);
  };
  const refresh=()=>{
    onChanged?.();
    if(!frame.isConnected) return;
    const entity=todayRepository.get(project.id,refOf(item));
    if(!entity || entity.trashed || (executionStatus(entity)==='approved' && !returnToCalendar)){
      release();
      if(returnToCalendar) returnToCalendar();
      else closeWbsSheet();
      return;
    }
    paint({...item,entity,mode:timeState(entity,today)});
  };
  paint(item);
  const sheet=openWbsSheet({
    title:item.entity.title || item.entity.text || 'جزئیات کار',
    body:frame,onClose:()=>release(),showSave:false,autoFocus:false,historyKey:key,reuseHistoryOnReplace:!!returnToCalendar,
    ...(returnToCalendar?{requestClose:returnToCalendar}:{}),
  });
  sheet.classList.add('today-detail-overlay');
  const path=documentRef.createElement('span');
  path.className='today-detail-path';
  path.textContent=(item.path||[]).filter(Boolean).join(' · ');
  if(path.textContent)sheet.querySelector('.sheet-caption').appendChild(path);
}

function planningTaskActions(documentRef,project,item,onChanged){
  const level=planningAccessLevel(project.id,'tree',documentRef.defaultView);
  if(!canWritePlanning(level) || item.entity.completed || item.entity.completionState==='approved' ||
    executionStatus(item.entity)==='approved')return null;
  const projectId=project.id;
  const canDelete=canDeletePlanning(level);
  const deleteItem=()=>item.kind==='task'
    ? requestPlanningTaskDelete({documentRef,projectId,workId:item.workId,taskId:item.id,onChanged})
    : requestPlanningItemDelete(projectId,item.entity,onChanged);
  return {
    onEdit:()=>item.kind==='task'
      ? openCreateWorkTaskSheet({projectId,work:item.work,task:item.entity,onChanged,canDelete})
      : openStageEditSheet({projectId,stage:wbsApi.get(projectId,item.id)||item.entity,onChanged,
        onDelete:canDelete?()=>requestPlanningItemDelete(projectId,item.entity,()=>{closeWbsSheet();onChanged?.();}):null}),
    onDelete:canDelete?deleteItem:undefined,
  };
}

function renderTodaySummary(documentRef,project,item,today,onChanged,returnToCalendar,approval){
  const card=documentRef.createElement('article');
  card.className='today-task-card wbs-costline-work';
  card.dataset.entityId=item.id;
  card.dataset.entityKind=item.kind;
  const heading=documentRef.createElement('div');
  heading.className='today-card-heading today-card-summary';
  const {entity}=item;
  const titles=linkButton(documentRef,'today-card-titles','');
  const priority = entity.priority || 'normal';
  const priorityLabel = PRIORITY_LABELS[priority] || PRIORITY_LABELS.normal;
  const priorityClass = PRIORITY_CLASSES[priority] || 'priority-normal';
  titles.innerHTML=`<strong>${esc(entity.title||entity.text||'')} <small class="wbs-task-priority ${priorityClass}">${esc(priorityLabel)}</small></strong><span>${esc(item.path.join(' · '))}</span>`;
  const assignee=(project.contacts||[]).find(contact=>!contact.trashed && String(contact.id)===String(entity.assigneeContactId));
  const contractor=contractorForItem(project,item).contact;
  if(contractor){
    const name=documentRef.createElement('span');
    const cName=contactName(contractor);
    const label=documentRef.createElement('span');
    label.className='today-card-contractor-label';
    label.textContent='پیمانکار:';
    name.className='today-card-contractor-name';
    name.textContent=cName.replace(/^پیمانکار(?:\s*[:：]\s*|\s+|$)/u,'');
    titles.append(label,name);
  }
  const openDetails=()=>openTodayDetails(documentRef,project,item,today,onChanged,returnToCalendar,approval);
  heading.onclick=openDetails;
  const current=dailyExecutionStatus(entity,today);
  const status=current.reasonId==='officialHoliday'?'holiday':current.status;
  const activeStop=executionInterruption(entity,today);
  const stopReport=interruptionReportOf(entity,today)||activeStop;
  const saved=!!todayReportOf(entity,today);
  const canEditToday=!approval && today===tehranTodayJalali() && canWriteProjectModule(project.id,'execution:today');
  const actor=canEditToday?currentExecutionActor(project):null;
  const canReport=canEditToday && isExecutionAssignee(entity,actor) && !['approved','pending_approval'].includes(executionStatus(entity));
  const report=documentRef.createElement(canReport || stopReport?'button':'span');
  report.className='today-report-circle is-'+status+(saved?' is-saved':'');
  report.innerHTML='<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 3h8l4 4v14H6zM14 3v5h4M9 12h6m-6 4h6"/></svg> گزارش';
  report.setAttribute('aria-label',stopReport?'گزارش این روز در توقف ثبت شده است':
    (status==='holiday'?'تعطیل رسمی':DAILY_EXECUTION_LABELS[status])+'، '+(saved?'گزارش ثبت شده':'بدون گزارش'));
  if(report.tagName==='BUTTON')report.type='button';
  if(stopReport){report.disabled=true;report.title='گزارش این روز در توقف ثبت شده است';}
  report.onclick=event=>{
    event.stopPropagation();
    if(!canReport || stopReport)return;
    openDailyExecutionReport({projectId:project.id,item,actor,day:today,statusControls:true,
      onChanged,onReturn:returnToCalendar,onSubmitted(updated){if(item.kind==='standalone')standaloneMode='pending';else activeMode=timeState(updated,tehranTodayJalali());}});
  };
  const stop=linkButton(documentRef,'today-card-stop',stopReport?'مشاهدهٔ توقف':'ثبت توقف');
  stop.onclick=event=>{
    event.stopPropagation();
    if(!stopReport){openExecutionInterruption(project,item,actor,onChanged,returnToCalendar);return;}
    let resumed=false;
    openWbsSheet({title:stopReport.type==='planned_pause'?'توقف مجاز':'توقف غیرمجاز',
      historyKey:'execution-stop-report:'+item.id,showSave:false,keepParent:!!returnToCalendar,
      onClose:()=>{if(resumed) returnToCalendar?.();},body(root,dismiss){
        for(const text of [stopReport.reason,stopReport.description]){
          const line=documentRef.createElement('p');
          line.textContent=text||'';root.append(line);
        }
        root.append(detailRow(documentRef,'تاریخ شروع توقف',formatDate(stopReport.day)));
        if(stopReport.resumeOn)root.append(detailRow(documentRef,'تاریخ ادامه',formatDate(stopReport.resumeOn)));
        if(stopReport.attributedContacts?.length)root.append(detailRow(documentRef,'طرف‌های منتسب',stopReport.attributedContacts.map(person=>person.name).join('، ')));
        appendReportPhotos(root,stopReport.photos);
        if(!activeStop || !canReport)return;
        const resume=linkButton(documentRef,'wbs-input','ازسرگیری کار');
        const feedback=documentRef.createElement('p');
        feedback.setAttribute('role','alert');
        resume.onclick=()=>{
          const result=todayApi.saveInterruption(project.id,refOf(item),{id:activeStop.id,resume:true},actor);
          if(!result.ok){feedback.textContent='ازسرگیری ثبت نشد. دسترسی و وضعیت کار را بررسی کنید.';return;}
          resumed=true;dismiss();onChanged?.();
        };
        root.append(resume,feedback);
      }});
  };
  const canChangeProgress=canReport && !executionInterruption(entity,today);
  const progress=progressCircle(documentRef,entity,{summary:{},onClick:canChangeProgress?event=>{
    event.stopPropagation();
    openNumpadGeneric(String(Number(entity.progress)||0),raw=>{
      const value=Number(raw);
      if(!raw||!Number.isInteger(value)||value<0||value>100){window.KarhaUI?.showToast?.('درصد پیشرفت باید بین صفر تا صد باشد');return false;}
      const result=todayApi.setProgress(project.id,refOf(item),value,currentExecutionActor(project));
      if(!result.ok){window.KarhaUI?.showToast?.('ثبت درصد پیشرفت انجام نشد');return false;}
      onChanged?.();
    },{suffix:'٪',group:false,maxLen:3,allowPaste:false});
  }:undefined});
  if(!canChangeProgress)progress.onclick=event=>event.stopPropagation();
  heading.append(titles,progress);
  if(item.kind==='standalone' && entity.oddJobType && !approval && canWriteProjectModule(project.id,'execution:today')){
    heading.classList.add('has-oddjob-menu');
    const canDelete=projectPermissionState(project.id,['execution:today']).levels['execution:today']==='full';
    const menu=contractActionsMenu({
      onEdit:()=>openStandaloneWorkSheet({projectId:project.id,existing:entity,onChanged,saveStandalone:draft=>updateStandaloneWork(project.id,draft)}),
      onDelete:canDelete?()=>openConfirm('این خرده‌کار حذف شود؟',()=>{
        const result=deleteStandaloneWork(project.id,entity.id);
        if(!result.ok)window.KarhaLegacy?.showToast?.('حذف خرده‌کار انجام نشد');
        else onChanged?.();
      },'بله',{cancelLabel:'خیر'}):undefined,
    });
    menu.querySelector?.('.nb-more')?.setAttribute('aria-label','عملیات خرده‌کار');
    heading.append(menu);
  }
  if(!approval && (item.kind==='task' || item.kind==='work')){
    const actions=planningTaskActions(documentRef,project,item,onChanged);
    if(actions){
      heading.classList.add('has-oddjob-menu');
      const menu=contractActionsMenu(actions);
      menu.querySelector('.nb-more')?.setAttribute('aria-label','عملیات کار برنامه');
      heading.append(menu);
    }
  }
  card.appendChild(heading);
  const timing=scheduleBar(documentRef,entity,today);
  if(timing){
    const schedule=documentRef.createElement('div');
    schedule.className='today-card-schedule';
    if(timing.status?.text){
      const label=documentRef.createElement('small');
      label.className='today-schedule-status is-'+timing.status.tone;
      if(timing.status.tone==='remaining'){
        label.innerHTML='<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>';
      }
      label.append(timing.status.text);
      schedule.append(label);
    }
    const dates=documentRef.createElement('div');
    dates.className='today-schedule-dates';
    const start=documentRef.createElement('span');
    start.textContent=formatScheduleEndpoint(entity.scheduleStart);
    const end=documentRef.createElement('span');
    end.textContent=formatScheduleEndpoint(entity.scheduleEnd);
    dates.append(start,end);
    schedule.append(timing.bar,dates);
    card.append(schedule);
  }
  // Bottom activity bar: latest update + small photo thumbs
  const activityBar = documentRef.createElement('div');
  activityBar.className = 'today-card-activity';
  if(assignee){
    const person=documentRef.createElement('div');
    person.className='today-card-person';
    const avatar=documentRef.createElement('span');
    avatar.className='today-card-avatar';
    avatar.setAttribute('aria-hidden','true');
    avatar.innerHTML='<svg viewBox="0 0 24 24" focusable="false"><circle cx="12" cy="8" r="3.2"/><path d="M5.5 18.5c1.2-2.8 3.4-4.2 6.5-4.2s5.3 1.4 6.5 4.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
    const identity=documentRef.createElement('div');
    const role=documentRef.createElement('span');
    role.textContent='مسئول پیگیری:';
    const name=documentRef.createElement('strong');
    name.textContent=contactName(assignee);
    identity.append(role,name);
    person.append(avatar,identity);
    activityBar.append(person);
  }
  const reportMeta=documentRef.createElement('div');
  reportMeta.className='today-card-report-meta';
  const reportActions=documentRef.createElement('div');
  reportActions.className='today-card-report-actions';
  if(stopReport || (canReport && entity.type!=='خرید'))reportActions.append(stop);
  reportActions.append(report);
  reportMeta.append(reportActions);
  const latest = latestActivity(entity);
  if (latest) {
    const textEl = documentRef.createElement('span');
    textEl.className = 'today-activity-text';
    textEl.textContent = latest.text;
    reportMeta.append(textEl);
  }
  const reportWithPhotos=reportsOf(entity).find(report=>report.photos?.some(photo=>photo?.hasThumbnail));
  if(reportWithPhotos){
    const photos=reportWithPhotos.photos.filter(photo=>photo?.hasThumbnail).slice(0,3);
    const thumbs=documentRef.createElement('span');
    thumbs.className='today-activity-thumbs';
    for(const photo of photos){
      const image=documentRef.createElement('img');
      image.className='today-activity-thumb';
      image.alt='';
      image.decoding='async';
      thumbs.appendChild(image);
      loadActivityThumbnail(documentRef,image,photo);
    }
    activityBar.appendChild(thumbs);
  }
  activityBar.append(reportMeta);
  card.append(activityBar);
  if(approval?.action){
    const actions=documentRef.createElement('div');
    actions.className='today-card-approval-actions';
    actions.append(approval.action);
    if(approval.rejectAction)actions.append(approval.rejectAction);
    card.append(actions);
  }
  return card;
}

function loadActivityThumbnail(documentRef,image,photo){
  const Observer=documentRef.defaultView?.IntersectionObserver;
  if(!Observer)return;
  const observer=new Observer(entries=>{
    if(!entries.some(entry=>entry.isIntersecting))return;
    observer.disconnect();
    fetchFile(photo,true).then(blob=>{
      if(!image.isConnected)return;
      const url=URL.createObjectURL(blob);
      const release=()=>URL.revokeObjectURL(url);
      image.addEventListener('load',release,{once:true});
      image.addEventListener('error',release,{once:true});
      image.src=url;
    }).catch(()=>{image.hidden=true;});
  });
  observer.observe(image);
}

function latestActivity(entity) {
  const candidates = [];
  for (const r of entity.executionReports || []) {
    if (r && !r.trashed && r.createdAt) candidates.push({ at: new Date(r.createdAt).getTime(), text: 'گزارش ثبت شد' });
  }
  for (const c of entity.executionComments || []) {
    if (c && !c.trashed && c.createdAt) candidates.push({ at: new Date(c.createdAt).getTime(), text: 'نظر ثبت شد' });
  }
  for (const h of entity.executionHistory || []) {
    if (h && h.at) candidates.push({ at: new Date(h.at).getTime(), text: 'به‌روزرسانی' });
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.at - a.at);
  const top = candidates[0];
  const ago = relativeTime(top.at);
  return { text: ago ? `به‌روزرسانی: ${toPersianDigits(ago)}` : 'به‌روزرسانی', at: top.at };
}

function relativeTime(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'همین الان';
  if (m < 60) return m + ' دقیقه پیش';
  const h = Math.floor(m / 60);
  if (h < 24) return h + ' ساعت پیش';
  const d = Math.floor(h / 24);
  return d + ' روز پیش';
}

const executionFilterFields=[
  ['assignee','مسئول پیگیری',(_project,item)=>item.entity.assigneeContactId],
  ['approver','مسئول تأیید',(_project,item)=>executionApproverIds(item.entity)],
  ['contractor','پیمانکار',(project,item)=>contractorForItem(project,item).contact?.id],
  ['priority','اهمیت',(_project,item)=>item.entity.priority || 'normal'],
];

export function filterExecutionCards(project,items,filters){
  return items.filter(item=>executionFilterFields.every(([key,,value])=>
    !filters[key] || [value(project,item)].flat().map(String).includes(filters[key])));
}

function openExecutionDetailsFilter(documentRef,project,items,onApply){
  const draft={...activeDetails};
  const contacts=(project.contacts||[]).filter(contact=>contact && !contact.trashed);
  const footer=documentRef.createElement('div');
  footer.className='execution-details-filter-footer';
  const apply=linkButton(documentRef,'execution-details-filter-apply','');
  const updateCount=()=>{apply.textContent='نمایش '+toPersianDigits(filterExecutionCards(project,items,draft).length)+' کار';};
  apply.onclick=()=>{closeWbsSheet();onApply(draft);};
  footer.append(apply);
  openWbsSheet({
    title:'فیلتر',showSave:false,autoFocus:false,historyKey:'execution-details-filter:'+project.id,footer,
    body(root){
      root.classList.add('execution-details-filter');
      for(const [key,label] of executionFilterFields){
        const choices=key==='priority'
          ? Object.entries(PRIORITY_LABELS).map(([id,name])=>({id,name}))
          : contacts.map(contact=>({id:String(contact.id),name:contactName(contact)}));
        const row=documentRef.createElement('div');
        row.className='execution-details-filter-row';
        const picker=linkButton(documentRef,'execution-details-filter-picker','');
        const name=documentRef.createElement('span');name.textContent=label;
        const selection=documentRef.createElement('span');
        const clear=linkButton(documentRef,'execution-details-filter-clear','','حذف '+label);
        clear.onclick=()=>{
          delete draft[key];
          paint();updateCount();
          picker.focus();
        };
        const paint=()=>{
          const selected=choices.find(choice=>choice.id===draft[key]);
          selection.textContent=selected?.name || 'انتخاب';
          selection.className=selected?'execution-details-filter-value':'is-placeholder';
          row.classList.toggle('has-selection',Boolean(selected));
          clear.hidden=!selected;
          clear.textContent=selected?'×':'';
        };
        picker.append(name,selection);
        row.append(picker,clear);
        picker.onclick=()=>openSearchPicker({
          title:'انتخاب '+label,listTitle:key==='priority'?'درجه‌های اهمیت':'مخاطبین',
          contextKey:'execution-details-filter:'+project.id+':'+key,showStar:false,showAdd:false,
          items:[{id:'__all__',name:'همه'},...choices],
          onSelect(selected){
            if(selected.id==='__all__')delete draft[key];
            else draft[key]=String(selected.id);
            paint();updateCount();
          },
        });
        paint();root.append(row);
      }
    },
  });
  updateCount();
}

export function renderTodayView(project,documentRef=document,onChanged,{standalone=false}={}){
  if(activeProjectId!==String(project?.id||'')){
    activeProjectId=String(project?.id||'');
    activeMode='today';standaloneMode='today';activeBranch='';activeDetails={};
  }
  const today=tehranTodayJalali();
  const selectedMode=standalone?standaloneMode:activeMode;
  let items=standalone?collectStandaloneWorks(project,today).filter(item=>item.mode===selectedMode):activeMode==='all'?collectTodayItems(project,today):itemsForMode(project,activeMode,today);
  const tree=standalone?null:executionFilterTree(project,today);
  const findBranch=node=>node.id===activeBranch?node:node.children.map(findBranch).find(Boolean);
  const selectedBranch=tree && activeBranch?findBranch(tree):null;
  if(selectedBranch){
    const keys=new Set(selectedBranch.keys);
    items=items.filter(item=>keys.has(executionWorkKey(item)));
  }
  const statusAndBranchItems=items;
  if(!standalone)items=filterExecutionCards(project,items,activeDetails);
  items = items.slice().sort((a, b) => {
    const ta = latestActivity(a.entity)?.at || 0;
    const tb = latestActivity(b.entity)?.at || 0;
    return tb - ta;
  });
  const frame=documentRef.createElement('section');
  frame.className='wbs-view-frame wbs-today-frame is-today-view';
  frame.dataset.view=standalone?'oddjobs':'today';
  frame.dataset.mode=selectedMode;
  const header=documentRef.createElement('div');
  header.className='wbs-view-header today-task-toolbar';
  const tabs=documentRef.createElement('div');
  tabs.className='today-task-tabs';
  if(!standalone)header.className+=' today-task-toolbar-stacked';
  tabs.setAttribute('role','tablist');
  tabs.setAttribute('aria-label','دسته‌های لیست کارها');
  for(const mode of (standalone?[...TODAY_MODES,'waiting','blocked']:['all',...TODAY_MODES,'waiting','blocked'])){
    const button=documentRef.createElement('button');
    button.type='button';
    button.className='wbs-tree-mode-tab'+(mode===selectedMode?' active':'');
    button.dataset.mode=mode;
    button.textContent=standalone && mode==='pending'?'تکمیل‌شده':mode==='all'?'همه':LABELS[mode];
    button.setAttribute('role','tab');
    button.setAttribute('aria-selected',String(mode===selectedMode));
    if(mode==='pending')button.title='کارهای تکمیل‌شدهٔ در انتظار تأیید';
    button.addEventListener('click',()=>{if(standalone)standaloneMode=mode;else activeMode=mode;onChanged?.();});
    tabs.appendChild(button);
  }
  const filter=documentRef.createElement('button');
  filter.type='button';
  filter.className='wbs-tree-mode-tab today-task-filter';
  filter.textContent=selectedBranch?.title || 'همه مراحل';
  if(selectedBranch){
    filter.classList.add('active');
  }
  filter.onclick=()=>openExecutionBranchFilter(project,tree,id=>{activeBranch=id;onChanged?.();},selectedBranch);
  const delayReport=linkButton(documentRef,'wbs-tree-mode-tab today-task-filter','گزارش تأخیرات');
  delayReport.onclick=()=>openExecutionDelayReport(project,standalone?collectStandaloneWorks(project,today):collectTodayItems(project,today,{includeApproved:true}),{
    actor:currentExecutionActor(project),canReview:canWriteProjectModule(project.id,'execution:today'),refresh:onChanged});
  const showDelayReport=projectPermissionState(project.id,['reports:reports']).visible;
  const showCalendar=options=>openExecutionCalendar(projectRepository.find(project.id)||project,
    (source,item,day,selection)=>renderTodaySummary(documentRef,source,item,day,onChanged,()=>showCalendar(selection)),options);
  const calendar=linkButton(documentRef,'wbs-tree-mode-tab today-task-filter','تقویم');
  calendar.onclick=()=>showCalendar();
  header.append(tabs);
  if(standalone && showDelayReport)header.append(delayReport);
  if(standalone){
    if(canWriteProjectModule(project.id,'execution:today')){
      const add=linkButton(documentRef,'wbs-tree-mode-tab today-task-filter oddjobs-add','+','افزودن خرده‌کار');
      add.onclick=()=>openStandaloneWorkSheet({projectId:project.id,onChanged,
        saveStandalone:draft=>{
          const result=createStandaloneWork(project.id,draft);
          if(result.ok)standaloneMode=timeState(result.task,tehranTodayJalali());
          return result;
        },
      });
      header.append(add);
    }
  }else{
    const tools=documentRef.createElement('div');
    tools.className='today-task-secondary';
    const detailsFilter=linkButton(documentRef,'wbs-tree-mode-tab today-task-filter'+(Object.keys(activeDetails).length?' active':''),'فیلتر');
    detailsFilter.onclick=()=>openExecutionDetailsFilter(documentRef,project,statusAndBranchItems,filters=>{activeDetails=filters;onChanged?.();});
    tools.append(filter,detailsFilter,calendar);
    if(showDelayReport)tools.append(delayReport);
    const appendTag=(label,value,clear)=>{
      const tag=linkButton(documentRef,'today-active-filter-tag','', 'حذف فیلتر '+label+' '+value);
      const text=documentRef.createElement('span');
      text.textContent=label+': '+value;
      const close=documentRef.createElement('span');
      close.textContent='×';
      close.setAttribute('aria-hidden','true');
      tag.append(text,close);
      tag.onclick=()=>{clear();onChanged?.();};
      tools.append(tag);
    };
    if(selectedBranch)appendTag(selectedBranch.children.length?'مرحله':'کار',selectedBranch.title,()=>{activeBranch='';});
    for(const [key,label] of executionFilterFields){
      const id=activeDetails[key];
      if(!id)continue;
      const contact=(project.contacts||[]).find(row=>row && !row.trashed && String(row.id)===id);
      const value=key==='priority'?PRIORITY_LABELS[id]:contact && contactName(contact);
      appendTag(label,value || 'انتخاب‌شده',()=>{delete activeDetails[key];});
    }
    header.append(tools);
  }
  const body=documentRef.createElement('div');
  body.className='wbs-view-body wbs-today-body';
  if(!items.length)body.innerHTML='<div class="empty-state">موردی در این بخش وجود ندارد.</div>';
  else items.forEach(item=>body.appendChild(renderTodaySummary(documentRef,project,item,today,onChanged)));
  const stopWatching=()=>{
    clearInterval(timer);
    documentRef.removeEventListener('visibilitychange',refreshDate);
  };
  const refreshDate=()=>{
    if(!frame.isConnected){stopWatching();return;}
    if(today!==tehranTodayJalali()){stopWatching();onChanged?.();}
  };
  const timer=setInterval(refreshDate,1000);
  timer.unref?.();
  documentRef.addEventListener('visibilitychange',refreshDate);
  frame.append(header,body);
  documentRef.defaultView?.requestAnimationFrame(()=>{
    const selected=tabs.querySelector('[aria-selected="true"]');
    if(!frame.isConnected || !selected || tabs.scrollWidth<=tabs.clientWidth)return;
    const strip=tabs.getBoundingClientRect();
    const tab=selected.getBoundingClientRect();
    tabs.scrollLeft+=(tab.left+tab.width/2)-(strip.left+strip.width/2);
  });
  return frame;
}

