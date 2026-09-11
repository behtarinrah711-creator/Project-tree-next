import { todayApi, COMMENT_MIN_LENGTH, REJECTION_MIN_LENGTH, REPORT_MIN_LENGTH } from '../../domain/wbs/todayApi.js';
import { contractorForItem, remainingLabel, tehranTodayJalali } from '../../domain/wbs/todayDomain.js';
import { SHOPPING_MODES, shoppingItemsForMode, shoppingStatusLabel } from '../../domain/wbs/shoppingDomain.js';
import { fieldRow, openWbsSheet } from './wbsSheet.js';
import { toPersianDigits } from '../../ui/digits.js';

export const SHOPPING_ICON = 'M221-120q-27 0-48-16.5T144-179L42-549q-5-19 6.5-35T80-600h190l176-262q5-8 14-13t19-5q10 0 19 5t14 13l176 262h192q20 0 31.5 16t6.5 35L816-179q-8 26-29 42.5T739-120H221Zm-1-80h520l88-320H132l88 320Zm316.5-103.5Q560-327 560-360t-23.5-56.5Q513-440 480-440t-56.5 23.5Q400-393 400-360t23.5 56.5Q447-280 480-280t56.5-23.5ZM367-600h225L479-768 367-600Zm113 240Z';

const ICONS=Object.freeze({overdue:'./src/assets/wbs/pending-actions.svg',today:'./src/assets/wbs/today.svg',future:'./src/assets/wbs/next-week.svg',pending:'./src/assets/wbs/pending-approval.svg',unscheduled:'./src/assets/wbs/event-busy.svg',filter:'./src/assets/wbs/filter-alt.svg'});
const LABELS=Object.freeze({overdue:'خریدهای عقب‌افتاده',today:'خریدهای امروز',future:'خریدهای آینده',pending:'خریدهای منتظر تأیید',unscheduled:'خریدهای زمان‌بندی‌نشده'});
const PRIORITIES=Object.freeze({low:'کم',normal:'عادی',high:'زیاد'});
let activeMode='today';let activeProjectId=null;

