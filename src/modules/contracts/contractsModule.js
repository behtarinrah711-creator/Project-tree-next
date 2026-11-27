import {saveContractHandoff} from './contractHandoffApi.js';
import {closeWbsSheet} from '../wbs/wbsSheet.js';
import {renderInlineContractReject} from './contractReasonSheet.js';
import {hasPaidContractDocument} from '../../domain/contractRevision.js';
import {openContractDetails} from './contractDetailsView.js';
import {renderContractDocuments} from './contractDocumentsView.js';
import { canWriteProjectModule } from '../roleManagement/permissionState.js';
import { renderContractAddendaRow } from './contractAddendaView.js';
import {renderContractFinanceReview} from './contractFinanceReviewView.js';
import {openContractSignedUpload,renderContractSignedSection} from './contractSignedView.js';
import { contractProgressSteps, documentStageSelection, mountDocumentStageFooter, renderContractWorkflowPanel, renderContractProgressCircle } from './contractProgressView.js';
import { appendDocumentStageHistory, appendDocumentStageStatus, openContractHistory } from './contractHistoryView.js';
import { approvedContractContactIds,contractApproverIds,approvalLabels, contractApprovalState } from '../../domain/contractApproval.js';
import { currentExecutionActor } from '../wbs/executionActor.js';
import { fieldRow, openWbsSheet } from '../wbs/wbsSheet.js';
const contractListViews=new Map();
let closeContractFilter=null;
export const normalizeContractSearch=value=>String(value||'').toLocaleLowerCase('fa').replace(/ي/g,'ی').replace(/ك/g,'ک').replace(/[\u200c\s\-٬,]/g,'').replace(/[۰-۹]/g,c=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c))).replace(/[٠-٩]/g,c=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)));
import { openContractPreview } from './contractPreviewView.js';
import { contractActionsMenu } from './contractActionsMenu.js';
import { openContractExport } from './contractExportView.js';
import { openConfirm } from '../../ui/confirm.js';
import { projectContext } from '../../core/projectContext.js';
import { projectRepository } from '../../data/projectRepository.js';
import { contractApi } from '../../domain/contractApi.js';
import { contactApi } from '../../domain/contactApi.js';
import { findInTree } from '../../domain/wbs/normalize.js';
import { workPath } from '../../domain/wbs/workTaskContractSync.js';
import { activityApi } from '../../domain/activityApi.js';
import { contractDisplayTitle } from './contractTitle.js';

function resolveProjectId(explicit=null){
  return explicit || projectContext.getProjectId?.()
    || projectContext.getActiveProjectId?.() || null;
}
function project(id){
  return id ? projectRepository.getActiveProject(id) : null;
}
function list(p,key){
  return Array.isArray(p?.[key]) ? p[key].filter(x=>!x.trashed) : [];
}
function findActivity(projectId,id){return activityApi.lookup(projectId,id);}
function findContact(projectId,id){return contactApi.lookup(projectId,id);}
export function contractCreatedParts(value){
  const stamp=Number(value);
  if(!Number.isFinite(stamp)||stamp<=0) return null;
  try{
    const date=new Date(stamp);
    return {
      date:new Intl.DateTimeFormat('fa-IR-u-ca-persian',{year:'numeric',month:'2-digit',day:'2-digit'}).format(date),
      time:new Intl.DateTimeFormat('fa-IR',{hour:'2-digit',minute:'2-digit',hour12:false}).format(date),
    };
  }catch{return null;}
}
export function contractCreatedLabel(value){
  const created=contractCreatedParts(value);
  return created ? `${created.date} ${created.time}` : '';
}
function searchInput(placeholder,onInput){
  const wrap=document.createElement('div'); wrap.className='workspace-search';
  const input=document.createElement('input'); input.type='search'; input.className='workspace-search-input';
  input.placeholder=placeholder; input.autocomplete='off';
  input.addEventListener('input',()=>onInput(String(input.value||'').trim().toLocaleLowerCase('fa')));
  wrap.appendChild(input); return {wrap,input};
}
function legacy(name,...args){
  if(typeof window[name]==='function'){ window[name](...args); return true; }
  if(typeof window.KarhaLegacy?.[name]==='function'){window.KarhaLegacy[name](...args); return true;}
  return false;
}
function softDeleteTemplate(projectId,id){return contractApi.trashTemplate(projectId,id).ok;}
export function contractProjectPath(project, contract){
  const { projectItemId, workTaskId } = contract;
  const item = projectItemId ? findInTree(project.tasks, projectItemId)?.item : null;
  const task = workTaskId && item?.workTasks?.find(row => row && !row.trashed && String(row.id) === String(workTaskId));
  if(item && !item.trashed && (!workTaskId || task?.title)){
    return [workPath(project, projectItemId).replaceAll(' / ', ' ← '), task?.title].filter(Boolean).join(' ← ');
  }
  return String(contract.projectItemPath || contract.accountingPackage?.contract?.projectItemPath || '').replaceAll(' / ', ' ← ');
}

