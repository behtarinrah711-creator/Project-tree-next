function getCurrentProject(){ const id=getCurrentProjectScopeId(); return id ? findProject(id) : null; }
function getContacts(project=getCurrentProject()){
  if(!project) return [];
  normalizeProjectScopedData(project);
  return project.contacts;
}
function findContact(id, project=getCurrentProject()){ return getContacts(project).find(c=>c.id===id)||null; }
function openContactsPage(){ closeBottomPages(); enterWorkspaceSurface(); workspaceSubpage='contacts'; showOnlyWorkspacePage('contactsPage'); renderContactsPage(); pushWorkspaceHistory('contacts'); }
function renderContactsPage(){
  const module=window.KarhaApp?.modules?.get('people');
  if(module?.render) module.render(getCurrentProject()?.id);
}

function getActivityTemplates(project=getCurrentProject()){
  if(!project) return [];
  normalizeProjectScopedData(project);
  return project.activityTemplates;
}
function findActivityTemplate(id, project=getCurrentProject()){ return getActivityTemplates(project).find(a=>a.id===id) || null; }
function openProjectActivitiesPage(){
  closeBottomPages(); enterWorkspaceSurface(); workspaceSubpage='activities';
  showOnlyWorkspacePage('projectActivitiesPage');
  renderProjectActivitiesPage();
  pushWorkspaceHistory('activities');
}
function renderProjectActivitiesPage(){
  const module=window.KarhaApp?.modules?.get('activities');
  if(module?.render) module.render(getCurrentProject()?.id);
}
function openActivityEditForm(activity){ return window.KarhaApp?.modules?.get('activities')?.openActivityEditForm(activity); }
function openActivityForm(){ return window.KarhaApp?.modules?.get('activities')?.openActivityForm(); }
function requestCloseActivityForm(fromPopState=false){ return window.KarhaApp?.modules?.get('activities')?.requestCloseActivityForm(fromPopState); }

function permanentlyDeleteGlobalRecord(entry){
  if(!entry || !entry.record) return false;
  if(entry.type==='contact' || entry.type==='activity'){
    const check=canDeleteProjectRecord(entry.type,entry.id);
    if(!check.ok){ showRecordDeleteBlocked(entry.type,check.refs); return false; }
  }
  if(entry.type==='project') return permanentlyDeleteProject(entry.record);
  if(entry.type==='contact'){
    const p=findProject(entry.projectId); if(!p) return false; p.contacts=getContacts(p).filter(x=>x.id!==entry.id); markDirty(p.id); return true;
  }
  if(entry.type==='activity'){
    const p=findProject(entry.projectId); if(!p) return false; p.activityTemplates=getActivityTemplates(p).filter(x=>x.id!==entry.id); markDirty(p.id); return true;
  }
  if(entry.type==='task') return !!window.KarhaApp?.taskRuntime?.permanentDelete(entry.projectId,entry.id);
  if(entry.type==='subtask') return !!window.KarhaApp?.taskRuntime?.permanentDelete(entry.projectId,entry.rootTaskId||entry.parentId,entry.id);
  return false;
}

function restoreGlobalRecord(entry){
  if(!entry || !entry.record) return false;
  if(entry.type==='project'){
    const p=findProject(entry.id); if(!p) return false;
    p.trashed=false; delete p.deletedAt; delete p.deletedType; cloudSyncProjectStatus(p); setActiveTab(p.id); return true;
  }
  if(entry.type==='contact'){
    const p=findProject(entry.projectId); const c=findContact(entry.id,p); if(!c) return false;
    c.trashed=false; delete c.deletedAt; delete c.deletedType; markDirty(p.id); return true;
  }
  if(entry.type==='activity'){
    const p=findProject(entry.projectId); const a=findActivityTemplate(entry.id,p); if(!a) return false;
    a.trashed=false; delete a.deletedAt; delete a.deletedType; markDirty(p.id); return true;
  }
  if(entry.type==='task') return !!window.KarhaApp?.taskRuntime?.restore(entry.projectId,entry.id);
  if(entry.type==='subtask') return !!window.KarhaApp?.taskRuntime?.restore(entry.projectId,entry.rootTaskId||entry.parentId,entry.id);
  return false;
}

