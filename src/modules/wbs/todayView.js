import {openStandaloneWorkSheet} from './workTaskView.js';
import {createStandaloneWork} from '../../domain/wbs/workTaskApi.js';
import {openExecutionCalendar} from './executionCalendar.js';
import {projectRepository} from '../../data/projectRepository.js';
import { todayRepository } from '../../data/todayRepository.js';
import { canWriteProjectModule, projectPermissionState } from '../roleManagement/permissionState.js';
import { todayApi, COMMENT_MIN_LENGTH } from '../../domain/wbs/todayApi.js';
import { collectStandaloneWorks, dailyExecutionStatus, DAILY_EXECUTION_LABELS, contractorForItem, executionStatus, itemsForMode, jalaliDayNumber, remainingLabel, TODAY_MODES, tehranTodayJalali, timeState } from '../../domain/wbs/todayDomain.js';
import { closeWbsSheet, fieldRow, openWbsSheet } from './wbsSheet.js';
import { toPersianDigits } from '../../ui/digits.js';
import { currentExecutionActor, isExecutionAssignee } from './executionActor.js';
import { appendReportPhotos, openDailyExecutionReport, progressCircle, todayReportOf } from './dailyExecutionReport.js';
import { fetchFile } from '../files/fileApi.js';
import { openFileViewer } from '../files/fileViewer.js';
import { executionWorkKey } from '../reports/dailyExecutionReportsView.js';

export const TODAY_ICON = 'M200-80q-33 0-56.5-23.5T120-160v-560q0-33 23.5-56.5T200-800h40v-80h80v80h320v-80h80v80h40q33 0 56.5 23.5T840-720v255l-80 80v-175H200v400h248l80 80H200Zm0-560h560v-80H200v80Zm0 0v-80 80ZM662-60 520-202l56-56 85 85 170-170 56 57L662-60Z';
const LABELS = Object.freeze({ overdue:'عقب‌افتاده', today:'امروز', future:'آینده', pending:'تکمیل', unscheduled:'بی زمان' });
const TYPE_CLASSES = new Map([['اجرا','type-1'],['خرید','type-2'],['نیروی کار','type-3'],['پیمانکار','type-4'],['کرایه','type-5'],['خدمات','type-6'],['پیگیری','type-7'],['سایر','type-9']]);
let standaloneMode='today';
let activeMode = 'today'; let activeProjectId = null; let activeProject = null;