export function contractRowData(projectId,c){
  const a=findActivity(projectId,c.activityId);
  const contact=findContact(projectId,c.contractorId||c.contactId);
  const person=contact ? ([contact.firstName,contact.lastName].filter(Boolean).join(' ')||contact.name) : c.contractorName || 'بدون پیمانکار';
  const title=[c.title || 'قرارداد پیمانکاری',person].filter(Boolean).join(' ');
  const activity=a?.name || a?.title || 'بدون فعالیت';
  const number=c.contractNo || 'بدون شماره قرارداد';
  const meta=[number,activity].join(' · ');
  return {title,meta,number,created:contractCreatedParts(c.createdAt)};
}

// Google Material Symbols Rounded, Apache-2.0: google/material-design-icons.
const contractToolbarIcons={receipt:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',"visibility":"<svg xmlns=\"http://www.w3.org/2000/svg\" height=\"24\" viewBox=\"0 -960 960 960\" width=\"24\"><path d=\"M480-320q75 0 127.5-52.5T660-500q0-75-52.5-127.5T480-680q-75 0-127.5 52.5T300-500q0 75 52.5 127.5T480-320Zm0-72q-45 0-76.5-31.5T372-500q0-45 31.5-76.5T480-608q45 0 76.5 31.5T588-500q0 45-31.5 76.5T480-392Zm0 192q-134 0-244.5-72T61-462q-5-9-7.5-18.5T51-500q0-10 2.5-19.5T61-538q64-118 174.5-190T480-800q134 0 244.5 72T899-538q5 9 7.5 18.5T909-500q0 10-2.5 19.5T899-462q-64 118-174.5 190T480-200Zm0-300Zm0 220q113 0 207.5-59.5T832-500q-50-101-144.5-160.5T480-720q-113 0-207.5 59.5T128-500q50 101 144.5 160.5T480-280Z\"/></svg>","history":"<svg xmlns=\"http://www.w3.org/2000/svg\" height=\"24\" viewBox=\"0 -960 960 960\" width=\"24\"><path d=\"M480-120q-126 0-223-76.5T131-392q-4-15 6-27.5t27-14.5q16-2 29 6t18 24q24 90 99 147t170 57q117 0 198.5-81.5T760-480q0-117-81.5-198.5T480-760q-69 0-129 32t-101 88h70q17 0 28.5 11.5T360-600q0 17-11.5 28.5T320-560H160q-17 0-28.5-11.5T120-600v-160q0-17 11.5-28.5T160-800q17 0 28.5 11.5T200-760v54q51-64 124.5-99T480-840q75 0 140.5 28.5t114 77q48.5 48.5 77 114T840-480q0 75-28.5 140.5t-77 114q-48.5 48.5-114 77T480-120Zm40-376 100 100q11 11 11 28t-11 28q-11 11-28 11t-28-11L452-452q-6-6-9-13.5t-3-15.5v-159q0-17 11.5-28.5T480-680q17 0 28.5 11.5T520-640v144Z\"/></svg>","edit_square":"<svg xmlns=\"http://www.w3.org/2000/svg\" height=\"24\" viewBox=\"0 -960 960 960\" width=\"24\"><path d=\"M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h261q20 0 30 12.5t10 27.5q0 15-10.5 27.5T460-760H200v560h560v-261q0-20 12.5-30t27.5-10q15 0 27.5 10t12.5 30v261q0 33-23.5 56.5T760-120H200Zm280-360Zm-120 80v-97q0-16 6-30.5t17-25.5l344-344q12-12 27-18t30-6q16 0 30.5 6t26.5 18l56 57q11 12 17 26.5t6 29.5q0 15-5.5 29.5T897-728L553-384q-11 11-25.5 17.5T497-360h-97q-17 0-28.5-11.5T360-400Zm481-384-56-56 56 56ZM440-440h56l232-232-28-28-29-28-231 231v57Zm260-260-29-28 29 28 28 28-28-28Z\"/></svg>"};

export function renderContractCardHeading(project, contract, menu, {titlePrefix="",onPreview,onDocumentPreview,onSummary,onHistory,progress}={}){
  const {title,number,created}=contractRowData(project.id,contract);
  const path=contractProjectPath(project,contract).split('←').map(part=>part.trim()).filter(Boolean).slice(0,-1).join(' ← ');
  const displayTitle=contractDisplayTitle(project, contract);
  const heading=document.createElement('div');
  heading.className='contract-card-heading';
  const main=document.createElement('div'); main.className='contract-main';
  const t=document.createElement('div'); t.className='contract-title'; t.textContent=titlePrefix ? titlePrefix+' '+displayTitle : displayTitle;
  const numberRow=document.createElement('div');numberRow.className='contract-meta contract-number';numberRow.dir='ltr';numberRow.textContent=number;
  main.append(t,numberRow);
  const pathRow=path ? document.createElement('div') : null;
  if(pathRow){
    pathRow.className='contract-meta contract-project-path';pathRow.dir='rtl';pathRow.textContent=path;
  }
  const actions=document.createElement('div'); actions.className='contract-actions';

  const visibleActions=document.createElement('div');visibleActions.className='contract-card-visible-actions';
  const strip=document.createElement('div');strip.className='contract-action-strip';
  visibleActions.appendChild(strip);
  for(const [label,handler,iconName] of [['پیش‌نمایش',onDocumentPreview||onPreview,'visibility'],['خلاصه مالی',onSummary,'receipt'],['تاریخچه',onHistory,'history'],['ویرایش',menu?.onEdit,'edit_square']]){
    if(!handler)continue;
    const button=document.createElement('button');button.type='button';button.className='contract-review-action';button.textContent=label;
    const icon=document.createElement('span');icon.className='contract-tool-icon';icon.setAttribute('aria-hidden','true');icon.innerHTML=contractToolbarIcons[iconName];button.appendChild(icon);
    button.onclick=event=>{event.stopPropagation();handler(button);};strip.append(button);
  }

  if(menu?.onDelete || menu?.onExport)visibleActions.appendChild(contractActionsMenu({onDelete:menu.onDelete,onExport:menu.onExport}));

  if(onPreview){
    heading.onclick=()=>onPreview(main);
    actions.onclick=event=>event.stopPropagation();
    main.tabIndex=0;
    main.setAttribute('role','button');
    main.onkeydown=event=>{
      if(event.target && event.target!==main)return;
      if(event.key!=='Enter' && event.key!==' ')return;
      event.preventDefault();
      onPreview(main);
    };
  }
  if(progress){
    const details=document.createElement('div');details.className='contract-heading-details';
    if(pathRow)details.appendChild(pathRow);
    if(created){
      const stamp=document.createElement('div');stamp.className='contract-meta contract-heading-stamp';
      stamp.dir='rtl';
      for(const value of [created.time,'|',created.date]){
        const part=document.createElement('bdi');
        part.dir='ltr';
        part.textContent=value;
        stamp.appendChild(part);
      }
      details.appendChild(stamp);
    }
    heading.append(main,progress,details,actions,visibleActions);
    return heading;
  }
  if(pathRow)main.appendChild(pathRow);
  if(created){
    const createdBox=document.createElement('div'); createdBox.className='contract-created';
    const date=document.createElement('div'); date.className='contract-created-date'; date.textContent=created.date;
    const time=document.createElement('div'); time.className='contract-created-time'; time.textContent=created.time;
    createdBox.append(date,time);
    heading.append(main,createdBox,actions,visibleActions);
  }else{
    heading.append(main,actions,visibleActions);
  }
  return heading;
}

export function renderContractStatusRow(c,{showBadge=true}={}){
  const statusRow=document.createElement('div');statusRow.className='contract-workflow-row';
  statusRow.onclick=event=>event.stopPropagation();
  if(!showBadge)return statusRow;
  const status=document.createElement('span');
  const state=contractApprovalState(c);
  const awaitingSubmission=state==='ready' && c.parentContractId && c.contractApproverContactIds?.some(Boolean);
  const approvalState=awaitingSubmission?'pending':state;
  const rejectedByFinance=c.parentContractId && c.accountingStatus==='rejected';
  const pendingFinance=c.parentContractId && c.accountingStatus==='sent';
  const statusLabel=rejectedByFinance?'توسط مالی رد شد':pendingFinance?'ارسال شده به مالی':c.accountingStatus==='accepted'?'تأیید شده توسط بخش مالی':approvalState==='incomplete'?'ناقص':approvalState==='approved'?'تأیید شده است':['ready','unapproved','returned'].includes(approvalState)?'تأیید نشده است':approvalLabels[approvalState];
  status.className='contract-status-badge '+(rejectedByFinance?'is-unapproved':pendingFinance?'is-incomplete':approvalState==='approved'?'is-approved':['ready','unapproved','returned'].includes(approvalState)?'is-unapproved':'is-incomplete');
  status.textContent='وضعیت: '+statusLabel;statusRow.appendChild(status);
  if(!rejectedByFinance && c.approvalStatus==='pending' && c.approvalContactIds?.length)status.textContent+=' ('+new Intl.NumberFormat('fa-IR').format(c.approvedContactIds?.length || 0)+' از '+new Intl.NumberFormat('fa-IR').format(c.approvalContactIds.length)+')';
  return statusRow;
}

export function renderContractReviewRow(contract,{action,reject,edit,onEdited,onRejected,viewer,viewerContactName=()=>null,showBadge=true}){
  const row=renderContractStatusRow(contract,{showBadge});
  if(viewer?.contactId && showBadge && approvedContractContactIds(contract).includes(String(viewer.contactId))){
    const badge=row.children[0];badge.className='contract-status-badge is-approved';
    const total=contractApproverIds(contract).length,approved=approvedContractContactIds(contract).length;
    badge.textContent='شما این قرارداد را تأیید کردید';
    if(total>1){
      const pending=contractApproverIds(contract).filter(id=>!approvedContractContactIds(contract).includes(id));
      const names=pending.map(id=>viewerContactName(id)).filter(Boolean);
      const detail=document.createElement('small');detail.className='contract-review-count';
      detail.textContent=[approved,total].map(n=>n.toLocaleString('fa-IR')).join(' از ')+' تأیید · '+(pending.length?'در انتظار تأیید '+(names.join('، ')||'سایر مسئولان'):'تأییدها تکمیل شد');
      badge.appendChild(detail);
    }
  }
  if(contract.parentContractId)row.className='contract-addendum-toolbar';
  if(action)row.appendChild(action);
  if(edit && onEdited){
    const button=document.createElement('button');
    button.type='button';button.className='contract-review-action';button.textContent='ویرایش';
    button.onclick=()=>{
      const history=window.KarhaChildHistory;
      const key='contract-status:'+contract.id;
      if(history?.isOpen?.(key) && history.afterNextPop){
        history.afterNextPop(()=>edit(onEdited));
        closeWbsSheet();
      }else{
        closeWbsSheet();
        edit(onEdited);
      }
    };
    row.appendChild(button);
  }
  if(reject && onRejected)row.appendChild(renderInlineContractReject(reject,onRejected));
  if(contract.approvalStatus==='unapproved' && contract.approvalRejectionReason){
    const reason=document.createElement('div');
    reason.className='contract-rejection-reason';
    reason.textContent=contract.approvalRejectionReason;
    row.appendChild(reason);
  }
  return row;
}

export function renderContractCard(p,c,{onChanged=()=>{},finance=false,approval,approvalDocuments,openStatusSheet=openWbsSheet,openSignedSheet=openContractSignedUpload,showDetails=false}={}){
  const preview=trigger=>openContractPreview(p,c,{trigger});
  const id=p.id,actor=currentExecutionActor(p);
  const writable=!finance && canWriteProjectModule(id,'contracts');
      const {title,meta,created}=contractRowData(id,c);
      const path=contractProjectPath(p,c);
      const row=document.createElement('article'); row.className='contract-row';
      row.dataset.searchText=normalizeContractSearch(title+' '+meta+' '+path+' '+(created ? `${created.date} ${created.time}` : ''));
      row.dataset.approvalState=contractApprovalState(c);
      const openPreview=()=>openContractPreview(p,finance?(c.accountingPackage?.contract||c):c,{trigger:heading.querySelector('.contract-main'),frozen:finance,signedFiles:finance?c.accountingPackage?.signedFiles:null});
      let statusSheetBody;
      let statusRecord=c;
      const openStatus=(event,step)=>{
        event?.stopPropagation();
        const selection=documentStageSelection(statusRecord,p,step);
        if(!selection)return;
        if(!step && !selection.current && !finance)return;
        const {selected}=selection;
        if(selected.id==='signed')return openSignedSheet(p,statusRecord,{onChanged,finance:finance||!!approval});
        openStatusSheet({title:selected.label,showSave:false,reuseHistoryOnReplace:true,historyKey:'contract-status:'+c.id,
          body(root){
            root.classList.add('contract-status-sheet','contract-history-sheet','contract-advance-stage-sheet');
            const note=(status,person)=>appendDocumentStageStatus(root,status,person);
            const actions={created:['create'],completed:['complete','submit','reject','reject_finance'],approved:['approve','revoke','edit_review'],finance:['send_finance','withdraw_finance'],'finance-approved':['approve_finance','reject_finance','revoke_finance']};
            const history=selected.done && appendDocumentStageHistory(root,statusRecord,{actions:actions[selected.id]||[]});
            if(selected.done && !history){
              note(({created:'قرارداد ایجاد شد',completed:'تکمیل قرارداد اعلام شد',approved:'تأییدها تکمیل شد',finance:'قرارداد به بخش مالی ارسال شد','finance-approved':'بخش مالی قرارداد را تأیید کرد'})[selected.id]);
            }
            if(selected.id==='approved'){
              const ids=contractApproverIds(statusRecord),done=approvedContractContactIds(statusRecord);
              for(const id of ids){
                const person=(p.contacts||[]).find(c=>String(c.id)===id);
                const name=person?.name || [person?.firstName,person?.lastName].filter(Boolean).join(' ') || 'مسئول تأیید';
                note(done.includes(id)?'تأیید کرد':'در انتظار تأیید',name);
              }
            }
            if(!selected.done || (selected.id==='finance' && !finance && !approval) || (selected.id==='finance-approved' && finance))statusSheetBody(root,selected);
            mountDocumentStageFooter(root);
          }});
      };
      const heading=renderContractCardHeading(p,c,{
        onEdit:approval || !writable?undefined:()=>{
          if(hasPaidContractDocument(p,c)){
            const access=window.KarhaSaosaWorkspaceAccess?.[id];
            if(access?.role!=='owner' && access?.isOwner!==true)return window.KarhaLegacy?.showToast?.('اصلاح قرارداد پرداخت‌شده فقط برای مالک پروژه در دسترس است');
            let name,reason,busy=false;
            openWbsSheet({title:'اصلاح اطلاعات قرارداد پرداخت‌شده',saveLabel:'ثبت اصلاح',autoFocus:false,
              body(root){
                name=document.createElement('input');
                name.className='wbs-input';name.value=c.title||'';
                reason=document.createElement('textarea');
                reason.className='wbs-input';
                root.append(fieldRow('عنوان قرارداد',name),fieldRow('دلیل اصلاح',reason));
              },
              onSave(){
                if(busy)return false;
                busy=true;
                saveContractHandoff(id,c,'correct_paid_contract',{title:name.value,reason:reason.value})
                  .then(()=>{if(name.isConnected)closeWbsSheet();onChanged();})
                  .catch(error=>window.KarhaLegacy?.showToast?.(error.message))
                  .finally(()=>{busy=false;});
                return false;
              },
            });
            return;
          }
          const edit=()=>legacy('openContractForm',c.id);
          if(contractApprovalState(c)==='incomplete')return edit();
          openConfirm('با ویرایش کردن قرارداد به مرحله نخست باز می‌گردید. ادامه می‌دهید؟',edit,'بله',{cancelLabel:'خیر'});
        },
        onExport:trigger=>openContractExport(p,finance?(c.accountingPackage?.contract||c):c,{trigger,frozen:finance}),
        onDelete:approval || !writable?undefined:()=>openConfirm('آیا می‌خواهید این قرارداد را حذف کنید؟',()=>{
          const result=contractApi.trash(id,c.id);
          if(!result.ok){
            if(result.code==='in_use')window.KarhaLegacy?.showRecordDeleteBlocked?.('contract',result.refs);
            else window.KarhaLegacy?.showToast?.(result.message||'حذف قرارداد انجام نشد');
            return;
          }
          onChanged();
          window.KarhaLegacy?.showToast?.(title+(c.contractNo?' به شماره '+c.contractNo:'')+' حذف شد.');
        },'بله',{cancelLabel:'خیر'}),
      },{onPreview:showDetails && !finance && !approval ? trigger=>openContractDetails(p,c,trigger) : approval?preview:openPreview,onDocumentPreview:openPreview,onSummary:trigger=>openContractDetails(p,c,trigger,{showDocuments:showDetails && !finance && !approval}),onHistory:()=>openContractHistory(statusRecord,{finance,openSheet:openStatusSheet}),progress:renderContractProgressCircle(document,c,p,openStatus)});
      row.appendChild(heading);
      row.append(renderContractWorkflowPanel(document,c,p,{onOpen:openStatus,openCompleted:true}));
      const events=c.approvalHistory||[];
      const cycle=events.slice(events.findLastIndex(e=>['submit','reject','edit_contract','withdraw_submission','cancel_completion'].includes(e.action))+1);
      const edited=cycle.findLastIndex(e=>e.action==='edit_review');
      if(edited>=0 && cycle.slice(edited+1).some(e=>e.action==='approve' && e.actor?.id===cycle[edited].actor?.id)){
        const label=document.createElement('p');label.className='contract-review-notice';label.textContent='قرارداد توسط مسئول تأیید ویرایش و سپس تأیید شد';row.append(label);
      }
      if(approval){
        const reviewAction=approval.action && !approval.action.disabled && document.createElement('button');
        if(reviewAction){reviewAction.type='button';reviewAction.className='contract-review-action';reviewAction.textContent=approval.action.textContent;reviewAction.onclick=event=>{event.stopPropagation();approval.action.click();};}
        row.append(renderContractReviewRow(c,{...approval,viewer:actor,viewerContactName:id=>{
          const person=(p.contacts||[]).find(contact=>String(contact.id)===id);
          return person?.name || [person?.firstName,person?.lastName].filter(Boolean).join(' ');
        },action:reviewAction,onEdited:onChanged,onRejected:onChanged}));
        row.appendChild(renderContractDocuments(p,c,{reviewOnly:true,approvals:approvalDocuments}));
        statusSheetBody=(root,step)=>{
          if(step.id!=='approved')return;
          root.append(renderContractReviewRow(statusRecord,{
            ...(statusRecord===c?approval:approval.refresh?.(statusRecord)||{}),showBadge:false,
            onEdited(record){statusRecord=record;openStatus();},
            onRejected(record){statusRecord=record;openStatus();},
          }));
        };
        return row;
      }
      if(!finance){
      statusSheetBody=(root,step)=>{
        const record=statusRecord;
        if(step.id==='completed'){
          if(writable){
            const edit=document.createElement('button');edit.type='button';edit.className='contract-review-action';edit.textContent='ویرایش و تکمیل قرارداد';
            edit.onclick=()=>legacy('openContractForm',record.id);root.append(edit);
          }
          return;
        }
        if(step.id==='approved'){
          if(writable && record.submittedBy?.id===actor.id){
            const withdraw=document.createElement('button');withdraw.type='button';withdraw.className='contract-review-action danger';withdraw.textContent='پس‌گرفتن از تأیید';
            withdraw.onclick=()=>openWbsSheet({title:'پس‌گرفتن از تأیید',saveLabel:'ثبت برگشت',historyKey:'contract-cancel-completion:'+record.id,
              body(body){const reason=document.createElement('textarea');reason.className='wbs-input today-textarea';reason.name='completionReason';body.append(fieldRow('علت برگشت (الزامی)',reason));},
              onSave:body=>{const result=contractApi.review(id,record.id,'withdraw_submission',actor,{reason:body.querySelector('[name="completionReason"]').value});if(!result.ok){window.KarhaLegacy?.showToast?.(result.message);return false;}onChanged();return true;},
            });root.append(withdraw);
          }
          return;
        }
        if(step.id==='finance-approved'){const note=document.createElement('p');note.textContent='در انتظار بررسی بخش مالی';root.append(note);return;}
        if(['signed','finance'].includes(step.id)){
          const signed=renderContractSignedSection(p,record,{stage:step.id,onChanged,onReturn:()=>{statusRecord=contractApi.get(id,record.id)||record;openStatus();}});
          if(signed)root.append(signed);
        }
      };
      const documents=renderContractDocuments(p,c,{onChanged});
      if(documents)row.appendChild(documents);
      }else{
        row.appendChild(renderContractDocuments(p,c,{finance:true,onChanged}));
        statusSheetBody=(root,step)=>{
          if(step.id==='finance-approved' && c.accountingPackage)root.append(renderContractFinanceReview(p,c,{onChanged}));
        };
      }
      return row;
}

export const contractsModule={
  id:'contracts', title:'قراردادها', route:'contracts',
  mount({projectId: explicitProjectId}={}){this.render(explicitProjectId);return {projectId:explicitProjectId || resolveProjectId(),moduleId:'contracts'};},
  render(explicitProjectId=null){
    const id=resolveProjectId(explicitProjectId),p=project(id),body=document.getElementById('contractsPageBody');
    if(!body)return;
    const add=document.getElementById('contractAddBtn');
    if(add){
      add.hidden=!!p && !canWriteProjectModule(id,'contracts');
      add.onclick=add.hidden?null:()=>legacy('openContractForm',null);
    }
    closeContractFilter?.();closeContractFilter=null;
    body.innerHTML='';
    if(!p){body.innerHTML='<div class="contract-empty">ابتدا یک پروژه را انتخاب کنید.</div>';return;}
    const listWrap=document.createElement('div'); listWrap.className='contract-list';
    const head=document.createElement('div'); head.className='contract-list-head';
    const contracts=[];let cursor=0;
    do{const page=contractApi.listPage(id,{cursor,limit:200});contracts.push(...page.items);cursor=page.cursor;}while(cursor!=null);
    const statusOptions=Object.entries(approvalLabels);
    const view=contractListViews.get(id)||{query:'',statuses:statusOptions.map(([value])=>value)};contractListViews.set(id,view);
    head.innerHTML=`<span class="title">قراردادهای واقعی پیمانکاران</span><span class="mgmt-count">${new Intl.NumberFormat('fa-IR').format(contracts.length)}</span>`;body.append(head);
    const renderedRows=[];
    const empty=document.createElement('div');empty.className='contract-empty';empty.textContent='قراردادی با این جست‌وجو و وضعیت یافت نشد.';
    const applyFilters=()=>{
      const matching=renderedRows.filter(row=>
        row.dataset.searchText.includes(normalizeContractSearch(view.query)) &&
        view.statuses.includes(row.dataset.approvalState));
      listWrap.replaceChildren(...matching);
      empty.remove();
      if(!matching.length && contracts.length)body.appendChild(empty);
    };
    const search=searchInput('جستجوی شماره قرارداد، پیمانکار یا فعالیت…',q=>{view.query=q;applyFilters();});
    search.input.value=view.query;search.input.setAttribute('aria-label','جستجوی قرارداد');body.append(search.wrap);
    const filterWrap=document.createElement('div');filterWrap.className='contract-filter-wrap';
    const filter=document.createElement('button');filter.type='button';filter.className='contract-status-filter';
    filter.setAttribute('aria-expanded','false');filter.setAttribute('aria-controls','contractStatusMenu');
    let menu=null,dismiss=null;
    const closeFilter=(fromPop=false)=>{
      if(!menu)return;
      menu.remove();dismiss.remove();menu=null;dismiss=null;filter.setAttribute('aria-expanded','false');
      window.KarhaChildHistory?.consume?.('contract-status-filter',{fromPopState:fromPop});
    };
    closeContractFilter=closeFilter;
    const filterLabel=()=>{
      filter.textContent='وضعیت: '+(view.statuses.length===statusOptions.length?'همه':view.statuses.length?new Intl.NumberFormat('fa-IR').format(view.statuses.length)+' انتخاب':'هیچ‌کدام');
    };
    filter.onclick=()=>{
      if(menu){closeFilter();return;}
      dismiss=document.createElement('button');dismiss.type='button';dismiss.className='contract-filter-dismiss';dismiss.setAttribute('aria-label','بستن فیلتر وضعیت');dismiss.onclick=()=>closeFilter();
      menu=document.createElement('div');menu.id='contractStatusMenu';menu.className='wbs-gantt-header-menu is-open contract-status-menu';
      menu.setAttribute('role','group');menu.setAttribute('aria-label','نمایش وضعیت قرارداد');
      const title=document.createElement('div');title.className='wbs-gantt-menu-title';title.textContent='نمایش وضعیت قرارداد';menu.appendChild(title);
      statusOptions.forEach(([value,text])=>{
        const label=document.createElement('label');label.className='wbs-gantt-menu-row';
        const check=document.createElement('input');check.type='checkbox';check.value=value;check.checked=view.statuses.includes(value);
        const name=document.createElement('span');name.textContent=text;
        check.onchange=()=>{
          view.statuses=check.checked?[...new Set([...view.statuses,value])]:view.statuses.filter(x=>x!==value);
          filterLabel();applyFilters();
        };
        label.append(check,name);menu.appendChild(label);
      });
      filterWrap.append(dismiss,menu);filter.setAttribute('aria-expanded','true');
      window.KarhaChildHistory?.register?.('contract-status-filter',{onPop:()=>closeFilter(true)});
      window.KarhaChildHistory?.open?.('contract-status-filter');
    };
    filterWrap.onkeydown=event=>{if(event.key==='Escape'){closeFilter();filter.focus?.();}};
    filterWrap.appendChild(filter);filterLabel();body.append(filterWrap,listWrap);
    if(!contracts.length){const e=document.createElement('div');e.className='contract-empty';e.innerHTML='قراردادی برای نمایش در این فهرست وجود ندارد.<br>از علامت + یک قرارداد ایجاد کنید.';body.appendChild(e);return;}
    const appendContract=c=>renderedRows.push(renderContractCard(p,c,{showDetails:true,onChanged:()=>this.render(id)}));
    contracts.forEach(appendContract);
    applyFilters();
  },
  renderTemplates(explicitProjectId=null){
    const id=resolveProjectId(explicitProjectId),p=project(id),body=document.getElementById('contractTemplatesPageBody'); if(!body)return; body.innerHTML='';
    if(!p){body.innerHTML='<div class="contract-empty">ابتدا یک پروژه را انتخاب کنید.</div>';return;}
    const writable=canWriteProjectModule(id,'contracts');
    const add=document.getElementById('contractTemplateAddBtn');
    if(add)add.hidden=!writable;
    const templates=list(p,'contractTemplates'),head=document.createElement('div');head.className='contract-list-head';head.innerHTML=`<span class="title">قالب‌های قرارداد این پروژه</span><span class="mgmt-count">${new Intl.NumberFormat('fa-IR').format(templates.length)}</span>`;body.appendChild(head);
    if(!templates.length){const e=document.createElement('div');e.className='contract-empty';e.textContent='هنوز قالب قراردادی ثبت نشده است.';body.appendChild(e);return;}
    const listWrap=document.createElement('div');listWrap.className='contract-template-list';const rows=[];const search=searchInput('جستجوی قالب قرارداد…',q=>{const matches=rows.filter(row=>row.dataset.searchText.includes(normalizeContractSearch(q)));listWrap.replaceChildren(...matches);if(!matches.length){const empty=document.createElement('div');empty.className='contract-empty';empty.textContent='قالب قراردادی با این جست‌وجو یافت نشد.';listWrap.appendChild(empty);}});body.append(search.wrap,listWrap);
    templates.forEach(t=>{const title=t.title||'قرارداد',meta=[new Intl.NumberFormat('fa-IR').format(Array.isArray(t.items)?t.items.length:0)+' ماده اصلی',t.isDraft||t.status==='draft'?'پیش‌نویس':''].filter(Boolean).join(' · ');const row=document.createElement('div');row.className='contract-template-row';row.dataset.searchText=normalizeContractSearch(title+' '+meta);const main=document.createElement('div');main.className='contract-template-main';const tt=document.createElement('div');tt.className='contract-template-title';tt.textContent=title;const mm=document.createElement('div');mm.className='contract-template-meta';mm.textContent=meta;main.append(tt,mm);const actions=document.createElement('div');actions.className='contract-template-actions';const del=document.createElement('button');del.type='button';del.className='contract-template-action danger';del.title='حذف';del.textContent='×';del.onclick=e=>{e.preventDefault();e.stopPropagation();openConfirm('آیا می‌خواهید این قالب قرارداد را حذف کنید؟',()=>{if(softDeleteTemplate(id,t.id)){this.renderTemplates(id);window.KarhaLegacy?.showToast?.('قالب '+title+' حذف شد.');}},'بله',{cancelLabel:'خیر'});};actions.appendChild(del);row.append(main);if(writable)row.append(actions);row.onclick=()=>writable?legacy('openContractTemplateForm',t.id):openContractPreview(p,t,{trigger:row,frozen:true});rows.push(row);listWrap.appendChild(row);});
  }
};

export default contractsModule;