let projectTrashView=null;
function addTrashSourceBadge(container,type){ return projectTrashView?.addSourceBadge(container,type); }
function appendTrashActions(actions,entry){ return projectTrashView?.appendActions(actions,entry); }
function collectProjectTrashedRecords(projectId){ return projectTrashView?.collect(projectId)||[]; }
function renderProjectTrashPage(){ return projectTrashView?.render(); }
function openProjectTrashPage(){
  closeBottomPages(); enterWorkspaceSurface(); ensureHomeSelection(); workspaceSubpage='projectTrash';
  setBottomNavActive('Settings'); showOnlyWorkspacePage('projectTrashPage'); renderProjectTrashPage(); updateWorkspaceContextBar();
}

function refreshCurrentFooterPage(){
  const active=document.querySelector('.bottom-nav-item.active');
  if(!active || active.id==='bottomProjectsBtn'){
    if(!document.querySelector('.page-overlay:not(.hidden)')) renderAll();
    return;
  }
  renderTabs();
  if(active.id==='bottomReportsBtn'){
    workspaceSubpage=null; showOnlyWorkspacePage('reportsPage'); renderReportsWorkspace(); updateWorkspaceContextBar(); return;
  }
  if(active.id==='bottomAccountingBtn'){
    workspaceSubpage=null; showOnlyWorkspacePage('accountingPage'); renderAccountingWorkspace(); updateWorkspaceContextBar(); return;
  }
  if(active.id==='bottomSettingsBtn'){
    if(workspaceSubpage==='projectTrash'){
      showOnlyWorkspacePage('projectTrashPage'); renderProjectTrashPage();
    } else {
      workspaceSubpage=null; showOnlyWorkspacePage('settingsPage'); renderSettingsWorkspace();
    }
    updateWorkspaceContextBar(); return;
  }
  renderAll();
}

function commitActiveContactDraft(){ try{ if(typeof window.__commitContactDraft==='function') window.__commitContactDraft(); }catch(e){} }
function navigateFooter(moduleId){
  commitActiveContactDraft(); leaveMenuRootForFooter(); ensureHomeSelection();
  const projectId=getCurrentProjectScopeId();
  if(projectId) window.KarhaApp?.projectWorkspace?.selectProject?.(projectId,{moduleId});
}

const browserDocument=globalThis.document;
const closeProjectTrashPage=browserDocument?.getElementById('closeProjectTrashPage');
if(closeProjectTrashPage) closeProjectTrashPage.onclick=()=>{
  workspaceSubpage=null; showOnlyWorkspacePage('settingsPage'); setBottomNavActive('Settings');
  renderTabs(); renderSettingsWorkspace(); updateWorkspaceContextBar();
};

const taskUI = window.KarhaApp.taskRuntime.createUI({
  getData:()=>data, document:browserDocument, requestAnimationFrame:globalThis.requestAnimationFrame, setTimeout, isPendingDeleted, elFromHtml,
  formatCost, formatCostDisplay, projectCostSum, taskCostSum, svgPlus, svgGrip, svgChevron, svgTrash,
  svgCheck, svgStar, itemChildren, findNestedItem, findProject, findTask, findSub, walkItems,
  toggleTaskDone, toggleSubDone, toggleTaskStar, toggleSubStar, removeFromStarredOrder,
  openConfirm, showToast, renderAll, refreshStarredPartial, softDelete,
  isFloatingConfirmUser, persist, markDirty, openNumpadGeneric, addTrashSourceBadge, appendTrashActions
});
const {renderProjectView,refreshProjectPartial,renderInlineAddRow,renderTaskBlock,renderStarredView,
  buildStarredGroup,openTaskDetail,openSubDetail,closeSheet,renderSheet}=taskUI;
projectTrashView=window.KarhaApp.createProjectTrashView({
  document:browserDocument,setTimeout,getActiveProjectId:()=>{ const id=getActiveTab(); return id&&id!=='starred'?id:null; },
  findProject,walkItems,getContacts,getActivityTemplates,findActivityTemplate,taskView:taskUI,
  restoreRecord:restoreGlobalRecord,permanentlyDeleteRecord:permanentlyDeleteGlobalRecord,
  persist,refreshWorkspace:renderAll,refreshContacts:renderContactsPage,
  refreshActivities:renderProjectActivitiesPage,showToast,openConfirm,
  createWorkspaceSearch,workspaceTextMatch
});

function openDrawer(){ return window.KarhaWorkspaceChrome?.openDrawer?.(); }
function closeDrawer(){ return window.KarhaWorkspaceChrome?.closeDrawer?.(); }
function openConfirm(text, onOk, okLabel){ return window.KarhaUI?.openConfirm?.(text, onOk, okLabel); }

