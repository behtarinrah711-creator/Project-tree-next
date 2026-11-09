import { canWriteProjectModule } from '../roleManagement/permissionState.js';
import { searchText } from '../../ui/catalogueSearch.js';
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
  row.append(main);
  if(canWriteProjectModule(projectId,'people'))row.append(actions);
  row.dataset.searchText=searchText(displayName+' '+activityText+' '+(contact.type||''));
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
    const add=document.getElementById('contactAddBtn');
    if(add) add.hidden=!!project && !canWriteProjectModule(activeId,'people');

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

    const empty=document.createElement('div');empty.className='mgmt-empty hidden';empty.textContent='مخاطبی یافت نشد';
    const applyFilter=()=>{
      const q=searchText(search.value);
      let matches=0;
      rows.forEach(row=>{const match=!q || row.dataset.searchText.includes(q);row.classList.toggle('hidden',!match);if(match)matches++;});
      empty.classList.toggle('hidden',matches>0);
    };
    let cursor=firstPage.cursor;
    const more=document.createElement('button');more.type='button';more.className='contact-action-btn';more.textContent='بارگذاری بیشتر';
    const loadNext=()=>{
      const page=contactApi.listPage(activeId,{cursor,limit:PAGE_SIZE});
      page.items.forEach(contact=>appendContactRow({list,rows,projectId:activeId,contact,rerender}));
      cursor=page.cursor;if(cursor==null)more.remove();
    };
    search.addEventListener('input',()=>{
      // Search the entire project, including contacts not yet displayed by pagination.
      if(searchText(search.value))while(cursor!=null)loadNext();
      applyFilter();
    });
    more.addEventListener('click',()=>{loadNext();applyFilter();});
    body.append(searchWrap,list,empty);
    if(cursor!=null)body.appendChild(more);
  },
};

export default peopleModule;
