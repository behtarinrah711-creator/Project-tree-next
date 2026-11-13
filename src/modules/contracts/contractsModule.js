import {openContractDetails} from './contractDetailsView.js';
import {renderContractDocuments} from './contractDocumentsView.js';
import { canWriteProjectModule } from '../roleManagement/permissionState.js';
import { renderContractAddendaRow } from './contractAddendaView.js';
import {renderContractFinanceReview} from './contractFinanceReviewView.js';
import {renderContractSignedSection} from './contractSignedView.js';
import { renderContractProgress, renderContractProgressCircle } from './contractProgressView.js';
import { renderContractHistory } from './contractHistoryView.js';
import { approvalLabels, contractApprovalState, contractApproverIds, canCancelContractCompletion } from '../../domain/contractApproval.js';
import { isContractSigned } from '../../domain/contractHandoff.js';
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

export function renderContractCardHeading(project, contract, menu, {titlePrefix="",onPreview,progress}={}){
  const {title,number,created}=contractRowData(project.id,contract);
  const path=contractProjectPath(project,contract);
  const heading=document.createElement('div');
  heading.className='contract-card-heading';
  const main=document.createElement('div'); main.className='contract-main';
  const t=document.createElement('div'); t.className='contract-title'; t.textContent=titlePrefix ? titlePrefix+' '+title : title;
  const numberRow=document.createElement('div');numberRow.className='contract-meta contract-number';numberRow.dir='ltr';numberRow.textContent=number;
  main.append(t,numberRow);
  const pathRow=path ? document.createElement('div') : null;
  if(pathRow){
    pathRow.className='contract-meta contract-project-path';pathRow.dir='rtl';pathRow.textContent=path;
  }
  const actions=document.createElement('div'); actions.className='contract-actions';
  if(menu!==null)actions.appendChild(contractActionsMenu(menu));
  if(onPreview){
    heading.onclick=()=>onPreview(main);
    actions.onclick=event=>event.stopPropagation();
    main.tabIndex=0;
    main.setAttribute('role','button');
    main.onkeydown=event=>{
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
    heading.append(main,progress,details,actions);
    return heading;
  }
  if(pathRow)main.appendChild(pathRow);
  if(created){
    const createdBox=document.createElement('div'); createdBox.className='contract-created';
    const date=document.createElement('div'); date.className='contract-created-date'; date.textContent=created.date;
    const time=document.createElement('div'); time.className='contract-created-time'; time.textContent=created.time;
    createdBox.append(date,time);
    heading.append(main,createdBox,actions);
  }else{
    heading.append(main,actions);
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

function renderContractWorkflowRow(contract){
  const state=contractApprovalState(contract);
  if(contract.accountingStatus==='rejected' || contract.approvalRejectionReason
    || ['unapproved','returned'].includes(contract.approvalStatus) || state==='ready'){
    return renderContractStatusRow(contract);
  }

  const reviewed=contractApproverIds(contract).length>0 ||
    (!Array.isArray(contract.approvalContactIds) && contract.contractApproverContactIds?.some(Boolean));
  const completion=reviewed?'تکمیل، تایید، امضا، بارگذاری و ثبت مالی شد':'تکمیل، امضا، بارگذاری و ثبت مالی شد';
  const signed=reviewed?'تکمیل، تایید، امضا و بارگذاری شد':'تکمیل، امضا و بارگذاری شد';
  let label,nextStep,tone='is-incomplete';
  if(contract.accountingStatus==='accepted'){
    label=completion;
    tone='is-approved';
  }else if(contract.accountingStatus==='sent'){
    label='در انتظار تایید بخش مالی';
    nextStep='صبور باشید';
  }else if(state==='pending'){
    label='تکمیل و برای مسئول تایید ارسال شد';
    nextStep='صبور باشید';
  }else if(state==='approved'){
    tone='is-approved';
    if(isContractSigned(contract)){
      label=signed;
      nextStep='ارسال به بخش مالی';
    }else{
      label=reviewed?'تکمیل و تایید شد':'تکمیل شد';
      nextStep='نسخه امضا شده قرارداد را بارگذاری کنید';
    }
  }else{
    label='ناقص';
    nextStep='قرارداد را ویرایش و تکمیل کنید';
  }

  const row=renderContractStatusRow(contract,{showBadge:false});
  row.dataset.contractWorkflow='';
  const badge=document.createElement('span');
  badge.className='contract-status-badge '+(nextStep?'is-incomplete':tone);
  badge.textContent='وضعیت: '+label+(nextStep?' | گام بعد: '+nextStep:'');
  row.appendChild(badge);
  return row;
}

export function renderContractReviewRow(contract,{action,preview}){
  const row=renderContractStatusRow(contract);
  if(contract.parentContractId)row.className='contract-addendum-toolbar';
  const view=document.createElement('button');
  view.type='button';view.className='contract-review-action';view.textContent='مشاهده سند';
  view.onclick=event=>{event.stopPropagation();preview(view);};
  row.appendChild(view);
  if(action)row.appendChild(action);
  return row;
}

export function renderContractCard(p,c,{onChanged=()=>{},finance=false,approval,openStatusSheet=openWbsSheet,showDetails=false}={}){
  const preview=trigger=>openContractPreview(p,c,{trigger});
  const id=p.id,actor=currentExecutionActor(p);
  const writable=!finance && canWriteProjectModule(id,'contracts');
      const {title,meta,created}=contractRowData(id,c);
      const path=contractProjectPath(p,c);
      const row=document.createElement('article'); row.className='contract-row';
      row.dataset.searchText=normalizeContractSearch(title+' '+meta+' '+path+' '+(created ? `${created.date} ${created.time}` : ''));
      row.dataset.approvalState=contractApprovalState(c);
      const openPreview=()=>openContractPreview(p,finance?c.accountingPackage.contract:c,{trigger:heading.querySelector('.contract-main'),frozen:finance,signedFiles:finance?c.accountingPackage.signedFiles:null});
      let statusSheetBody;
      const openStatus=event=>{
        event.stopPropagation();
        openStatusSheet({title:'وضعیت قرارداد',showSave:false,reuseHistoryOnReplace:true,historyKey:'contract-status:'+c.id,
          body(root){root.classList.add('contract-status-sheet');statusSheetBody(root);root.appendChild(renderContractHistory(document,c,{finance}));}});
      };
      const heading=renderContractCardHeading(p,c,approval?null:{
        onEdit:!writable?undefined:()=>{if(['pending','approved'].includes(contractApprovalState(c)))window.KarhaLegacy?.showToast?.('قرارداد ارسال‌شده یا تأییدشده قابل ویرایش نیست');else legacy('openContractForm',c.id);},
        onExport:trigger=>openContractExport(p,finance?c.accountingPackage.contract:c,{trigger,frozen:finance}),
        onDelete:!writable?undefined:()=>openConfirm('آیا از حذف این قرارداد اطمینان دارید؟',()=>{
          const result=contractApi.trash(id,c.id);
          if(!result.ok){
            if(result.code==='in_use')window.KarhaLegacy?.showRecordDeleteBlocked?.('contract',result.refs);
            else window.KarhaLegacy?.showToast?.(result.message||'حذف قرارداد انجام نشد');
            return;
          }
          onChanged();
        },'حذف'),
      },{onPreview:showDetails && !finance && !approval ? trigger=>openContractDetails(p,c,trigger) : approval?preview:openPreview,progress:renderContractProgressCircle(document,c,p,openStatus)});
      row.appendChild(heading);
      if(approval){
        statusSheetBody=root=>root.append(renderContractReviewRow(c,{...approval,preview}),renderContractProgress(document,c,p));
        return row;
      }
      if(!finance){
      const statusRow=renderContractWorkflowRow(c);
      const run=(action,options={})=>{
        const result=contractApi.review(id,c.id,action,actor,options);
        if(!result.ok){window.KarhaLegacy?.showToast?.(result.message||'ثبت تغییرات انجام نشد');return false;}
        onChanged();return true;
      };
      const button=(label,handler,danger=false)=>{
        const el=document.createElement('button');el.type='button';el.className='contract-review-action'+(danger?' danger':'');el.textContent=label;
        el.onclick=event=>{event.stopPropagation();handler();};statusRow.appendChild(el);
      };
      if(writable && (canCancelContractCompletion(c) || (contractApprovalState(c)==='pending' && c.submittedBy?.id===actor.id))){
        const action=contractApprovalState(c)==='pending'?'withdraw_submission':'cancel_completion';
        button(action==='withdraw_submission'?'پس‌گرفتن از تأیید':'لغو اعلام تکمیل',()=>openWbsSheet({
          title:action==='withdraw_submission'?'پس‌گرفتن از تأیید':'لغو اعلام تکمیل',saveLabel:'ثبت برگشت',historyKey:'contract-cancel-completion:'+c.id,
          body(root){const reason=document.createElement('textarea');reason.className='wbs-input today-textarea';reason.name='completionReason';root.appendChild(fieldRow('علت برگشت (الزامی)',reason));},
          onSave:root=>run(action,{reason:root.querySelector('[name="completionReason"]').value})
        }),true);
      }
      if(c.approvalRejectionReason && ['unapproved','incomplete'].includes(contractApprovalState(c))){
        const reason=document.createElement('div');reason.className='contract-rejection-reason';reason.textContent='علت لغو تأیید: '+c.approvalRejectionReason;statusRow.appendChild(reason);
      }
      if(c.financeRejection?.reason && c.accountingStatus==='rejected'){const reason=document.createElement('div');reason.className='contract-rejection-reason';reason.textContent='دلیل رد توسط بخش مالی: '+c.financeRejection.reason;statusRow.appendChild(reason);}
      statusSheetBody=root=>{
        root.append(statusRow,renderContractProgress(document,c,p));
        const signedSection=renderContractSignedSection(p,c,{onChanged});
        if(signedSection)root.appendChild(signedSection);
      };
      const documents=showDetails?renderContractDocuments(p,c):renderContractAddendaRow(p,c);
      if(documents)row.appendChild(documents);
      }else statusSheetBody=root=>root.append(renderContractFinanceReview(p,c,{onChanged}),renderContractProgress(document,c,p));
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
    templates.forEach(t=>{const title=t.title||'قرارداد',meta=[new Intl.NumberFormat('fa-IR').format(Array.isArray(t.items)?t.items.length:0)+' ماده اصلی',t.isDraft||t.status==='draft'?'پیش‌نویس':''].filter(Boolean).join(' · ');const row=document.createElement('div');row.className='contract-template-row';row.dataset.searchText=normalizeContractSearch(title+' '+meta);const main=document.createElement('div');main.className='contract-template-main';const tt=document.createElement('div');tt.className='contract-template-title';tt.textContent=title;const mm=document.createElement('div');mm.className='contract-template-meta';mm.textContent=meta;main.append(tt,mm);const actions=document.createElement('div');actions.className='contract-template-actions';const del=document.createElement('button');del.type='button';del.className='contract-template-action danger';del.title='حذف';del.textContent='×';del.onclick=e=>{e.preventDefault();e.stopPropagation();openConfirm('آیا از حذف این قالب قرارداد اطمینان دارید؟',()=>{if(softDeleteTemplate(id,t.id))this.renderTemplates(id);},'حذف');};actions.appendChild(del);row.append(main);if(writable)row.append(actions);row.onclick=()=>writable?legacy('openContractTemplateForm',t.id):openContractPreview(p,t,{trigger:row,frozen:true});rows.push(row);listWrap.appendChild(row);});
  }
};

export default contractsModule;
