import { todayApi, COMMENT_MIN_LENGTH, REJECTION_MIN_LENGTH } from '../../domain/wbs/todayApi.js';
import { contractorForItem, executionStatus, itemsForMode, remainingLabel, statusLabel, tehranTodayJalali, timeState } from '../../domain/wbs/todayDomain.js';
import { fieldRow, openWbsSheet } from './wbsSheet.js';
import { toPersianDigits } from '../../ui/digits.js';
import { currentExecutionActor, isExecutionApprover, isExecutionAssignee } from './executionActor.js';
import { openDailyExecutionReport, progressCircle } from './dailyExecutionReport.js';

export const TODAY_ICON = 'M200-80q-33 0-56.5-23.5T120-160v-560q0-33 23.5-56.5T200-800h40v-80h80v80h320v-80h80v80h40q33 0 56.5 23.5T840-720v255l-80 80v-175H200v400h248l80 80H200Zm0-560h560v-80H200v80Zm0 0v-80 80ZM662-60 520-202l56-56 85 85 170-170 56 57L662-60Z';
const ICONS = Object.freeze({ overdue:'./src/assets/wbs/pending-actions.svg', today:'./src/assets/wbs/today.svg', future:'./src/assets/wbs/next-week.svg', pending:'./src/assets/wbs/pending-approval.svg', unscheduled:'./src/assets/wbs/event-busy.svg', filter:'./src/assets/wbs/filter-alt.svg' });
const LABELS = Object.freeze({ overdue:'کارهای عقب‌افتاده', today:'کارهای امروز', future:'کارهای آینده', pending:'منتظر تأیید', unscheduled:'زمان‌بندی‌نشده' });
const TYPE_CLASSES = new Map([['اجرا','type-1'],['خرید','type-2'],['نیروی کار','type-3'],['پیمانکار','type-4'],['کرایه','type-5'],['خدمات','type-6'],['پیگیری','type-7']]);
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
function openReject(item,onChanged){ openWbsSheet({ title:'رد تأیید', saveLabel:'ثبت رد', body(root){ root.appendChild(fieldRow('علت رد',textArea(document,'','rejectionReason'))); }, onSave(root){ const result=todayApi.reject(activeProjectId,refOf(item),root.querySelector('[name="rejectionReason"]').value,actor()); if(!result.ok){ window.KarhaUI?.showToast?.(`علت رد حداقل ${toPersianDigits(REJECTION_MIN_LENGTH)} حرف باشد`); return false; } activeMode=timeState(result.entity, tehranTodayJalali()); onChanged?.(); return true; } }); }
function renderReports(documentRef,entity){ const host=documentRef.createElement('div'); host.className='today-reports'; reportsOf(entity).forEach(report=>{ const row=documentRef.createElement('article'); row.className='today-report'; row.innerHTML=`<p>${esc(report.description)}</p><div>${esc(report.createdBy?.name||'کاربر')} · ${esc(formatMoment(report.createdAt))}${report.updatedAt?` · <b>ویرایش‌شده ${esc(formatMoment(report.updatedAt))}</b>`:''}</div>`; host.appendChild(row); }); return host; }
function renderComments(documentRef,item,onChanged){
  const host=documentRef.createElement('div'); host.className='today-comments'; const comments=commentsOf(item.entity); let expanded=false; const list=documentRef.createElement('div');
  const paint=()=>{ list.replaceChildren(); (expanded?comments:comments.slice(0,2)).forEach(comment=>{ const row=documentRef.createElement('div'); row.className='today-comment'+(comment.type==='approval_rejected'?' is-rejection':''); row.innerHTML=`<p>${esc(comment.text)}</p><span>${esc(comment.createdBy?.name||'کاربر')} · ${esc(formatMoment(comment.createdAt))}</span>`; list.appendChild(row); }); }; paint(); host.appendChild(list);
  if(comments.length>2){ const more=documentRef.createElement('button'); more.type='button'; more.className='today-show-comments'; more.textContent=`مشاهده ${toPersianDigits(comments.length-2)} نظر قبلی`; more.addEventListener('click',()=>{ expanded=true; paint(); more.remove(); }); host.appendChild(more); }
  return host;
}
function historyLabel(type){ return ({started:'شروع شد',start_cancelled:'شروع لغو شد',report_created:'گزارش ثبت شد',report_edited:'گزارش ویرایش شد',comment_added:'نظر ثبت شد',marked_complete:'انجام‌شده اعلام شد',completed_without_approval:'بدون نیاز به تأیید تکمیل شد',sent_for_approval:'برای تأیید ارسال شد',approval_rejected:'تأیید رد شد',approval_cancelled:'تأیید نهایی لغو شد',returned_to_active:'به فهرست فعال برگشت',completion_withdrawn:'تیک انجام‌شدن برداشته شد',returned_to_previous:'به تب قبلی برگشت',approved:'تأیید نهایی شد'})[type]||type; }
function renderHistory(documentRef,entity){ const history=(entity.executionHistory||[]).slice().sort((a,b)=>Number(b.at)-Number(a.at)); const details=documentRef.createElement('details'); details.className='today-history'; details.innerHTML='<summary>تاریخچه</summary>'; history.forEach(entry=>{ const row=documentRef.createElement('div'); row.textContent=`${historyLabel(entry.type)} · ${entry.actor?.name||'کاربر'} · ${formatMoment(entry.at)}`; details.appendChild(row); }); return details; }
function renderCard(documentRef,project,item,today,onChanged){
  const entity=item.entity,status=executionStatus(entity),assignee=(project.contacts||[]).find(contact=>String(contact.id)===String(entity.assigneeContactId||'')),contractor=contractorForItem(project,item).contact;
  const card=documentRef.createElement('article'); card.className='today-task-card wbs-costline-work'; card.dataset.entityId=item.id; card.dataset.entityKind=item.kind;
  const dateText=entity.scheduleStart ? (entity.scheduleStart===entity.scheduleEnd?formatDate(entity.scheduleStart):`${formatDate(entity.scheduleStart)} > ${formatDate(entity.scheduleEnd)}`) : '';
  const type=entity.type||item.work.type||'کار';
  const pending = item.mode==='pending';
  const currentActor=actor();
  const assigned=isExecutionAssignee(entity,currentActor);
  const heading=documentRef.createElement('div'); heading.className='wbs-costline-work-heading today-card-heading';
  const complete=progressCircle(documentRef,entity,{pending,disabled:!assigned,onClick:()=>{
    if(pending){
      const result=todayApi.withdrawCompletion(activeProjectId,refOf(item),actor());
      if(!result.ok){ window.KarhaUI?.showToast?.('لغو ارسال ممکن نیست'); return; }
      activeMode=timeState(result.entity,tehranTodayJalali()); onChanged?.(); return;
    }
    openDailyExecutionReport({projectId:activeProjectId,item,actor:currentActor,onChanged,onSubmitted(updated){activeMode=timeState(updated,tehranTodayJalali());},subject:'کار'});
  }});
  const titles=documentRef.createElement('div'); titles.className='today-card-titles'; titles.innerHTML=`<strong>${esc(entity.title||entity.text||'')}</strong><span>${esc(item.path.join(' · '))}</span>`;
  const chip=documentRef.createElement('span'); chip.className=`wbs-type-chip ${TYPE_CLASSES.get(type)||'type-7'}`; chip.textContent=type;
  heading.append(chip, titles, complete); card.appendChild(heading);
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
  const statusValue=documentRef.createElement('span'); statusValue.className='today-status-slot';
  let statusText='هنوز شروع نشده است';
  if(pending){ statusText=statusLabel(status); statusValue.textContent=''; }
  else if(entity.actualStart){
    statusText=`وضعیت: ${statusLabel(status)}`;
    const cancel=linkButton(documentRef, 'today-cancel-start today-status-action wbs-costline-manual', 'لغو شروع', 'لغو شروع');
    statusValue.appendChild(cancel);
  } else {
    statusValue.appendChild(linkButton(documentRef, 'today-start today-status-action wbs-costline-manual', 'شروع کار', 'شروع کار'));
  }
  const statusRow=detailRow(documentRef,statusText,statusValue); statusRow.classList.add(entity.actualStart?'is-in-progress':'is-not-started'); card.appendChild(statusRow);
  const actions=documentRef.createElement('div'); actions.className='today-task-actions';
  const mayApprove=isExecutionApprover(entity,currentActor);
  if(pending){
    if(mayApprove){
      const approve=linkButton(documentRef, 'wbs-costline-manual', 'تأیید'); approve.addEventListener('click',()=>{todayApi.approve(activeProjectId,refOf(item),actor());onChanged?.();});
      const reject=linkButton(documentRef, 'wbs-costline-manual is-danger', 'رد'); reject.addEventListener('click',()=>openReject(item,onChanged));
      actions.append(approve,reject);
    }
  } else {
    const startButton=card.querySelector('.today-start'); if(startButton) startButton.disabled=!assigned;
    card.querySelector('.today-start')?.addEventListener('click',()=>{todayApi.start(activeProjectId,refOf(item),actor());onChanged?.();});
    card.querySelector('.today-cancel-start')?.addEventListener('click',()=>{todayApi.cancelStart(activeProjectId,refOf(item),actor());onChanged?.();});
  }
  if(actions.childElementCount) card.appendChild(detailRow(documentRef, 'تأیید', actions));
  card.appendChild(renderReports(documentRef,entity));
  const comment=linkButton(documentRef,'wbs-costline-manual today-section-action','افزودن نظر');comment.addEventListener('click',()=>openComment(item,onChanged));card.appendChild(detailRow(documentRef,'',comment));
  card.appendChild(renderComments(documentRef,item,onChanged));
  card.appendChild(renderHistory(documentRef,entity));
  return card;
}
export function renderTodayView(project,documentRef=document,onChanged){
  activeProject=project;
  if(activeProjectId!==String(project?.id||'')){activeProjectId=String(project?.id||'');activeMode='today';} const today=tehranTodayJalali(); const modes=['overdue','today','future','pending','unscheduled']; const byMode=Object.fromEntries(modes.map(mode=>[mode,itemsForMode(project,mode,today)])); const available=byMode.unscheduled.length?modes:modes.filter(mode=>mode!=='unscheduled'); if(!available.includes(activeMode))activeMode='today';
  const frame=documentRef.createElement('section'); frame.className='wbs-view-frame wbs-today-frame is-today-view'; frame.dataset.view='today'; frame.dataset.mode=activeMode; const header=documentRef.createElement('div'); header.className='wbs-view-header'; const title=documentRef.createElement('div'); title.className='wbs-view-title'; title.textContent=LABELS[activeMode]; const actions=documentRef.createElement('div'); actions.className='wbs-view-actions today-mode-tabs'; actions.setAttribute('role','tablist');
  available.forEach(mode=>{const button=documentRef.createElement('button');button.type='button';button.className='wbs-tree-mode-tab today-mode-tab'+(mode===activeMode?' active':'');button.dataset.mode=mode;button.setAttribute('role','tab');button.setAttribute('aria-selected',mode===activeMode?'true':'false');button.setAttribute('aria-label',LABELS[mode]);button.title=LABELS[mode];button.innerHTML=`<img src="${ICONS[mode]}" alt="">`;button.addEventListener('click',()=>{activeMode=mode;onChanged?.();});actions.appendChild(button);}); const divider=documentRef.createElement('span');divider.className='wbs-view-action-separator';actions.appendChild(divider);const filter=documentRef.createElement('button');filter.type='button';filter.className='wbs-tree-mode-tab today-filter';filter.setAttribute('aria-label','فیلتر');filter.title='فیلتر';filter.innerHTML=`<img src="${ICONS.filter}" alt="">`;actions.appendChild(filter);
  const body=documentRef.createElement('div');body.className='wbs-view-body wbs-today-body';if(!byMode[activeMode].length)body.innerHTML='<div class="empty-state">موردی در این بخش وجود ندارد.</div>';else byMode[activeMode].forEach(item=>body.appendChild(renderCard(documentRef,project,item,today,onChanged)));header.append(title,actions);frame.append(header,body);return frame;
}
