import { projectContext } from '../../core/projectContext.js';
import { projectRepository } from '../../data/projectRepository.js';
import { contactApi } from '../../domain/contactApi.js';
import { activityApi } from '../../domain/activityApi.js';
import { openContactForm, resetContactFormShell } from './contactFormModule.js';

const PAGE_SIZE = 50;

function getProjectId(explicit = null){
  return explicit
    || projectContext.getProjectId?.()
    || projectContext.getActiveProjectId?.()
    || null;
}

function getProject(projectId){
  return projectId ? projectRepository.getActiveProject(projectId) : null;
}

function textMatch(text,q){
  return !q || String(text || '').toLocaleLowerCase('fa').includes(q);
}

function deleteContact(projectId, contactId){
  const result = contactApi.trash(projectId, contactId);
  if(!result.ok){
    if(result.code === 'in_use'){
      window.KarhaLegacy?.showRecordDeleteBlocked?.('contact', result.refs);
    }else{
      window.KarhaLegacy?.showToast?.(result.message || 'حذف مخاطب انجام نشد');
    }
    return false;
  }
  return true;
}

function appendContactRow({ list, rows, projectId, contact, rerender }){
  const row=document.createElement('div');
  row.className='contact-row';

  const main=document.createElement('div');
  main.className='contact-main';

  const displayName=[contact.type,contact.firstName,contact.lastName]
    .filter(Boolean).join(' ').trim() || contact.name || 'مخاطب جدید';

  const name=document.createElement('div');
  name.className='contact-name';
  name.textContent=displayName;

  const activities=Array.isArray(contact.activities) ? contact.activities.filter(Boolean) : [];
  const activityText=activities
    .map(id=>activityApi.lookup(projectId, id))
    .filter(Boolean)
    .map(a=>a.name || '')
    .filter(Boolean)
    .join('، ');

  const activityLine=document.createElement('div');
  activityLine.className='contact-activities';
  activityLine.textContent=activityText || 'بدون فعالیت';
  main.append(name,activityLine);

  if(contact.pending){
    const status=document.createElement('div');
    status.className='contact-status';
    status.textContent='در انتظار تکمیل';
    main.appendChild(status);
  }

  const actions=document.createElement('div');
  actions.className='contact-actions';
  const edit=document.createElement('button');
  edit.type='button';
  edit.className='contact-action-btn';
  edit.textContent='ویرایش';
  edit.addEventListener('click',event=>{
    event.stopPropagation();
    openContactForm(contact);
  });
  const del=document.createElement('button');
  del.type='button';
  del.className='contact-action-btn danger';
  del.textContent='حذف';
  del.addEventListener('click',event=>{
    event.stopPropagation();
    if(!confirm('آیا از حذف این مخاطب اطمینان دارید؟')) return;
    if(deleteContact(projectId,contact.id)) rerender();
  });
  actions.append(del,edit);
  row.append(main,actions);
  row.dataset.searchText=(displayName+' '+activityText+' '+(contact.type||'')).toLocaleLowerCase('fa');
  row.addEventListener('click',()=>openContactForm(contact));
  rows.push(row);
  list.appendChild(row);
}

export const peopleModule = {
  id:'people',
  title:'کارکنان و پیمانکاران',
  route:'people',
  openContactForm,
  resetContactFormShell,

  mount({projectId} = {}){
    this.render(projectId);
    return { projectId:getProjectId(projectId), moduleId:'people' };
  },

  render(projectId = null){
    const body=document.getElementById('contactsPageBody');
    if(!body) return;

    const activeId=getProjectId(projectId);
    const project=getProject(activeId);
    body.innerHTML='';

    if(!project){
      body.innerHTML='<div class="mgmt-empty">برای نمایش مخاطبین، یک پروژه را انتخاب کنید.</div>';
      return;
    }

    const firstPage=contactApi.listPage(activeId, { cursor:0, limit:PAGE_SIZE });
    if(!firstPage.items.length){
      const empty=document.createElement('div');
      empty.className='mgmt-empty';
      empty.textContent='هنوز مخاطبی ثبت نشده است.';
      body.appendChild(empty);
      return;
    }

    const search=document.createElement('input');
    search.type='search';
    search.className='workspace-search-input';
    search.placeholder='جستجوی مخاطب، فعالیت یا نوع مخاطب…';
    search.autocomplete='off';
    const searchWrap=document.createElement('div');
    searchWrap.className='workspace-search';
    searchWrap.appendChild(search);

    const list=document.createElement('div');
    list.className='contacts-list';
    const rows=[];
    const rerender=()=>this.render(activeId);

    firstPage.items.forEach(contact => appendContactRow({
      list, rows, projectId:activeId, contact, rerender,
    }));

    search.addEventListener('input',()=>{
      const q=String(search.value||'').trim().toLocaleLowerCase('fa');
      rows.forEach(row=>{ row.hidden=!textMatch(row.dataset.searchText,q); });
    });

    body.append(searchWrap,list);

    if(firstPage.cursor != null){
      const more=document.createElement('button');
      more.type='button';
      more.className='contact-action-btn';
      more.textContent='بارگذاری بیشتر';
      let cursor=firstPage.cursor;
      more.addEventListener('click',()=>{
        const page=contactApi.listPage(activeId,{ cursor, limit:PAGE_SIZE });
        page.items.forEach(contact => appendContactRow({
          list, rows, projectId:activeId, contact, rerender,
        }));
        cursor=page.cursor;
        if(cursor==null) more.remove();
      });
      body.appendChild(more);
    }
  },
};

export default peopleModule;
