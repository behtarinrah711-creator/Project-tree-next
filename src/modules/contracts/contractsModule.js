import { approvalLabels, contractApprovalState, canReviewContract, REJECTION_MIN_LENGTH } from '../../domain/contractApproval.js';
import { currentExecutionActor } from '../wbs/executionActor.js';
import { fieldRow, openWbsSheet } from '../wbs/wbsSheet.js';
import { openStaticChoicePicker } from './contractPickers.js';
const contractListViews=new Map();
export const normalizeContractSearch=value=>String(value||'').toLocaleLowerCase('fa').replace(/ي/g,'ی').replace(/ك/g,'ک').replace(/[\u200c\s\-٬,]/g,'').replace(/[۰-۹]/g,c=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c))).replace(/[٠-٩]/g,c=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)));
import { openContractPreview } from './contractPreviewView.js';
import { contractActionsMenu } from './contractActionsMenu.js';
import { openContractExport } from './contractExportView.js';
import { openConfirm } from '../../ui/confirm.js';
import { projectContext } from '../../core/projectContext.js';
import { projectRepository } from '../../data/projectRepository.js';
import { contractApi } from '../../domain/contractApi.js';
import { contactApi } from '../../domain/contactApi.js';
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
function money(v){
  if(v===null||v===undefined||v==='') return 'بدون مبلغ';
  try { return new Intl.NumberFormat('fa-IR').format(Number(v)); } catch { return String(v); }
}
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
function contractRowData(projectId,c){
  const a=findActivity(projectId,c.activityId);
  const contact=findContact(projectId,c.contractorId||c.contactId);
  const title=c.title || ('قرارداد '+(a?.name||''));
  const person=contact ? ([contact.firstName,contact.lastName].filter(Boolean).join(' ')||contact.name) : 'بدون مخاطب';
  const meta=[c.contractNo,person,a?.name||'بدون فعالیت',money(c.amount)].filter(Boolean).join(' · ');
  return {title,meta,created:contractCreatedParts(c.createdAt)};
}

