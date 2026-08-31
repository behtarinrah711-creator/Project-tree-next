const DATA_SCHEMA_VERSION = 8;
let data = null;
const foundation=window.KarhaApp.foundation;
function uid(){ return foundation.projectFactories.uid(); }
function rememberProjectTasks(p){ return cloudRuntime.cache.remember(p); }
function getRecoveredLocalTasks(p){ return cloudRuntime.cache.recover(p); }
function normalizeProjectScopedData(project){ return foundation.normalizeProjectScopedData(project); }
function loadData(){
const store=window.KarhaAppData;
if(!store?.loadFromStorage||!store?.getSnapshot) throw new Error('AppDataStore must be installed before applicationFoundation');
const hadStoredSnapshot=store.hasStoredSnapshot();
data=store.loadFromStorage();
foundation.runDataMigrations(data,{
schemaVersion:DATA_SCHEMA_VERSION,activeProjectId:store.getActiveTab(),
markDirty:projectId=>store.markProjectDirty(projectId),rememberProjectTasks,
});
if(store.getActiveTab()==='starred') store.setActiveTab(null);
if(!hadStoredSnapshot) store.persistLocal();
}
function markDirty(pid){ window.KarhaAppData.markProjectDirty(pid); }
const persistStoreSnapshot = window.KarhaApp.createPersistOrchestrator({
appDataStore: window.KarhaAppData,
rememberProjectTasks,
isCloudEnabled: ()=>isCloudMode() && !!getCurrentUser(),
findProject,
syncProject: project=>cloudSyncProjectFull(project),
onLocalError: ()=>showToast('ذخیره‌سازی با خطا مواجه شد'),
});
function persist(options){ return persistStoreSnapshot(options); }
function getActiveTab(){ return window.KarhaAppData.getActiveTab(); }
function setActiveTab(value){ return window.KarhaAppData.setActiveTab(value); }
function getViewMode(){ return window.KarhaAppData.getViewMode(); }
function setViewMode(value){ return window.KarhaAppData.setViewMode(value); }
function showToast(msg){ return window.KarhaUI.showToast(msg); }
function findProject(pid){ return window.KarhaApp.projectRepository.find(pid); }
function findTask(pid,tid){ return window.KarhaApp.taskRuntime.get(pid,tid)||null; }
function findNestedItem(items,id){ return foundation.taskTree.findNestedItem(items,id); }
function findSub(pid,tid,sid){ return window.KarhaApp.taskRuntime.findSubtask(pid,tid,sid)||null; }
function itemChildren(item){ return foundation.taskTree.itemChildren(item); }
function walkItems(items,fn,parent=null,depth=0){ return foundation.taskTree.walkItems(items,fn,parent,depth); }
function toPersianDigits(value){ return foundation.formatting.toPersianDigits(value); }
function toEnglishDigits(value){ return foundation.formatting.toEnglishDigits(value); }
function formatCost(value){ return foundation.formatting.formatCost(value); }
function formatCostDisplay(value){ return foundation.formatting.formatCostDisplay(value); }
function taskCostSum(task){ return foundation.taskTree.taskCostSum(task); }
function projectCostSum(project){ return foundation.taskTree.projectCostSum(project,{isPendingDeleted}); }
function normalizeEmail(email){ return foundation.featurePolicy.normalizeEmail(email); }
function isFloatingConfirmUser(){ return foundation.featurePolicy.isFloatingConfirmUser(getCurrentUser()); }
function removeFromStarredOrder(pid, tid){
if(!data.starredOrder || !data.starredOrder.length) return;
const key = pid + ':' + tid;
const idx = data.starredOrder.indexOf(key);
if(idx !== -1) data.starredOrder.splice(idx, 1);
}
function toggleTaskDone(pid, tid){
const t = findTask(pid, tid); if(!t) return;
window.KarhaApp?.taskRuntime?.toggleCompleted(pid,tid);
removeFromStarredOrder(pid, tid);
renderAll();
}
function toggleSubDone(pid, tid, sid){
const s = findSub(pid, tid, sid); if(!s) return;
const changed=window.KarhaApp?.taskRuntime?.toggleCompleted(pid,tid,sid);
if(changed && !changed.done){ removeFromStarredOrder(pid, tid); } else {
const p = findProject(pid); if(p) p.completedOpen = true;
}
renderAll();
}
function toggleTaskStar(pid, tid){ window.KarhaApp?.taskRuntime?.toggleStarred(pid,tid); renderAll(); }
function toggleSubStar(pid, tid, sid){ window.KarhaApp?.taskRuntime?.toggleStarred(pid,tid,sid); renderAll(); }
function deleteTask(pid, tid){
closeSheet();
softDelete('task', pid, tid, null, 'کار حذف شد');
}
function deleteSub(pid, tid, sid){
softDelete('sub', pid, tid, sid, 'زیرمجموعه حذف شد');
}
function addTaskToProject(pid, text){
if(window.KarhaApp?.taskRuntime?.create(pid,text)) renderAll();
}
function addSubToTask(pid, tid, text, parentId=null){
const child=window.KarhaApp?.taskRuntime?.createSubtask(pid,tid,text,parentId);
if(child) renderAll();
return child;
}
function addProject(name){
if(!name || !name.trim()) return;
const created=window.KarhaApp?.projectApi?.create?.({name:name.trim()});
if(!created?.ok) return;
const p=findProject(created.project.id) || created.project;
if(isCloudMode() && getCurrentUser()){
cloudRuntime.createProject(p);
}
setActiveProject(p.id,{updateRoute:true,render:true,moduleId:'dashboard'});
}
function setWorkspaceRoute(projectId, moduleId='dashboard'){
if(!projectId) return;
return window.KarhaApp?.projectWorkspace?.selectProject?.(projectId,{moduleId});
}
function replaceWorkspaceRoute(projectId, moduleId='dashboard'){
if(!projectId) return;
return window.KarhaApp?.projectWorkspace?.selectProject?.(projectId,{moduleId,replace:true});
}
function getProjectIdFromRoute(){
const m = String(location.hash || '').match(/^#\/?projects\/([^/?&#]+)/i) || String(location.hash || '').match(/^#\/?project\/([^/?&#]+)/i);
if(!m || !m[1]) return null;
try{return decodeURIComponent(m[1]);}catch(e){return m[1];}
}
function setActiveProject(projectId,{updateRoute=true,render=true,moduleId='dashboard',closeDrawerOnSelect=false}={}){
const p=findProject(projectId);
if(!p || p.trashed || p.archived) return false;
if(!getCurrentUser() && p.ownerUid) return false;
if(updateRoute){
return !!window.KarhaApp?.projectWorkspace?.selectProject?.(p.id,{
moduleId, closeDrawer:closeDrawerOnSelect,
});
}
setActiveTab(p.id);
taskUI?.setAddItemActive(false);
window.KarhaAppData.persistLocal();
if(window.KarhaApp?.projectContext) window.KarhaApp.projectContext.setProjectId(p.id);
if(closeDrawerOnSelect) closeDrawer();
if(render && !updateRoute) renderAll();
renderDrawerProjectList();
return true;
}
function projectsVisibleForAuth(list){
const all = Array.isArray(list) ? list : [];
if(!getCurrentUser()) return all.filter(p => p && !p.ownerUid);
return all.filter(p => p && (!p.ownerUid || p.ownerUid === getCurrentUser().uid));
}
function renderDrawerProjectList(){
const list=document.getElementById('drawerProjectList');
if(!list || !data) return;
const source = projectsVisibleForAuth(window.KarhaApp.projectWorkspace.listProjects());
const projects=source.filter(p=>p && !p.trashed && !p.archived && !isPendingDeleted('project',p.id));
if(!projects.length){
list.replaceChildren();
const empty=document.createElement('div'); empty.className='drawer-empty-projects'; empty.textContent='هنوز پروژه فعالی وجود ندارد. از «پروژه جدید» شروع کنید.'; list.appendChild(empty); return;
}
window.KarhaApp?.reconcileDrawerProjectList?.(list,projects,{
activeProjectId:getActiveTab(),
createRow(){
const row=document.createElement('button'); row.type='button';
const name=document.createElement('span'); name.className='drawer-project-name'; row.appendChild(name);
const count=document.createElement('span'); count.className='drawer-project-count'; row.appendChild(count);
return row;
},
updateRow(row,p,active){
row.className='drawer-project-row'+(active?' active':'');
row.querySelector('.drawer-project-name').textContent=p.name||'پروژه بدون نام';
const undone=(p.tasks||[]).filter(t=>!t.done&&!t.trashed&&!isPendingDeleted('task',p.id,t.id)).length;
row.querySelector('.drawer-project-count').textContent=toPersianDigits(String(undone));
},
onSelect(projectId){
window.KarhaApp?.projectWorkspace?.selectProject?.(projectId,{
moduleId:'dashboard', closeDrawer:true,
});
}
});
}
function openGlobalTrashFromDrawer(){
closeDrawer();
openProjectsPage();
projectManagementView.setTab('deleted');
renderManagementPage();
}
function deleteProject(pid){
softDelete('project', pid, null, null, 'پروژه حذف شد');
}
const firebaseRuntime=window.KarhaFirebaseRuntime;
const cloudRuntime=foundation.createCloudRuntime({windowRef:window,documentRef:document,schemaVersion:DATA_SCHEMA_VERSION,callbacks:{
findProject,getProjects:()=>data.projects,normalizeEmail,
persistLocalFromCloud(){ data.projects.forEach(project=>project?.id&&window.KarhaApp.applyCloudSnapshot(project)); },
onTaskUiRefresh:refreshAfterCloud,onHydrated:refreshAfterCloud,
onCloudError(error){ console.error('owned listener',error);showToast('خطا در دریافت پروژه‌های خودتان'); },
onGuest(){
loadData();
const active=getActiveTab()?findProject(getActiveTab()):null;
if(active?.ownerUid){ setActiveTab(null);window.KarhaApp.projectContext.setProjectId(null); }
renderDrawerProjectList();renderAll();
},
flushStatus:()=>flushProjectStatusQueue(),
onWriteFailure(project){ markDirty(project.id);persist(); },
syncContext(runtime,session,{db,cache,writeTasks}){ return {
cloudMode:session.cloudMode,currentUser:session.currentUser,db,appDataStore:window.KarhaAppData,normalizeEmail,
DATA_SCHEMA_VERSION,normalizeProjectScopedData,mergePolicy:window.KarhaApp.mergePolicy,
projectRepositoryFind:id=>window.KarhaApp.projectRepository.find(id),getRecoveredLocalTasks:cache.recover,
normalizeTaskRecord:runtime.normalizeTaskRecord,rememberProjectTasks:cache.remember,
writeTaskRecordsNormalized:writeTasks,isRetryableCloudError,markDirty,persist,
}; },
}});
function refreshAfterCloud(projectId){
if(String(getActiveTab())===String(projectId)&&['dashboard','tasks'].includes(window.KarhaRoute?.moduleId)) renderAll();
else refreshCurrentFooterPage();
}
function getCurrentUser(){return cloudRuntime.getSession().currentUser;}
function isCloudMode(){return cloudRuntime.getSession().cloudMode;}
function cloudDeleteProject(p){return cloudRuntime.lifecycle.remove(p);}
function cloudRenameProject(p){return cloudRuntime.lifecycle.rename(p);}
function normalizeTaskRecord(task){return cloudRuntime.normalizeTaskRecord(task);}
function taskCollection(pid){return cloudRuntime.collections.tasks(pid);}
function purchaseCollection(pid){return cloudRuntime.collections.purchases(pid);}
function estimateCollection(pid){return cloudRuntime.collections.estimates(pid);}
function taskReportCollection(pid){return cloudRuntime.collections.taskReports(pid);}
function stopCloudTaskListener(pid){return cloudRuntime.taskListeners.stop(pid);}
function startCloudTaskListener(p){return cloudRuntime.taskListeners.start(p);}
function hydrateProjectTasksFromCloud(p,d){return cloudRuntime.hydrateProject(p,d);}
function writeTaskRecordsNormalized(pid,tasks){return cloudRuntime.writeTasks(pid,tasks);}
function cloudSyncTaskDomain(p){return cloudRuntime.cloudSyncTask(p).catch(error=>console.warn('task domain sync failed; UI remains available',p.id,error));}
function isPermissionError(err){const code=String(err?.code||'').toLowerCase();return code==='permission-denied'||code.includes('permission');}
function isRetryableCloudError(err){if(!err)return true;if(isPermissionError(err))return false;return ['unavailable','deadline-exceeded','aborted','failed-precondition','resource-exhausted','internal','unknown'].includes(String(err.code||'').toLowerCase())||!err.code;}
function cloudSyncCtx(){const session=cloudRuntime.getSession();return {cloudMode:session.cloudMode,currentUser:session.currentUser,db:firebaseRuntime.db,DATA_SCHEMA_VERSION,firebase:firebaseRuntime.firebase,findProject,isPermissionError,isRetryableCloudError};}
function flushProjectStatusQueue(){return window.KarhaApp?.flushProjectStatusQueue?.(cloudSyncCtx());}
function scheduleProjectStatusRetry(){return window.KarhaApp?.scheduleProjectStatusRetry?.(cloudSyncCtx());}
function cloudSyncProjectStatus(p){return window.KarhaApp?.cloudSyncProjectStatus?.(cloudSyncCtx(),p);}
function cloudSyncProjectFull(p){return cloudRuntime.cloudSyncProject(p);}
function docToProject(doc,localExisting){return window.KarhaApp.docToProjectFromCloud(doc,localExisting,{normalizeTaskRecord,getRecoveredLocalTasks,appDataStore:window.KarhaAppData,normalizeEmail,mergePolicy:window.KarhaApp.mergePolicy});}
function findProjectRecordReferences(type,id){
return foundation.projectRecordReferences.findProjectRecordReferences(data.projects,type,id);
}
function canDeleteProjectRecord(type,id){
return foundation.projectRecordReferences.canDeleteProjectRecord(data.projects,type,id);
}
function showRecordDeleteBlocked(type, refs){
const noun = type === 'contact' ? 'مخاطب'
: (type === 'activity' ? 'فعالیت'
: (type === 'task' ? 'آیتم پروژه'
: (type === 'sub' || type === 'subtask' ? 'زیرآیتم پروژه' : 'مورد')));
const places = (refs || []).map(r=>r.label).filter(Boolean);
const uniquePlaces = [...new Set(places)];
const where = uniquePlaces.length ? ' (استفاده در: '+uniquePlaces.join('، ')+')' : '';
showToast('این '+noun+' قابل حذف نیست؛ هنوز در سیستم استفاده شده است'+where);
return false;
}
function isPendingDeleted(type, pid, tid, sid){
if(window.KarhaSoftDelete?.isPendingDeleted) return window.KarhaSoftDelete.isPendingDeleted(type, pid, tid, sid);
return false;
}
function softDelete(type, pid, tid, sid, label){
if(window.KarhaSoftDelete?.softDelete) return window.KarhaSoftDelete.softDelete(type, pid, tid, sid, label);
return false;
}
function softDeleteProjectRecord(type, id, label){
if(window.KarhaSoftDelete?.softDeleteProjectRecord) return window.KarhaSoftDelete.softDeleteProjectRecord(type, id, label);
return false;
}
function finalizePendingDelete(){
if(window.KarhaSoftDelete?.finalizePendingDelete) return window.KarhaSoftDelete.finalizePendingDelete();
}
function undoPendingDelete(){
if(window.KarhaSoftDelete?.undoPendingDelete) return window.KarhaSoftDelete.undoPendingDelete();
}
function showUndoToast(label){
if(window.KarhaSoftDelete?.showUndoToast) return window.KarhaSoftDelete.showUndoToast(label);
}
function hideUndoToast(){
if(window.KarhaSoftDelete?.hideUndoToast) return window.KarhaSoftDelete.hideUndoToast();
}
function onProjectSoftDeletedFinalize(pid){
if(getActiveTab() === pid){
const nextVisible = (data.projects||[]).find(pr => pr.id !== pid && !pr.trashed && !pr.archived);
setActiveTab(nextVisible ? nextVisible.id : null);
}
}
function getCurrentProjectScopeId(){
const id = data && getActiveTab() && getActiveTab()!=='starred' ? getActiveTab() : null;
return id && findProject(id) ? id : null;
}
function svgCheck(){ return foundation.taskIcons.check(); }
function svgStar(filled){ return foundation.taskIcons.star(filled); }
function svgChevron(){ return foundation.taskIcons.chevron(); }
function svgTrash(){ return foundation.taskIcons.trash(); }
function svgPlus(){ return foundation.taskIcons.plus(); }
