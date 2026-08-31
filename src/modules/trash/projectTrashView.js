/** Project-scoped trash presentation. Mutations are supplied by canonical owners. */
export function createProjectTrashView(deps){
  const { document, getActiveProjectId, findProject, walkItems, getContacts,
    getActivityTemplates, findActivityTemplate, taskView, restoreRecord,
    permanentlyDeleteRecord, persist, refreshWorkspace, refreshContacts,
    refreshActivities, showToast, createWorkspaceSearch, workspaceTextMatch }=deps;

  const sourceLabel=type=>({contact:'مخاطبین',activity:'فعالیت‌ها',project:'پروژه‌ها',task:'آیتم‌های پروژه',subtask:'آیتم‌های پروژه'}[type]||'سایر');
  function addSourceBadge(container,type){
    const badge=document.createElement('div');
    badge.className='trash-source-badge';
    badge.textContent='بخش: '+sourceLabel(type);
    container.insertBefore(badge,container.firstChild);
    return badge;
  }
  function collect(projectId){
    const out=[]; const project=findProject(projectId); if(!project) return out;
    (project.tasks||[]).forEach(task=>{
      if(task?.trashed) out.push({type:'task',id:task.id,record:task,projectId:project.id,projectName:project.name,deletedAt:task.deletedAt||0});
      walkItems(task.subtasks,(item,parent)=>{
        if(item?.trashed) out.push({type:'subtask',id:item.id,record:item,projectId:project.id,projectName:project.name,parentId:parent?parent.id:task.id,rootTaskId:task.id,deletedAt:item.deletedAt||0});
      });
    });
    getContacts(project).forEach(record=>{ if(record?.trashed) out.push({type:'contact',id:record.id,record,projectId,projectName:project.name,deletedAt:record.deletedAt||0}); });
    getActivityTemplates(project).forEach(record=>{ if(record?.trashed) out.push({type:'activity',id:record.id,record,projectId,projectName:project.name,deletedAt:record.deletedAt||0}); });
    return out.sort((a,b)=>(b.deletedAt||0)-(a.deletedAt||0));
  }
  function appendActions(actions,entry){
    const restore=document.createElement('button'); restore.type='button'; restore.className='restore-btn'; restore.textContent='بازگردانی';
    restore.onclick=()=>{ if(restoreRecord(entry)){ persist(); render(); refreshWorkspace(); refreshContacts(); refreshActivities(); showToast('بازگردانده شد'); } };
    const remove=document.createElement('button'); remove.type='button'; remove.className='perm-del-btn'; remove.textContent='حذف همیشگی';
    remove.onclick=()=>deps.openConfirm('این مورد برای همیشه حذف شود؟ این عملیات قابل بازگردانی نیست.',async()=>{
      if(await permanentlyDeleteRecord(entry)){ persist(); render(); refreshWorkspace(); refreshContacts(); refreshActivities(); showToast('برای همیشه حذف شد'); }
    },'حذف همیشگی');
    actions.append(restore,remove);
  }
  function renderItem(entry,list){
    if(entry.type==='task'||entry.type==='subtask'){ taskView.renderTrashItem(entry,list); return; }
    const record=entry.record; const wrap=document.createElement('div'); wrap.className='trash-task-wrap project-trash-record'; addSourceBadge(wrap,entry.type);
    if(entry.type==='contact'){
      const row=document.createElement('div'); row.className='contact-row trash-native-row';
      const main=document.createElement('div'); main.className='contact-main';
      const name=document.createElement('div'); name.className='contact-name'; name.textContent=[record.type,record.firstName,record.lastName].filter(Boolean).join(' ').trim()||record.name||'مخاطب جدید';
      const line=document.createElement('div'); line.className='contact-activities'; line.textContent=(record.activities||[]).map(id=>{const a=findActivityTemplate(id);return a&&!a.trashed?a.name:'';}).filter(Boolean).join('، ')||'بدون فعالیت';
      const actions=document.createElement('div'); actions.className='contact-actions project-trash-inline-actions'; appendActions(actions,entry);
      main.append(name,line); row.append(main,actions); wrap.appendChild(row); list.appendChild(wrap); return;
    }
    if(entry.type==='activity'){
      const row=document.createElement('div'); row.className='activity-row trash-native-row';
      const name=document.createElement('div'); name.className='activity-name'; name.textContent=record.name||'فعالیت';
      const actions=document.createElement('div'); actions.className='activity-actions project-trash-inline-actions'; appendActions(actions,entry);
      row.append(name,actions); wrap.appendChild(row); list.appendChild(wrap);
    }
  }
  function render(){
    const body=document.getElementById('projectTrashPageBody'); if(!body) return;
    const projectId=getActiveProjectId(); const items=projectId?collect(projectId):[]; body.innerHTML='';
    const clearWrap=document.createElement('div'); clearWrap.className='project-trash-clear-wrap inner-action-card inner-action-card--danger';
    const clear=document.createElement('button'); clear.type='button'; clear.className='perm-del-btn project-trash-clear'; clear.textContent='حذف همه';
    clear.onclick=async()=>{
      if(clear.dataset.confirmed!=='1'){ clear.dataset.confirmed='1'; clear.textContent='برای حذف همه دوباره بزنید'; deps.setTimeout(()=>{if(clear.isConnected&&clear.dataset.confirmed==='1'){clear.dataset.confirmed='0';clear.textContent='حذف همه';}},3000); return; }
      clear.dataset.confirmed='0'; for(const entry of items.slice()) await permanentlyDeleteRecord(entry);
      persist(); render(); refreshWorkspace(); showToast('همه موارد این پروژه برای همیشه حذف شدند');
    };
    clearWrap.appendChild(clear); body.appendChild(clearWrap);
    if(!projectId){ const empty=document.createElement('div'); empty.className='project-trash-empty'; empty.textContent='پروژه‌ای برای نمایش حذف‌شده‌ها انتخاب نشده است.'; body.appendChild(empty); return; }
    if(!items.length){ const empty=document.createElement('div'); empty.className='project-trash-empty'; empty.textContent='مورد حذف‌شده‌ای در این پروژه وجود ندارد.'; body.appendChild(empty); return; }
    const list=document.createElement('div'); list.className='project-trash-list';
    const search=createWorkspaceSearch('جستجو در حذف‌شده‌ها…',q=>{Array.from(list.children).forEach(row=>row.hidden=!workspaceTextMatch(row.dataset.searchText,q));});
    body.appendChild(search.wrap); items.forEach(entry=>renderItem(entry,list)); body.appendChild(list);
  }
  return { collect, render, renderItem, addSourceBadge, appendActions };
}

export default createProjectTrashView;
