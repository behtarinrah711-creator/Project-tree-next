/** Project-management presentation. Project mutations remain dependency-owned. */
export function createProjectManagementView(deps){
const {document,getData,projectsVisibleForAuth,isPendingDeleted,svgGrip,svgTrash,
  openMiniPrompt,renameProject,cloudRenameProject,findProject,archiveProject,
  setActiveTab,getActiveTab,cloudSyncProjectStatus,refreshWorkspace,showToast,
  openExportPage,openConfirm,softDelete,undoPendingDelete,persist,
  permanentlyDeleteProject}=deps;
let managementProjectTab='all';
function render(){
  const body = document.getElementById('projectsPageBody');
  if(!body) return;
  body.innerHTML = '';

  const data=getData();
  const visible = projectsVisibleForAuth(data.projects || []);
  const active = visible.filter(p => !p.trashed && !p.archived && !isPendingDeleted('project',p.id));
  const archived = visible.filter(p => p.archived && !p.trashed && !isPendingDeleted('project',p.id));
  const deleted = visible.filter(p => p.trashed || isPendingDeleted('project',p.id));
  const allCount = active.length + archived.length + deleted.length;

  const tabs=document.createElement('div');
  tabs.className='mgmt-project-tabs';
  const tabDefs=[['all','نمایش همه',allCount],['archived','آرشیو شده ها',archived.length],['deleted','حذف شده ها',deleted.length]];
  tabDefs.forEach(([key,label,count])=>{
    const b=document.createElement('button');
    b.type='button';
    b.className='mgmt-project-tab'+(managementProjectTab===key?' active':'');
    const text=document.createElement('span'); text.textContent=label;
    const badge=document.createElement('span'); badge.className='mgmt-project-tab-count'; badge.textContent=count;
    b.appendChild(text); b.appendChild(badge);
    b.onclick=()=>{ managementProjectTab=key; render(); };
    tabs.appendChild(b);
  });
  body.appendChild(tabs);

  function makeRow(p, mode){
    const row=document.createElement('div'); row.className='mgmt-row'; row.dataset.dragId=p.id;
    const grip=document.createElement('span');
    grip.className='drag-grip';
    grip.innerHTML=svgGrip();
    grip.setAttribute('aria-label','جابجایی پروژه');
    grip.onpointerdown=(e)=>{
      e.stopPropagation(); e.preventDefault();
      const wrap=row.parentElement;
      if(wrap) startProjectMgmtDrag(e,p.id,row,wrap,mode);
    };
    row.appendChild(grip);
    const name=document.createElement('div'); name.className='mgmt-name'; name.textContent=p.name; row.appendChild(name);
    const undone=(p.tasks||[]).filter(t=>!t.done&&!t.trashed&&!isPendingDeleted('task',p.id,t.id)).length;
    if(undone && mode==='active'){ const count=document.createElement('span'); count.className='mgmt-count'; count.textContent=undone; row.appendChild(count); }
    const actions=document.createElement('div'); actions.className='mgmt-actions';

    if(mode==='active'){
      const editBtn=document.createElement('button'); editBtn.className='mgmt-icon-btn blue'; editBtn.title='ویرایش نام'; editBtn.innerHTML='<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M11.5 2.5l2 2L5 13H3v-2L11.5 2.5z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>';
      editBtn.onclick=()=>openMiniPrompt('ویرایش نام پروژه',p.name,val=>{
        if(!val||!val.trim()) return;
        if(!renameProject(p.id,val.trim())?.ok) return;
        cloudRenameProject(findProject(p.id)||p);
        render(); refreshWorkspace();
      }); actions.appendChild(editBtn);

      const archBtn=document.createElement('button'); archBtn.className='mgmt-icon-btn'; archBtn.title='آرشیو'; archBtn.innerHTML='<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M3 6h14v10a1 1 0 01-1 1H4a1 1 0 01-1-1V6zM2 4h16v2H2V4z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M8 10h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';
      archBtn.onclick=()=>{
        archiveProject(p.id,true);
        if(getActiveTab()===p.id)setActiveTab('starred');
        cloudSyncProjectStatus(findProject(p.id)||p);
        // مهم: در همان تب فعلی بمان؛ فقط محتوا و شمارنده‌ها تازه شوند.
        render(); refreshWorkspace(); showToast('پروژه آرشیو شد');
      }; actions.appendChild(archBtn);

      const pdfBtn=document.createElement('button'); pdfBtn.className='mgmt-icon-btn blue'; pdfBtn.title='خروجی PDF'; pdfBtn.innerHTML='<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M5 2h7l4 4v12a1 1 0 01-1 1H5a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M12 2v4h4M7 11h6M7 14h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>'; pdfBtn.onclick=e=>{e.stopPropagation();openExportPage(p.id);}; actions.appendChild(pdfBtn);

      const delBtn=document.createElement('button'); delBtn.className='mgmt-icon-btn danger'; delBtn.title='حذف'; delBtn.innerHTML=svgTrash();
      delBtn.onclick=()=>openConfirm('آیا این پروژه حذف شود؟',()=>{
        softDelete('project',p.id,null,null,'پروژه حذف شد');
        // softDelete عمداً تب فعلی را تغییر نمی‌دهد.
        render();
      },'حذف'); actions.appendChild(delBtn);

    }else if(mode==='archived'){
      const restore=document.createElement('button'); restore.className='restore-btn'; restore.textContent='بازگردانی';
      restore.onclick=()=>{
        archiveProject(p.id,false);
        cloudSyncProjectStatus(findProject(p.id)||p);
        render(); refreshWorkspace(); showToast('پروژه بازگردانده شد');
      };
      actions.appendChild(restore);

      const delBtn=document.createElement('button'); delBtn.className='perm-del-btn'; delBtn.textContent='حذف';
      delBtn.onclick=()=>openConfirm('آیا این پروژه حذف شود؟',()=>{
        softDelete('project',p.id,null,null,'پروژه حذف شد');
        render();
      },'حذف');
      actions.appendChild(delBtn);

    }else if(mode==='deleted'){
      const restore=document.createElement('button'); restore.className='restore-btn'; restore.textContent='بازگردانی';
      restore.onclick=()=>{
        if(isPendingDeleted('project',p.id)){
          undoPendingDelete();
        }else{
          p.trashed=false; cloudSyncProjectStatus(p); persist(); render(); refreshWorkspace(); showToast('پروژه بازگردانده شد');
        }
      }; actions.appendChild(restore);

      const perm=document.createElement('button'); perm.className='perm-del-btn'; perm.textContent='حذف همیشگی';
      perm.onclick=()=>openConfirm('این پروژه برای همیشه حذف شود؟ این عمل قابل بازگشت نیست.',async()=>{
        const ok=await permanentlyDeleteProject(p);
        if(ok){ render(); refreshWorkspace(); showToast('پروژه برای همیشه حذف شد'); }
      },'حذف همیشگی');
      actions.appendChild(perm);
    }
    row.appendChild(actions); return row;
  }

  function appendSection(title, items, mode){
    const titleEl=document.createElement('div'); titleEl.className='mgmt-project-section-title'; titleEl.textContent=title; body.appendChild(titleEl);
    if(!items.length){ const empty=document.createElement('div'); empty.className='mgmt-empty'; empty.textContent=mode==='active'?'پروژه فعالی وجود ندارد.':(mode==='archived'?'پروژه آرشیو شده‌ای وجود ندارد.':'پروژه حذف شده‌ای وجود ندارد.'); body.appendChild(empty); return; }
    const wrap=document.createElement('div'); wrap.className='mgmt-list-wrap'; items.forEach(p=>wrap.appendChild(makeRow(p,mode))); body.appendChild(wrap);
  }

  if(managementProjectTab==='all'){
    appendSection('پروژه‌های فعال',active,'active');
    appendSection('آرشیو شده ها',archived,'archived');
    appendSection('حذف شده ها',deleted,'deleted');
  }else if(managementProjectTab==='archived') appendSection('آرشیو شده ها',archived,'archived');
  else appendSection('حذف شده ها',deleted,'deleted');
}

let projDragState = null;
function startProjectMgmtDrag(e,id,rowEl,containerEl,type){
  if(!containerEl || e.button===2) return;
  const siblingEls=Array.from(containerEl.querySelectorAll('.mgmt-row'));
  projDragState={id,type,siblingEls,hoverEl:null,hoverPos:null,rowEl,pointerId:e.pointerId};
  rowEl.classList.add('row-dragging');
  try{ e.currentTarget.setPointerCapture(e.pointerId); }catch(_){}
  document.addEventListener('pointermove',onProjDragMove);
  document.addEventListener('pointerup',onProjDragEnd,{once:true});
  document.addEventListener('pointercancel',onProjDragEnd,{once:true});
}
function onProjDragMove(e){
  if(!projDragState) return;
  const others=projDragState.siblingEls.filter(el=>el!==projDragState.rowEl);
  let target=null,pos=null;
  for(const el of others){
    const r=el.getBoundingClientRect();
    if(e.clientY < r.top+r.height/2){ target=el;pos='before';break; }
  }
  if(!target && others.length){ target=others[others.length-1];pos='after'; }
  others.forEach(el=>el.classList.remove('drag-over-top','drag-over-bottom'));
  if(target) target.classList.add(pos==='before'?'drag-over-top':'drag-over-bottom');
  projDragState.hoverEl=target;
  projDragState.hoverPos=pos;
}
function onProjDragEnd(){
  if(!projDragState) return;
  const data=getData();
  document.removeEventListener('pointermove',onProjDragMove);
  document.removeEventListener('pointercancel',onProjDragEnd);
  const st=projDragState;
  st.rowEl.classList.remove('row-dragging');
  st.siblingEls.forEach(el=>el.classList.remove('drag-over-top','drag-over-bottom'));
  projDragState=null;

  const {id,type,hoverEl,hoverPos}=st;
  if(!hoverEl) return;
  const targetId=hoverEl.dataset.dragId;
  if(!targetId || targetId===id) return;

  const ids=data.projects
    .filter(p=>{
      if(type==='active') return !p.trashed&&!p.archived&&!isPendingDeleted('project',p.id);
      if(type==='archived') return p.archived&&!p.trashed&&!isPendingDeleted('project',p.id);
      if(type==='deleted') return (p.trashed||isPendingDeleted('project',p.id));
      return false;
    })
    .map(p=>p.id);

  const from=ids.indexOf(id), target=ids.indexOf(targetId);
  if(from<0 || target<0) return;
  ids.splice(from,1);
  let to=ids.indexOf(targetId);
  if(hoverPos==='after') to++;
  ids.splice(to,0,id);

  const movable=new Set(ids);
  const byId=new Map(data.projects.filter(p=>movable.has(p.id)).map(p=>[p.id,p]));
  let n=0;
  data.projects=data.projects.map(p=>movable.has(p.id)?byId.get(ids[n++]):p);

  persist();
  render();
  refreshWorkspace();
}


return { render, reset(){ managementProjectTab='all'; }, setTab(value){ managementProjectTab=value; }, getTab(){ return managementProjectTab; } };
}
export default createProjectManagementView;