const drawerProjectsBtn=browserDocument?.getElementById('drawerProjectsBtn');
if(drawerProjectsBtn) drawerProjectsBtn.onclick=()=>{ closeDrawer(); openProjectsPage(); };
const drawerAddProjectBtn=browserDocument?.getElementById('drawerAddProjectBtn');
if(drawerAddProjectBtn) drawerAddProjectBtn.onclick=()=>{ closeDrawer(); openCreatePage(); };
const drawerGlobalTrashBtn=browserDocument?.getElementById('drawerGlobalTrashBtn');
if(drawerGlobalTrashBtn) drawerGlobalTrashBtn.onclick=openGlobalTrashFromDrawer;
const closeProjectsPage=browserDocument?.getElementById('closeProjectsPage');
if(closeProjectsPage) closeProjectsPage.onclick=()=>{ closeMenuRootPage(false); };

async function permanentlyDeleteProject(p){
  if(!p) return false;
  if(pendingDelete && pendingDelete.type==='project' && pendingDelete.pid===p.id){
    clearTimeout(pendingDelete.timeoutId); pendingDelete=null; hideUndoToast();
  }
  try{await cloudRuntime.lifecycle.permanentlyDelete(p);}catch(e){
    console.warn('permanent project delete failed',e); showToast('حذف همیشگی پروژه روی سرور انجام نشد'); return false;
  }
  data.projects=data.projects.filter(x=>x.id!==p.id);
  if(getActiveTab()===p.id){
    const next=data.projects.find(x=>!x.trashed&&!x.archived) || data.projects.find(x=>!x.trashed) || data.projects.find(x=>!x.archived);
    setActiveTab(next ? next.id : 'starred');
  }
  persist(); return true;
}

const projectManagementView=window.KarhaApp.createProjectManagementView({
  document:browserDocument,getData:()=>data,projectsVisibleForAuth,isPendingDeleted,svgGrip,svgTrash,
  openMiniPrompt,renameProject:(id,name)=>window.KarhaApp?.projectApi?.rename?.(id,name),
  cloudRenameProject,findProject,archiveProject:(id,value)=>window.KarhaApp?.projectApi?.archive?.(id,value),
  setActiveTab,getActiveTab,cloudSyncProjectStatus,refreshWorkspace:renderAll,showToast,
  openExportPage,openConfirm,softDelete,undoPendingDelete,persist,permanentlyDeleteProject
});
function renderManagementPage(){ return projectManagementView.render(); }
function openProjectsPage(){
  menuRootMode='projects'; projectManagementView.reset();
  closeBottomPages(); enterWorkspaceSurface(); ensureHomeSelection(); setBottomNavActive('Projects');
  pushMenuRootHistory('projects'); showOnlyWorkspacePage('projectsPage'); updateWorkspaceContextBar(); renderManagementPage();
}

function openExportPage(pid){ if(window.KarhaExportView?.openExportPage) return window.KarhaExportView.openExportPage(pid); }

if(typeof navigator!=='undefined' && 'serviceWorker' in navigator){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('sw.js',{updateViaCache:'none'}).then(reg=>{
      try{ reg.update(); }catch(e){}
      if(reg.waiting){ reg.waiting.postMessage({type:'SKIP_WAITING'}); }
    }).catch(()=>{});
  });
  navigator.serviceWorker.addEventListener('controllerchange', ()=>{
    if(!window.__swReloaded155){ window.__swReloaded155=true; location.reload(); }
  });
}

function returnToSettingsWorkspace(){
  workspaceSubpage=null; setBottomNavActive('Settings'); renderTabs(); showOnlyWorkspacePage('settingsPage');
  renderSettingsWorkspace(); updateWorkspaceContextBar();
}
const closeProjectActivitiesPage=browserDocument?.getElementById('closeProjectActivitiesPage');
if(closeProjectActivitiesPage) closeProjectActivitiesPage.onclick=returnToSettingsWorkspace;
const closeContactsPage=browserDocument?.getElementById('closeContactsPage');
if(closeContactsPage) closeContactsPage.onclick=()=>{ window.KarhaApp?.modules?.get('people')?.resetContactFormShell?.(); returnToSettingsWorkspace(); };
const contactAddBtn=browserDocument?.getElementById('contactAddBtn');
if(contactAddBtn) contactAddBtn.onclick=()=>window.KarhaApp?.modules?.get('people')?.openContactForm();
const activityAddBtn=browserDocument?.getElementById('activityAddBtn');
if(activityAddBtn) activityAddBtn.onclick=openActivityForm;
