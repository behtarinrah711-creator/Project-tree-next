import { projectContext } from '../../core/projectContext.js';
import { projectRepository } from '../../data/projectRepository.js';
import { activityApi } from '../../domain/activityApi.js';
import { openActivityForm, openActivityEditForm, requestCloseActivityForm } from './activityFormModule.js';

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

function getContractTemplates(project){
  return Array.isArray(project?.contractTemplates)
    ? project.contractTemplates.filter(t => !t.trashed)
    : [];
}

function getContracts(project){
  return Array.isArray(project?.contracts)
    ? project.contracts.filter(c => !c.trashed)
    : [];
}

function deleteActivity(projectId, activityId){
  const result = activityApi.trash(projectId, activityId);
  if(!result.ok){
    if(result.code === 'in_use'){
      window.KarhaLegacy?.showRecordDeleteBlocked?.('activity', result.refs);
    }else{
      window.KarhaLegacy?.showToast?.(result.message || 'حذف فعالیت انجام نشد');
    }
    return false;
  }
  return true;
}

function appendActivityRow({ list, rows, project, activity, projectId, rerender }){
  const row=document.createElement('div');
  row.className='activity-row';

  const main=document.createElement('div');
  main.className='activity-main';

  const name=document.createElement('div');
  name.className='activity-name';
  name.textContent=activity.name || 'فعالیت بدون نام';

  const templateCount=getContractTemplates(project)
    .filter(t=>String(t.activityId)===String(activity.id)).length;
  const contractCount=getContracts(project)
    .filter(c=>String(c.activityId)===String(activity.id)).length;

  const meta=document.createElement('div');
  meta.className='activity-contract-meta';
  meta.textContent=templateCount
    ? `قالب قرارداد: ${templateCount} · قرارداد واقعی: ${contractCount}`
    : 'بدون قالب قرارداد';

  main.append(name,meta);

  const actions=document.createElement('div');
  actions.className='activity-actions';

  const edit=document.createElement('button');
  edit.type='button';
  edit.className='activity-action';
  edit.title='ویرایش';
  edit.textContent='ویرایش';
  edit.addEventListener('click',e=>{
    e.stopPropagation();
    openActivityEditForm(activity);
  });

  const del=document.createElement('button');
  del.type='button';
  del.className='activity-action danger';
  del.title='حذف';
  del.textContent='حذف';
  del.addEventListener('click',e=>{
    e.stopPropagation();
    if(!confirm('آیا از حذف این فعالیت اطمینان دارید؟')) return;
    if(deleteActivity(projectId,activity.id)) rerender();
  });

  actions.append(edit,del);
  row.append(main,actions);
  row.dataset.searchText=`${activity.name || ''} ${meta.textContent}`.toLocaleLowerCase('fa');
  row.addEventListener('click',()=>openActivityEditForm(activity));
  rows.push(row);
  list.appendChild(row);
}

export const activitiesModule = {
  id:'activities',
  title:'فعالیت‌ها',
  route:'activities',
  openActivityForm,
  openActivityEditForm,
  requestCloseActivityForm,

  mount({projectId} = {}){
    this.render(projectId);
    return { projectId:getProjectId(projectId), moduleId:'activities' };
  },

  render(projectId = null){
    const body=document.getElementById('projectActivitiesPageBody');
    if(!body) return;

    const activeId=getProjectId(projectId);
    const project=getProject(activeId);
    body.innerHTML='';

    if(!project){
      body.innerHTML='<div class="mgmt-empty">برای نمایش فعالیت‌ها، یک پروژه را انتخاب کنید.</div>';
      return;
    }

    const firstPage=activityApi.listPage(activeId, { cursor:0, limit:PAGE_SIZE });
    if(!firstPage.items.length){
      const empty=document.createElement('div');
      empty.className='mgmt-empty';
      empty.textContent='هنوز فعالیتی ثبت نشده است.';
      body.appendChild(empty);
      return;
    }

    const searchWrap=document.createElement('div');
    searchWrap.className='workspace-search';
    const search=document.createElement('input');
    search.type='search';
    search.className='workspace-search-input';
    search.placeholder='جستجوی فعالیت…';
    search.autocomplete='off';
    searchWrap.appendChild(search);

    const list=document.createElement('div');
    list.className='activity-list';
    const rows=[];
    const rerender=()=>this.render(activeId);

    firstPage.items.forEach(activity => appendActivityRow({
      list, rows, project, activity, projectId:activeId, rerender,
    }));

    search.addEventListener('input',()=>{
      const q=String(search.value || '').trim().toLocaleLowerCase('fa');
      rows.forEach(row=>{
        row.hidden=!!q && !row.dataset.searchText.includes(q);
      });
    });

    body.append(searchWrap,list);

    if(firstPage.cursor != null){
      const more=document.createElement('button');
      more.type='button';
      more.className='activity-action';
      more.textContent='بارگذاری بیشتر';
      let cursor=firstPage.cursor;
      more.addEventListener('click',()=>{
        const page=activityApi.listPage(activeId,{ cursor, limit:PAGE_SIZE });
        page.items.forEach(activity => appendActivityRow({
          list, rows, project, activity, projectId:activeId, rerender,
        }));
        cursor=page.cursor;
        if(cursor==null) more.remove();
      });
      body.appendChild(more);
    }
  },
};

export default activitiesModule;