function actor(){ return currentExecutionActor(activeProject); }
function esc(value){ return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])); }
function contactName(contact){ return [contact?.type, contact?.firstName, contact?.lastName].filter(Boolean).join(' ').trim() || contact?.name || ''; }
function refOf(item){ return { kind:item.kind, id:item.id, workId:item.workId }; }
function formatDate(value){
  const parts = String(value || '').split('/');
  if(parts.length !== 3) return toPersianDigits(String(value || ''));
  return `${toPersianDigits(Number(parts[0]))}/${toPersianDigits(Number(parts[1]))}/${toPersianDigits(Number(parts[2]))}`;
}
function formatMoment(value){ return value ? new Intl.DateTimeFormat('fa-IR-u-ca-persian', { timeZone:'Asia/Tehran', year:'numeric', month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' }).format(new Date(value)) : ''; }
function reportsOf(entity){ return (entity.executionReports || []).filter(report => report && !report.trashed).slice().reverse(); }
function commentsOf(entity){ return (entity.executionComments || []).filter(comment => comment && !comment.trashed).slice().sort((a,b) => Number(b.createdAt) - Number(a.createdAt)); }
function textArea(documentRef, value, name){ const field = documentRef.createElement('textarea'); field.className='wbs-input today-textarea'; field.name=name; field.value=value || ''; return field; }
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
function responsibilityCell(documentRef,label,name){
  const cell=documentRef.createElement('span'); cell.className='today-responsibility-cell';
  const title=documentRef.createElement('span'); title.textContent=label;
  const person=documentRef.createElement('span'); person.textContent=name || '—';
  cell.append(title,person); return cell;
}
function linkButton(documentRef, className, text, label){
  const button = documentRef.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = text;
  if(label) button.setAttribute('aria-label', label);
  return button;
}

function openComment(item,onChanged){
  openWbsSheet({title:'افزودن نظر',saveLabel:'ذخیره',presentation:'stage-create',autoFocus:false,historyKey:`execution-comment:${activeProjectId}:${item.id}`,body(root){
    root.appendChild(fieldRow('نظر',textArea(document,'','commentText')));
  },onSave(root){const result=todayApi.addComment(activeProjectId,refOf(item),root.querySelector('[name="commentText"]').value,actor());if(!result.ok){window.KarhaUI?.showToast?.(`نظر حداقل ${toPersianDigits(COMMENT_MIN_LENGTH)} حرف باشد`);return false;}onChanged?.();return true;}});
}
function renderReports(documentRef, projectId, item, forApproval=false){
  const host=documentRef.createElement('div');
  host.className='today-reports';
  const reports=reportsOf(item.entity);
  const canBrowse=!forApproval && projectPermissionState(projectId,['reports:reports']).visible;
  const visibleReports=canBrowse ? reports.slice(0,1) : reports;
  for(const report of visibleReports){
    const row=documentRef.createElement('article');
    row.className='today-report';
    const text=String(report.description || '');
    const summary=canBrowse && text.length>140 ? text.slice(0,140)+'…' : text;
    row.innerHTML=`<p>${esc(summary)}</p><div>${esc(report.createdBy?.name||'کاربر')} · ${esc(formatMoment(report.createdAt))}${report.updatedAt?` · <b>ویرایش‌شده ${esc(formatMoment(report.updatedAt))}</b>`:''}</div>`;
    appendReportPhotos(row,report.photos);
    host.appendChild(row);
  }
  if(canBrowse && (reports.length || (item.entity.executionHistory||[]).some(entry=>entry?.type==='start_delayed'))){
    const link=documentRef.createElement('a');
    link.className='today-section-action today-report-link';
    link.textContent='همهٔ گزارش‌های این کار';
    const params=new URLSearchParams({work:executionWorkKey(refOf(item))});
    link.href=`#/projects/${encodeURIComponent(projectId)}/daily-execution-reports?${params}`;
    host.appendChild(link);
  }
  return host;
}
function renderComments(documentRef,item,onChanged){
  const host=documentRef.createElement('div'); host.className='today-comments'; const comments=commentsOf(item.entity); let expanded=false; const list=documentRef.createElement('div');
  const paint=()=>{ list.replaceChildren(); (expanded?comments:comments.slice(0,2)).forEach(comment=>{ const row=documentRef.createElement('div'); row.className='today-comment'+(comment.type==='approval_rejected'?' is-rejection':''); row.innerHTML=`<p>${esc(comment.text)}</p><span>${esc(comment.createdBy?.name||'کاربر')} · ${esc(formatMoment(comment.createdAt))}</span>`; list.appendChild(row); }); }; paint(); host.appendChild(list);
  if(comments.length>2){ const more=documentRef.createElement('button'); more.type='button'; more.className='today-show-comments'; more.textContent=`مشاهده ${toPersianDigits(comments.length-2)} نظر قبلی`; more.addEventListener('click',()=>{ expanded=true; paint(); more.remove(); }); host.appendChild(more); }
  return host;
}
function historyLabel(type){ return ({started:'شروع شد',start_delayed:'دلیل شروع نشدن ثبت شد',start_cancelled:'شروع لغو شد',report_created:'گزارش ثبت شد',report_edited:'گزارش ویرایش شد',comment_added:'نظر ثبت شد',marked_complete:'انجام‌شده اعلام شد',completed_without_approval:'بدون نیاز به تأیید تکمیل شد',sent_for_approval:'برای تأیید ارسال شد',approval_rejected:'تأیید رد شد',approval_cancelled:'تأیید نهایی لغو شد',returned_to_active:'به فهرست فعال برگشت',completion_withdrawn:'تیک انجام‌شدن برداشته شد',returned_to_previous:'به تب قبلی برگشت',approved:'تأیید نهایی شد'})[type]||type; }
function renderHistory(documentRef,entity){ const history=(entity.executionHistory||[]).slice().sort((a,b)=>Number(b.at)-Number(a.at)); const details=documentRef.createElement('details'); details.className='today-history'; details.innerHTML='<summary>تاریخچه</summary>'; history.forEach(entry=>{ const row=documentRef.createElement('div'); row.textContent=`${(entry.type==='daily_status'?DAILY_EXECUTION_LABELS[entry.status]:historyLabel(entry.type))} · ${entry.actor?.name||'کاربر'} · ${formatMoment(entry.at)}${['start_delayed','daily_status'].includes(entry.type) ? [entry.reason,entry.description].filter(Boolean).map(value=>` · ${value}`).join('') : ''}`; details.appendChild(row); }); return details; }
export function renderTodayCard(documentRef,project,item,today,onChanged,approval,afterClose=action=>action()){
  const entity=item.entity,assignee=(project.contacts||[]).find(contact=>String(contact.id)===String(entity.assigneeContactId||'')),contractor=contractorForItem(project,item).contact;
  const card=documentRef.createElement('article'); card.className='today-task-card wbs-costline-work'; card.dataset.entityId=item.id; card.dataset.entityKind=item.kind;
  const dateText=entity.scheduleStart ? (entity.scheduleStart===entity.scheduleEnd?formatDate(entity.scheduleStart):`${formatDate(entity.scheduleStart)} > ${formatDate(entity.scheduleEnd)}`) : '';
  const type=entity.type||item.work.type||'کار';
  const pending = item.mode==='pending';
  const writable=!approval && canWriteProjectModule(project.id,'execution:today');
  const complete=progressCircle(documentRef,entity,{pending,disabled:true});
  if(approval){
    const heading=documentRef.createElement('div');
    heading.className='wbs-costline-work-heading today-card-heading';
    const titles=documentRef.createElement('div');
    titles.className='today-card-titles';
    titles.innerHTML=`<strong>${esc(entity.title||entity.text||'')}</strong><span>${esc(item.path.join(' · '))}</span>`;
    const chip=documentRef.createElement('span');
    chip.className=`wbs-type-chip ${TYPE_CLASSES.get(type)||'type-7'}`;
    chip.textContent=type;
    heading.append(chip,titles,complete);
    card.appendChild(heading);
  }
  card.appendChild(detailRow(documentRef, dateText, remainingLabel(entity, today)));
  const approver=(project.contacts||[]).find(contact=>String(contact.id)===String(entity.approvalContactId||''));
  const responsibilityRow=documentRef.createElement('div');
  responsibilityRow.className='wbs-costline-detail-row today-responsibility-row';
  responsibilityRow.append(
    responsibilityCell(documentRef,'مسئول پیگیری',assignee?contactName(assignee):'—'),
    responsibilityCell(documentRef,'مسئول تأیید',approver?contactName(approver):'—'),
  );
  card.appendChild(responsibilityRow);
  if(contractor) card.appendChild(detailRow(documentRef, 'پیمانکار: ', contactName(contractor)));
  if(approval){
    if(entity.oddJobType){
      card.appendChild(detailRow(documentRef,'مبلغ',toPersianDigits(Number(entity.amount||0).toLocaleString('en-US'))+' تومان'));
      appendReportPhotos(card,entity.invoices);
    }
    if(approval.action){
      const actions=documentRef.createElement('div');actions.className='today-task-actions';
      actions.appendChild(approval.action);
      card.appendChild(detailRow(documentRef,'تأیید',actions));
    }
    card.appendChild(renderReports(documentRef,project.id,item,true));
    return card;
  }
  const reports=renderReports(documentRef,project.id,item);
  const reportLink=reports.querySelector('.today-report-link');
  reportLink?.addEventListener('click',event=>{
    if(event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)return;
    event.preventDefault();
    afterClose(()=>{window.location.hash=new URL(reportLink.href).hash;});
  });
  card.appendChild(reports);
  if(writable){
    const comment=linkButton(documentRef,'wbs-costline-manual today-section-action','افزودن نظر');
    comment.addEventListener('click',()=>afterClose(()=>openComment(item,onChanged)));
    card.appendChild(detailRow(documentRef,'',comment));
  }
  card.appendChild(renderComments(documentRef,item,onChanged));
  card.appendChild(renderHistory(documentRef,entity));
  return card;
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
  if(end<=start) return now>=start ? 1 : 0;
  return Math.min(1,Math.max(0,(now-start)/(end-start)));
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
function reportThumbnails(documentRef,photos){
  const strip=documentRef.createElement('div');
  strip.className='today-detail-thumbs';
  const urls=[];
  const controllers=[];
  for(const photo of photos||[]){
    const button=documentRef.createElement('button');
    button.type='button';
    button.className='today-detail-thumb';
    button.setAttribute('aria-label',photo?.name||'نمایش عکس');
    const image=documentRef.createElement('img');
    image.alt=photo?.name||'عکس گزارش';
    button.appendChild(image);
    button.addEventListener('click',()=>openFileViewer(photo,{onError:message=>window.KarhaUI?.showToast?.(message),compactImageHeader:true}));
    strip.appendChild(button);
    const controller=new AbortController();
    controllers.push(controller);
    fetchFile(photo,true,{signal:controller.signal}).then(blob=>{
      if(controller.signal.aborted) return;
      const url=URL.createObjectURL(blob);
      urls.push(url);
      image.src=url;
    }).catch(error=>{ if(error?.name!=='AbortError') image.alt='عکس دریافت نشد'; });
  }
  return {strip,release(){controllers.forEach(controller=>controller.abort());urls.forEach(url=>URL.revokeObjectURL(url));}};
}
function renderExecutionDetail(documentRef,project,item,day,refresh,afterClose){
  const root=documentRef.createElement('div');
  root.className='today-detail';
  const entity=item.entity;
  const current=dailyExecutionStatus(entity,day);
  const report=todayReportOf(entity,day);
  const currentActor=currentExecutionActor(project);
  const writable=canWriteProjectModule(project.id,'execution:today');
  let releasePhotos=()=>{};

  const summary=detailCard(documentRef);
  const statusTile=documentRef.createElement('span');
  statusTile.className='today-detail-status';
  const statusLabel=documentRef.createElement('span');
  statusLabel.textContent='وضعیت اجرا ';
  const statusChip=documentRef.createElement('b');
  statusChip.className='today-detail-pill is-'+current.status;
  statusChip.textContent=DAILY_EXECUTION_LABELS[current.status]||'نامشخص';
  statusTile.append(statusLabel,statusChip);
  summary.appendChild(statusTile);
  const schedule=detailCard(documentRef,'today-detail-schedule');
  const scheduleLabel=documentRef.createElement('span');
  scheduleLabel.textContent='زمان‌بندی';
  const remain=documentRef.createElement('strong');
  remain.textContent=heroRemaining(entity,day)||'بی‌زمان';
  schedule.append(scheduleLabel,remain);
  const share=elapsedShare(entity,day);
  if(share!==null){
    const bar=documentRef.createElement('progress');
    bar.max=1;bar.value=share;
    bar.setAttribute('aria-label','زمان سپری‌شده');
    schedule.append(bar,detailRow(documentRef,'شروع '+formatDate(entity.scheduleStart),'پایان '+formatDate(entity.scheduleEnd)));
  }
  const assignee=(project.contacts||[]).find(contact=>String(contact.id)===String(entity.assigneeContactId||''));
  const approver=(project.contacts||[]).find(contact=>String(contact.id)===String(entity.approvalContactId||''));
  const contractor=contractorForItem(project,item).contact;
  const people=documentRef.createElement('details');
  people.className='today-detail-meta';
  const peopleSummary=documentRef.createElement('summary');
  peopleSummary.textContent='مسئولان کار';
  const peopleBody=documentRef.createElement('div');
  const followName=assignee?contactName(assignee):'—';
  const approveName=approver?contactName(approver):'—';
  const peopleLine=documentRef.createElement('p');
  peopleLine.textContent=followName===approveName
    ? 'پیگیری و تأیید · '+followName
    : 'پیگیری · '+followName+' · تأیید · '+approveName;
  peopleBody.appendChild(peopleLine);
  if(contractor){
    const contractorLine=documentRef.createElement('p');
    contractorLine.textContent='پیمانکار: '+contactName(contractor);
    peopleBody.appendChild(contractorLine);
  }
  if(current.reason){
    const reasonLine=documentRef.createElement('p');
    reasonLine.textContent=[current.reason,current.description].filter(Boolean).join(' · ');
    peopleBody.appendChild(reasonLine);
  }
  people.append(peopleSummary,peopleBody);
  summary.appendChild(people);
  root.append(schedule,summary);
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

  if(executionStatus(entity)==='pending_approval'){
    const pending=detailCard(documentRef,'today-detail-pending');
    pending.textContent='در انتظار تأیید';
    root.appendChild(pending);
  }
  const reportCard=detailCard(documentRef,'today-detail-report');
  const reportHead=documentRef.createElement('div');
  reportHead.className='today-detail-rowline';
  const reportTitle=documentRef.createElement('h2');
  reportTitle.textContent='گزارش اجرا';
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
      const photos=reportThumbnails(documentRef,report.photos);
      releasePhotos=photos.release;
      reportCard.appendChild(photos.strip);
    }
  }
  root.appendChild(reportCard);

  const commentsCard=detailCard(documentRef);
  const commentsHead=documentRef.createElement('div');
  commentsHead.className='today-detail-rowline';
  const commentsTitle=documentRef.createElement('h2');
  commentsTitle.textContent='نظرات';
  const commentsCount=documentRef.createElement('small');
  commentsCount.textContent=toPersianDigits(commentsOf(item.entity).length)+' نظر';
  commentsHead.append(commentsTitle,commentsCount);
  commentsCard.append(commentsHead,renderComments(documentRef,item,refresh));
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
  root.appendChild(commentsCard);

  const reports=reportsOf(entity);
  const canBrowse=projectPermissionState(project.id,['reports:reports']).visible;
  if(canBrowse && (reports.length || (entity.executionHistory||[]).some(entry=>entry?.type==='start_delayed'))){
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
  root.appendChild(history);
  return {root,release(){releasePhotos();}};
}

function openTodayDetails(documentRef,project,item,today,onChanged,returnToCalendar){
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
  const header=documentRef.createElement('div');
  header.className='sheet-head today-detail-head';
  const close=documentRef.createElement('button');
  close.type='button';
  close.className='close-btn';
  close.setAttribute('aria-label','بستن');
  close.textContent='×';
  const titles=documentRef.createElement('div');
  titles.className='today-detail-title';
  const caption=documentRef.createElement('span');
  caption.className='sheet-caption';
  caption.textContent=item.entity.title || item.entity.text || 'جزئیات کار';
  const path=documentRef.createElement('span');
  path.className='today-detail-path';
  titles.append(path,caption);
  const ring=documentRef.createElement('div');
  ring.className='today-detail-ring';
  header.append(close,titles,ring);
  let release=()=>{};
  const paint=current=>{
    release();
    path.textContent=(current.path||[]).filter(Boolean).join(' · ');
    ring.replaceChildren(progressCircle(documentRef,current.entity,{summary:{}}));
    const view=renderExecutionDetail(documentRef,project,current,today,refresh,afterClose);
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
  openWbsSheet({
    title:item.entity.title || item.entity.text || 'جزئیات کار',
    header,body:frame,showSave:false,autoFocus:false,historyKey:key,reuseHistoryOnReplace:!!returnToCalendar,
    ...(returnToCalendar?{requestClose:returnToCalendar}:{}),
  }).classList.add('today-detail-overlay');
}

function renderTodaySummary(documentRef,project,item,today,onChanged,returnToCalendar){
  const card=documentRef.createElement('article');
  card.className='today-task-card wbs-costline-work';
  card.dataset.entityId=item.id;
  card.dataset.entityKind=item.kind;
  const heading=documentRef.createElement('div');
  heading.className='today-card-heading today-card-summary';
  const {entity}=item;
  const titles=linkButton(documentRef,'today-card-titles','');
  titles.innerHTML=`<strong><small class="wbs-type-chip ${TYPE_CLASSES.get(entity.type)||'type-7'}">${esc(entity.oddJobType||entity.type||item.work.type||'کار')}</small> ${esc(entity.title||entity.text||'')}</strong><span>${esc(item.path.join(' · '))}</span>`;
  const assignee=(project.contacts||[]).find(contact=>!contact.trashed && String(contact.id)===String(entity.assigneeContactId));
  const contractor=contractorForItem(project,item).contact;
  if(assignee || contractor){
    const people=documentRef.createElement('span');
    people.className='today-card-people';
    if(assignee){
      const person=documentRef.createElement('span');
      person.className='today-card-person';
      const avatar=documentRef.createElement('span');
      avatar.className='today-card-avatar';
      avatar.setAttribute('aria-hidden','true');
      avatar.innerHTML='<svg viewBox="0 0 24 24" focusable="false"><circle cx="12" cy="8" r="3.2"/><path d="M5.5 18.5c1.2-2.8 3.4-4.2 6.5-4.2s5.3 1.4 6.5 4.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
      const name=documentRef.createElement('span');
      name.textContent='مسئول '+contactName(assignee);
      person.append(avatar,name);
      people.append(person);
    }
    if(contractor){
      if(assignee) people.append(' | ');
      const name=documentRef.createElement('span');
      name.textContent='پیمانکار '+contactName(contractor);
      people.append(name);
    }
    titles.append(people);
  }
  const openDetails=()=>openTodayDetails(documentRef,project,item,today,onChanged,returnToCalendar);
  heading.onclick=openDetails;
  const current=dailyExecutionStatus(entity,today);
  const status=current.reasonId==='officialHoliday'?'holiday':current.status;
  const saved=!!todayReportOf(entity,today);
  const currentActor=currentExecutionActor(project);
  const canReport=today===tehranTodayJalali() && canWriteProjectModule(project.id,'execution:today')
    && isExecutionAssignee(entity,currentActor) && !['approved','pending_approval'].includes(executionStatus(entity));
  const report=documentRef.createElement(canReport?'button':'span');
  report.className='today-report-circle is-'+status+(saved?' is-saved':'');
  report.textContent='گزارش';
  report.setAttribute('aria-label',(status==='holiday'?'تعطیل رسمی':DAILY_EXECUTION_LABELS[status])+'، '+(saved?'گزارش ثبت شده':'بدون گزارش'));
  report.onclick=event=>{
    event.stopPropagation();
    if(canReport)openDailyExecutionReport({projectId:project.id,item,actor:currentActor,day:today,statusControls:true,
      onChanged,onReturn:returnToCalendar,onSubmitted(updated){if(item.kind==='standalone')standaloneMode='pending';else activeMode=timeState(updated,tehranTodayJalali());}});
  };
  if(canReport)report.type='button';
  const progress=progressCircle(documentRef,entity,{summary:{}});
  progress.onclick=event=>event.stopPropagation();
  heading.append(titles,report,progress);
  card.appendChild(heading);
  return card;
}

export function renderTodayView(project,documentRef=document,onChanged,{standalone=false}={}){
  activeProject=project;
  if(activeProjectId!==String(project?.id||'')){
    activeProjectId=String(project?.id||'');
    activeMode='today';standaloneMode='today';
  }
  const today=tehranTodayJalali();
  const selectedMode=standalone?standaloneMode:activeMode;
  const items=standalone?collectStandaloneWorks(project,today).filter(item=>item.mode===selectedMode):itemsForMode(project,activeMode,today);
  const frame=documentRef.createElement('section');
  frame.className='wbs-view-frame wbs-today-frame is-today-view';
  frame.dataset.view=standalone?'oddjobs':'today';
  frame.dataset.mode=selectedMode;
  const header=documentRef.createElement('div');
  header.className='wbs-view-header today-task-toolbar';
  const tabs=documentRef.createElement('div');
  tabs.className='today-task-tabs';
  tabs.setAttribute('role','tablist');
  tabs.setAttribute('aria-label','دسته‌های لیست کارها');
  for(const mode of TODAY_MODES){
    const button=documentRef.createElement('button');
    button.type='button';
    button.className='wbs-tree-mode-tab'+(mode===selectedMode?' active':'');
    button.dataset.mode=mode;
    button.textContent=standalone && mode==='pending'?'تکمیل‌شده':LABELS[mode];
    button.setAttribute('role','tab');
    button.setAttribute('aria-selected',String(mode===selectedMode));
    if(mode==='pending')button.title='کارهای تکمیل‌شدهٔ در انتظار تأیید';
    button.addEventListener('click',()=>{if(standalone)standaloneMode=mode;else activeMode=mode;onChanged?.();});
    tabs.appendChild(button);
  }
  const filter=documentRef.createElement('button');
  filter.type='button';
  filter.className='wbs-tree-mode-tab today-task-filter';
  filter.innerHTML='<img src="./src/assets/wbs/filter-alt.svg" alt="">فیلتر';
  const showCalendar=options=>openExecutionCalendar(projectRepository.find(project.id)||project,
    (source,item,day,selection)=>renderTodaySummary(documentRef,source,item,day,onChanged,()=>showCalendar(selection)),options);
  const calendar=linkButton(documentRef,'wbs-tree-mode-tab today-task-filter','تقویم');
  calendar.onclick=()=>showCalendar();
  header.append(tabs,filter);
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
  }else header.append(calendar);
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
  return frame;
}