function actor(){const user=window.firebase?.auth?.()?.currentUser||null;return{id:user?.uid||'guest',name:user?.displayName||user?.email||'کاربر'};}
function esc(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
function refOf(item){return{kind:item.kind,id:item.id,workId:item.workId};}
function contactName(contact){return[contact?.type,contact?.firstName,contact?.lastName].filter(Boolean).join(' ').trim()||contact?.name||'';}
function formatDate(value){return toPersianDigits(String(value||'').replace(/^\d{4}\//,''));}
function formatMoment(value){return value?new Intl.DateTimeFormat('fa-IR-u-ca-persian',{timeZone:'Asia/Tehran',year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value)):'';}
function formatMoney(value){return`${new Intl.NumberFormat('fa-IR').format(Math.max(0,Number(value)||0))} تومان`;}
function reportsOf(entity){return(entity.executionReports||[]).filter(report=>report&&!report.trashed).slice().reverse();}
function commentsOf(entity){return(entity.executionComments||[]).filter(comment=>comment&&!comment.trashed).slice().sort((a,b)=>Number(b.createdAt)-Number(a.createdAt));}
function ownLatestReport(entity){const latest=reportsOf(entity)[0];return latest&&String(latest.createdBy?.id)===String(actor().id)?latest:null;}
function textArea(documentRef,value,name){const field=documentRef.createElement('textarea');field.className='wbs-input today-textarea';field.name=name;field.value=value||'';return field;}

function openReport(item,onChanged){
  const own=ownLatestReport(item.entity);
  openWbsSheet({title:own?'ویرایش گزارش خرید':'ثبت گزارش خرید',saveLabel:'ذخیره',body(root){
    root.appendChild(fieldRow('شرح گزارش',textArea(document,own?.description||'','reportDescription')));
    const note=document.createElement('div');note.className='today-upload-note';note.innerHTML='<span>پیوست‌ها</span><div><button type="button" disabled>عکس<small>به‌زودی</small></button><button type="button" disabled>ویدئو<small>به‌زودی</small></button><button type="button" disabled>فایل<small>به‌زودی</small></button></div>';root.appendChild(note);
  },onSave(root){const result=todayApi.saveReport(activeProjectId,refOf(item),root.querySelector('[name="reportDescription"]').value,actor());if(!result.ok){window.KarhaUI?.showToast?.(`شرح گزارش حداقل ${toPersianDigits(REPORT_MIN_LENGTH)} حرف باشد`);return false;}onChanged?.();return true;}});
}
function openReject(item,onChanged){openWbsSheet({title:'رد تأیید خرید',saveLabel:'ثبت رد',body(root){root.appendChild(fieldRow('علت رد',textArea(document,'','rejectionReason')));},onSave(root){const result=todayApi.reject(activeProjectId,refOf(item),root.querySelector('[name="rejectionReason"]').value,actor());if(!result.ok){window.KarhaUI?.showToast?.(`علت رد حداقل ${toPersianDigits(REJECTION_MIN_LENGTH)} حرف باشد`);return false;}activeMode='today';onChanged?.();return true;}});}
function renderReports(documentRef,entity){const host=documentRef.createElement('div');host.className='today-reports';reportsOf(entity).forEach(report=>{const row=documentRef.createElement('article');row.className='today-report';row.innerHTML=`<p>${esc(report.description)}</p><div>${esc(report.createdBy?.name||'کاربر')} · ${esc(formatMoment(report.createdAt))}${report.updatedAt?` · <b>ویرایش‌شده ${esc(formatMoment(report.updatedAt))}</b>`:''}</div>`;host.appendChild(row);});return host;}
function renderComments(documentRef,item,onChanged){
  const host=documentRef.createElement('div');host.className='today-comments';const comments=commentsOf(item.entity);let expanded=false;const list=documentRef.createElement('div');
  const paint=()=>{list.replaceChildren();(expanded?comments:comments.slice(0,2)).forEach(comment=>{const row=documentRef.createElement('div');row.className='today-comment'+(comment.type==='approval_rejected'?' is-rejection':'');row.innerHTML=`<p>${esc(comment.text)}</p><span>${esc(comment.createdBy?.name||'کاربر')} · ${esc(formatMoment(comment.createdAt))}</span>`;list.appendChild(row);});};paint();host.appendChild(list);
  if(comments.length>2){const more=documentRef.createElement('button');more.type='button';more.className='today-show-comments';more.textContent=`مشاهده ${toPersianDigits(comments.length-2)} نظر قبلی`;more.addEventListener('click',()=>{expanded=true;paint();more.remove();});host.appendChild(more);}
  const form=documentRef.createElement('form');form.className='today-comment-form';form.innerHTML=`<input class="wbs-input" name="comment" minlength="${COMMENT_MIN_LENGTH}" placeholder="افزودن نظر"><button type="submit">ثبت</button>`;form.addEventListener('submit',event=>{event.preventDefault();const result=todayApi.addComment(activeProjectId,refOf(item),form.elements.comment.value,actor());if(!result.ok){window.KarhaUI?.showToast?.(`نظر حداقل ${toPersianDigits(COMMENT_MIN_LENGTH)} حرف باشد`);return;}onChanged?.();});host.appendChild(form);return host;
}

function renderCard(documentRef,project,item,today,onChanged){
  const entity=item.entity;const assignee=(project.contacts||[]).find(contact=>String(contact.id)===String(entity.assigneeContactId||''));const contractor=contractorForItem(project,item).contact;const priority=PRIORITIES[entity.priority]||PRIORITIES.normal;
  const dateText=entity.scheduleStart&&entity.scheduleEnd?(entity.scheduleStart===entity.scheduleEnd?formatDate(entity.scheduleStart):`${formatDate(entity.scheduleStart)} ← ${formatDate(entity.scheduleEnd)}`):'بدون تاریخ';
  const card=documentRef.createElement('article');card.className='today-task-card shopping-item-card';card.dataset.entityId=item.id;card.dataset.entityKind=item.kind;
  card.innerHTML=`<div class="today-task-primary"><button type="button" class="today-complete" aria-label="ارسال خرید برای تأیید">${item.mode==='pending'?'✓':'□'}</button><span class="wbs-type-chip type-2">خرید</span><strong>${esc(entity.title||entity.text||'')}</strong></div><div class="today-task-meta"><span>${esc(item.path.join(' ← '))}</span>${contractor?`<span>پیمانکار: ${esc(contactName(contractor))}</span>`:''}</div><div class="today-task-meta"><span>${esc(dateText)}</span><span>${esc(remainingLabel(entity,today))}</span></div><div class="today-task-meta"><span>اهمیت: ${esc(priority)}</span><span>مبلغ: ${esc(formatMoney(item.amount))}</span></div><div class="today-task-meta"><span>${assignee?`مسئول: ${esc(contactName(assignee))}`:''}</span><span>وضعیت: ${esc(shoppingStatusLabel(entity))}</span></div>`;
  const actions=documentRef.createElement('div');actions.className='today-task-actions';
  if(item.mode==='pending'){const approve=documentRef.createElement('button');approve.type='button';approve.textContent='تأیید خرید';approve.addEventListener('click',()=>{todayApi.approve(activeProjectId,refOf(item),actor());onChanged?.();});const reject=documentRef.createElement('button');reject.type='button';reject.className='is-danger';reject.textContent='رد';reject.addEventListener('click',()=>openReject(item,onChanged));actions.append(approve,reject);}else card.querySelector('.today-complete').addEventListener('click',()=>{todayApi.markComplete(activeProjectId,refOf(item),actor());activeMode='pending';onChanged?.();});
  const report=documentRef.createElement('button');report.type='button';report.textContent=ownLatestReport(entity)?'ویرایش گزارش':'ثبت گزارش';report.addEventListener('click',()=>openReport(item,onChanged));actions.appendChild(report);card.append(actions,renderReports(documentRef,entity),renderComments(documentRef,item,onChanged));return card;
}

export function renderShoppingView(project,documentRef=document,onChanged){
  if(activeProjectId!==String(project?.id||'')){activeProjectId=String(project?.id||'');activeMode='today';}
  const today=tehranTodayJalali();const byMode=Object.fromEntries(SHOPPING_MODES.map(mode=>[mode,shoppingItemsForMode(project,mode,today)]));const available=byMode.unscheduled.length?SHOPPING_MODES:SHOPPING_MODES.filter(mode=>mode!=='unscheduled');if(!available.includes(activeMode))activeMode='today';
  const frame=documentRef.createElement('section');frame.className='wbs-view-frame wbs-shopping-frame is-shopping-view';frame.dataset.view='shopping';frame.dataset.mode=activeMode;if(project?.id)frame.dataset.projectId=String(project.id);
  const header=documentRef.createElement('div');header.className='wbs-view-header';const title=documentRef.createElement('div');title.className='wbs-view-title';title.textContent=LABELS[activeMode];const actions=documentRef.createElement('div');actions.className='wbs-view-actions today-mode-tabs';actions.setAttribute('role','tablist');
  available.forEach(mode=>{const button=documentRef.createElement('button');button.type='button';button.className='wbs-tree-mode-tab today-mode-tab'+(mode===activeMode?' active':'');button.dataset.mode=mode;button.setAttribute('role','tab');button.setAttribute('aria-selected',mode===activeMode?'true':'false');button.setAttribute('aria-label',LABELS[mode]);button.title=LABELS[mode];button.innerHTML=`<img src="${ICONS[mode]}" alt="">`;button.addEventListener('click',()=>{activeMode=mode;onChanged?.();});actions.appendChild(button);});
  const divider=documentRef.createElement('span');divider.className='wbs-view-action-separator';actions.appendChild(divider);const filter=documentRef.createElement('button');filter.type='button';filter.className='wbs-tree-mode-tab today-filter';filter.setAttribute('aria-label','فیلتر');filter.title='فیلتر';filter.innerHTML=`<img src="${ICONS.filter}" alt="">`;actions.appendChild(filter);
  const body=documentRef.createElement('div');body.className='wbs-view-body wbs-shopping-body';if(!byMode[activeMode].length)body.innerHTML='<div class="empty-state">خریدی در این بخش وجود ندارد.</div>';else byMode[activeMode].forEach(item=>body.appendChild(renderCard(documentRef,project,item,today,onChanged)));header.append(title,actions);frame.append(header,body);return frame;
}