export const contractsModule={
  id:'contracts', title:'قراردادها', route:'contracts',
  mount({projectId: explicitProjectId}={}){this.render(explicitProjectId);return {projectId:explicitProjectId || resolveProjectId(),moduleId:'contracts'};},
  render(explicitProjectId=null){
    const id=resolveProjectId(explicitProjectId),p=project(id),body=document.getElementById('contractsPageBody');
    if(!body)return;
    const add=document.getElementById('contractAddBtn'); if(add) add.onclick=()=>legacy('openContractForm',null);
    body.innerHTML='';
    if(!p){body.innerHTML='<div class="contract-empty">ابتدا یک پروژه را انتخاب کنید.</div>';return;}
    const listWrap=document.createElement('div'); listWrap.className='contract-list';
    const head=document.createElement('div'); head.className='contract-list-head';
    const contracts=[];let cursor=0;
    do{const page=contractApi.listPage(id,{cursor,limit:200});contracts.push(...page.items);cursor=page.cursor;}while(cursor!=null);
    const actor=currentExecutionActor(p);
    const view=contractListViews.get(id)||{query:'',status:'all'};contractListViews.set(id,view);
    head.innerHTML=`<span class="title">قراردادهای واقعی پیمانکاران</span><span class="mgmt-count">${new Intl.NumberFormat('fa-IR').format(contracts.length)}</span>`;body.append(head);
    const renderedRows=[];
    const empty=document.createElement('div');empty.className='contract-empty';empty.textContent='قراردادی با این جست‌وجو و وضعیت یافت نشد.';
    const applyFilters=()=>{
      const matching=renderedRows.filter(row=>
        row.dataset.searchText.includes(normalizeContractSearch(view.query)) &&
        (view.status==='all'||(view.status==='mine'?row.dataset.reviewMine==='true':row.dataset.approvalState===view.status)));
      listWrap.replaceChildren(...matching);
      empty.remove();
      if(!matching.length && contracts.length)body.appendChild(empty);
    };
    const search=searchInput('جستجوی شماره قرارداد، پیمانکار یا فعالیت…',q=>{view.query=q;applyFilters();});
    search.input.value=view.query;search.input.setAttribute('aria-label','جستجوی قرارداد');body.append(search.wrap);
    const filter=document.createElement('button');filter.type='button';filter.className='contract-status-filter';
    const filterLabel=()=>{filter.textContent=view.status==='mine'?'منتظر تأیید من ×':'وضعیت: '+(approvalLabels[view.status]||'همه');};
    const mine=contracts.filter(c=>canReviewContract(c,actor)).length;
    if(mine){
      const banner=document.createElement('button');banner.type='button';banner.className='contract-review-banner';banner.textContent=new Intl.NumberFormat('fa-IR').format(mine)+' قرارداد منتظر تأیید شما ‹';
      banner.onclick=()=>{view.status='mine';filterLabel();applyFilters();};body.appendChild(banner);
    }
    filter.onclick=()=>{
      if(view.status==='mine'){view.status='all';filterLabel();applyFilters();return;}
      openStaticChoicePicker('وضعیت قرارداد','وضعیت‌ها',[{value:'all',label:'همه'},...Object.entries(approvalLabels).map(([value,label])=>({value,label}))],view.status,value=>{view.status=value;filterLabel();applyFilters();},null,{preserveOrder:true});
    };
    filterLabel();body.append(filter,listWrap);
    if(!contracts.length){const e=document.createElement('div');e.className='contract-empty';e.innerHTML='هنوز قرارداد واقعی ثبت نشده است.<br>از علامت + یک قرارداد ایجاد کنید.';body.appendChild(e);return;}
    const appendContract=c=>{
      const {title,meta,created}=contractRowData(id,c);
      const row=document.createElement('div'); row.className='contract-row';
      row.dataset.searchText=normalizeContractSearch(title+' '+meta+' '+(c.projectItemPath||'')+' '+(created ? `${created.date} ${created.time}` : ''));
      row.dataset.approvalState=contractApprovalState(c);row.dataset.reviewMine=String(canReviewContract(c,actor));
      const main=document.createElement('div'); main.className='contract-main';
      const t=document.createElement('div'); t.className='contract-title'; t.textContent=title;
      const m=document.createElement('div'); m.className='contract-meta'; m.textContent=meta; main.append(t,m);
      const actions=document.createElement('div'); actions.className='contract-actions';
      actions.appendChild(contractActionsMenu({
        onEdit:()=>{if(['pending','approved'].includes(contractApprovalState(c)))window.KarhaLegacy?.showToast?.('قرارداد ارسال‌شده یا تأییدشده قابل ویرایش نیست');else legacy('openContractForm',c.id);},
        onExport:trigger=>openContractExport(p,c,{trigger}),
        onDelete:()=>openConfirm('آیا از حذف این قرارداد اطمینان دارید؟',()=>{
          const result=contractApi.trash(id,c.id);
          if(!result.ok){
            if(result.code==='in_use')window.KarhaLegacy?.showRecordDeleteBlocked?.('contract',result.refs);
            else window.KarhaLegacy?.showToast?.(result.message||'حذف قرارداد انجام نشد');
            return;
          }
          this.render(id);
        },'حذف'),
      }));
      if(created){
        const createdBox=document.createElement('div'); createdBox.className='contract-created';
        const date=document.createElement('div'); date.className='contract-created-date'; date.textContent=created.date;
        const time=document.createElement('div'); time.className='contract-created-time'; time.textContent=created.time;
        createdBox.append(date,time);
        row.append(main,createdBox,actions);
      }else{
        row.append(main,actions);
      }
      const statusRow=document.createElement('div');statusRow.className='contract-workflow-row';
      const status=document.createElement('span');status.textContent=approvalLabels[contractApprovalState(c)];statusRow.appendChild(status);
      const run=(action,options={})=>{
        const result=contractApi.review(id,c.id,action,actor,options);
        if(!result.ok){window.KarhaLegacy?.showToast?.(result.message||'ثبت تغییرات انجام نشد');return false;}
        this.render(id);return true;
      };
      const button=(label,handler,danger=false)=>{
        const el=document.createElement('button');el.type='button';el.className='contract-review-action'+(danger?' danger':'');el.textContent=label;
        el.onclick=event=>{event.stopPropagation();handler();};statusRow.appendChild(el);
      };
      if(['ready','returned'].includes(contractApprovalState(c)) && !c.isDraft && c.status==='final'){
        button('ارسال برای تأیید',()=>openStaticChoicePicker('انتخاب مسئول تأیید','مخاطبین',(p.contacts||[]).filter(x=>!x.trashed).map(x=>({value:x.id,label:[x.firstName,x.lastName].filter(Boolean).join(' ')||x.name||'مخاطب'})),c.approvalContactId,value=>run('submit',{approverId:value})));
      }
      if(canReviewContract(c,actor)){
        button('تأیید',()=>openConfirm('این قرارداد تأیید شود؟',()=>run('approve'),'تأیید'));
        button('برگشت برای اصلاح',()=>openWbsSheet({
          title:'رد تأیید قرارداد',saveLabel:'ثبت رد',historyKey:'contract-reject:'+c.id,
          body(root){const reason=document.createElement('textarea');reason.className='wbs-input today-textarea';reason.name='rejectionReason';reason.required=true;reason.minLength=REJECTION_MIN_LENGTH;root.appendChild(fieldRow('علت رد (الزامی)',reason));},
          onSave:root=>run('reject',{reason:root.querySelector('[name="rejectionReason"]').value})
        }),true);
      }
      if(c.approvalRejectionReason && contractApprovalState(c)==='returned'){
        const reason=document.createElement('div');reason.className='contract-rejection-reason';reason.textContent='علت برگشت: '+c.approvalRejectionReason;statusRow.appendChild(reason);
      }
      row.appendChild(statusRow);statusRow.onclick=event=>event.stopPropagation();
      row.onclick=()=>openContractPreview(p,c,{trigger:main}); renderedRows.push(row);
    };
    contracts.forEach(appendContract);
    applyFilters();
  },
  renderTemplates(explicitProjectId=null){
    const id=resolveProjectId(explicitProjectId),p=project(id),body=document.getElementById('contractTemplatesPageBody'); if(!body)return; body.innerHTML='';
    if(!p){body.innerHTML='<div class="contract-empty">ابتدا یک پروژه را انتخاب کنید.</div>';return;}
    const templates=list(p,'contractTemplates'),head=document.createElement('div');head.className='contract-list-head';head.innerHTML=`<span class="title">قالب‌های قرارداد این پروژه</span><span class="mgmt-count">${new Intl.NumberFormat('fa-IR').format(templates.length)}</span>`;body.appendChild(head);
    if(!templates.length){const e=document.createElement('div');e.className='contract-empty';e.textContent='هنوز قالب قراردادی ثبت نشده است.';body.appendChild(e);return;}
    const listWrap=document.createElement('div');listWrap.className='contract-template-list';const search=searchInput('جستجوی قالب قرارداد…',q=>{[...listWrap.children].forEach(row=>row.hidden=!row.dataset.searchText.includes(q));});body.append(search.wrap,listWrap);
    templates.forEach(t=>{const a=findActivity(id,t.activityId),title=a?`قرارداد ${a.name}`:(t.title||'قرارداد'),meta=[a?.name||'بدون فعالیت',new Intl.NumberFormat('fa-IR').format(Array.isArray(t.items)?t.items.length:0)+' ماده اصلی',t.isDraft||t.status==='draft'?'پیش‌نویس':''].filter(Boolean).join(' · ');const row=document.createElement('div');row.className='contract-template-row';row.dataset.searchText=(title+' '+meta).toLocaleLowerCase('fa');const main=document.createElement('div');main.className='contract-template-main';const tt=document.createElement('div');tt.className='contract-template-title';tt.textContent=title;const mm=document.createElement('div');mm.className='contract-template-meta';mm.textContent=meta;main.append(tt,mm);const actions=document.createElement('div');actions.className='contract-template-actions';const del=document.createElement('button');del.type='button';del.className='contract-template-action danger';del.title='حذف';del.textContent='×';del.onclick=e=>{e.preventDefault();e.stopPropagation();if(!confirm('آیا از حذف این قالب قرارداد اطمینان دارید؟'))return;if(softDeleteTemplate(id,t.id))this.renderTemplates(id);};actions.appendChild(del);row.append(main,actions);row.onclick=()=>legacy('openContractTemplateForm',t.id);listWrap.appendChild(row);});
  }
};

export default contractsModule;
