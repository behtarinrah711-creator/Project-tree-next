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
  const meta=[person,a?.name||'بدون فعالیت',money(c.amount)].join(' · ');
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
    const firstPage=contractApi.listPage(id,{cursor:0,limit:50}),contracts=firstPage.items;
    head.innerHTML=`<span class="title">قراردادهای واقعی پیمانکاران</span><span class="mgmt-count">${new Intl.NumberFormat('fa-IR').format(contracts.length)}</span>`; body.append(head);
    const search=searchInput('جستجوی قرارداد، پیمانکار یا فعالیت…',q=>{[...listWrap.children].forEach(row=>row.hidden=!row.dataset.searchText.includes(q));});
    body.append(search.wrap,listWrap);
    if(!contracts.length){const e=document.createElement('div');e.className='contract-empty';e.innerHTML='هنوز قرارداد واقعی ثبت نشده است.<br>از علامت + یک قرارداد ایجاد کنید.';body.appendChild(e);return;}
    const appendContract=c=>{
      const {title,meta,created}=contractRowData(id,c);
      const row=document.createElement('div'); row.className='contract-row';
      row.dataset.searchText=(title+' '+meta+' '+(created ? `${created.date} ${created.time}` : '')).toLocaleLowerCase('fa');
      const main=document.createElement('div'); main.className='contract-main';
      const t=document.createElement('div'); t.className='contract-title'; t.textContent=title;
      const m=document.createElement('div'); m.className='contract-meta'; m.textContent=meta; main.append(t,m);
      const actions=document.createElement('div'); actions.className='contract-actions';
      const edit=document.createElement('button'); edit.className='contract-action'; edit.textContent='✎'; edit.title='ویرایش'; edit.onclick=e=>{e.stopPropagation();legacy('openContractForm',c.id);};
      const del=document.createElement('button'); del.className='contract-action danger'; del.textContent='×'; del.title='حذف';
      del.onclick=e=>{e.stopPropagation();if(!confirm('آیا از حذف این قرارداد اطمینان دارید؟'))return;const result=contractApi.trash(id,c.id);if(!result.ok){if(result.code==='in_use')window.KarhaLegacy?.showRecordDeleteBlocked?.('contract',result.refs);else window.KarhaLegacy?.showToast?.(result.message||'حذف قرارداد انجام نشد');return;}this.render(id);};
      actions.append(edit,del);
      if(created){
        const createdBox=document.createElement('div'); createdBox.className='contract-created';
        const date=document.createElement('div'); date.className='contract-created-date'; date.textContent=created.date;
        const time=document.createElement('div'); time.className='contract-created-time'; time.textContent=created.time;
        createdBox.append(date,time);
        row.append(main,createdBox,actions);
      }else{
        row.append(main,actions);
      }
      main.onclick=()=>legacy('openContractForm',c.id); listWrap.appendChild(row);
    };
    contracts.forEach(appendContract);
    if(firstPage.cursor != null){
      const more=document.createElement('button');more.type='button';more.className='contract-action';more.textContent='بارگذاری بیشتر';let cursor=firstPage.cursor;
      more.addEventListener('click',()=>{const page=contractApi.listPage(id,{cursor,limit:50});page.items.forEach(appendContract);cursor=page.cursor;if(cursor==null)more.remove();}); body.appendChild(more);
    }
  },
  renderTemplates(explicitProjectId=null){
    const id=resolveProjectId(explicitProjectId),p=project(id),body=document.getElementById('contractTemplatesPageBody'); if(!body)return; body.innerHTML='';
    if(!p){body.innerHTML='<div class="contract-empty">ابتدا یک پروژه را انتخاب کنید.</div>';return;}
    const templates=list(p,'contractTemplates'),head=document.createElement('div');head.className='contract-list-head';head.innerHTML=`<span class="title">قالب‌های قرارداد این پروژه</span><span class="mgmt-count">${new Intl.NumberFormat('fa-IR').format(templates.length)}</span>`;body.appendChild(head);
    if(!templates.length){const e=document.createElement('div');e.className='contract-empty';e.textContent='هنوز قالب قراردادی ثبت نشده است.';body.appendChild(e);return;}
    const listWrap=document.createElement('div');listWrap.className='contract-template-list';const search=searchInput('جستجوی قالب قرارداد…',q=>{[...listWrap.children].forEach(row=>row.hidden=!row.dataset.searchText.includes(q));});body.append(search.wrap,listWrap);
    templates.forEach(t=>{const a=findActivity(id,t.activityId),title=a?`قرارداد ${a.name}`:(t.title||'قرارداد'),meta=(a?.name||'بدون فعالیت')+' · '+new Intl.NumberFormat('fa-IR').format(Array.isArray(t.items)?t.items.length:0)+' ماده اصلی';const row=document.createElement('div');row.className='contract-template-row';row.dataset.searchText=(title+' '+meta).toLocaleLowerCase('fa');const main=document.createElement('div');main.className='contract-template-main';const tt=document.createElement('div');tt.className='contract-template-title';tt.textContent=title;const mm=document.createElement('div');mm.className='contract-template-meta';mm.textContent=meta;main.append(tt,mm);const actions=document.createElement('div');actions.className='contract-template-actions';const del=document.createElement('button');del.type='button';del.className='contract-template-action danger';del.title='حذف';del.textContent='×';del.onclick=e=>{e.preventDefault();e.stopPropagation();if(!confirm('آیا از حذف این قالب قرارداد اطمینان دارید؟'))return;if(softDeleteTemplate(id,t.id))this.renderTemplates(id);};actions.appendChild(del);row.append(main,actions);row.onclick=()=>legacy('openContractTemplateForm',t.id);listWrap.appendChild(row);});
  }
};

export default contractsModule;
