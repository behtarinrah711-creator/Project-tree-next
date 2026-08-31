/** Soft-delete + undo toast — sole owner of pendingDelete state. */
export function installSoftDelete({ windowRef = globalThis, documentRef = null } = {}){
  if(windowRef.KarhaSoftDelete) return windowRef.KarhaSoftDelete;
  documentRef = documentRef || windowRef.document || null;

  let pendingDelete = null;

  function call(name, ...args){
    if(typeof windowRef[name] === 'function') return windowRef[name](...args);
    if(typeof windowRef.KarhaLegacy?.[name] === 'function') return windowRef.KarhaLegacy[name](...args);
  }

  function hideUndoToast(){
    const t = documentRef?.getElementById?.('undoToast');
    if(t) t.classList.add('hidden');
  }

  function showUndoToast(label){
    if(!documentRef) return;
    const t = documentRef.getElementById('undoToast');
    const text = documentRef.getElementById('undoToastText');
    const bar = documentRef.getElementById('undoToastBar');
    if(text) text.textContent = label || '';
    if(bar){
      bar.style.animation = 'none';
      void bar.offsetWidth;
      bar.style.animation = 'undoShrink 4s linear forwards';
    }
    if(t) t.classList.remove('hidden');
  }

  function isPendingDeleted(type, pid, tid, sid){
    if(!pendingDelete || pendingDelete.pid !== pid) return false;
    if(pendingDelete.type === 'project') return true;
    if(pendingDelete.type === 'task') return pendingDelete.tid === tid;
    if(pendingDelete.type === 'sub') return type === 'sub' && pendingDelete.tid === tid && pendingDelete.sid === sid;
    return false;
  }

  function finalizePendingDelete(){
    if(!pendingDelete) return;
    const { type, pid, tid, sid, gid, timeoutId } = pendingDelete;
    try{ clearTimeout(timeoutId); }catch(e){}
    if(type === 'project'){
      windowRef.KarhaApp?.projectApi?.trash?.(pid);
      const p = call('findProject', pid);
      if(p) call('cloudSyncProjectStatus', p);
      // Adjust active tab via legacy helper (owns data.activeTab)
      call('onProjectSoftDeletedFinalize', pid);
    } else if(type === 'task'){
      windowRef.KarhaApp?.taskApi?.trash?.(pid, tid)
        || windowRef.KarhaApp?.taskRuntime?.softDelete?.(pid, tid);
    } else if(type === 'sub'){
      windowRef.KarhaApp?.taskApi?.trash?.(pid, tid, sid)
        || windowRef.KarhaApp?.taskRuntime?.softDelete?.(pid, tid, sid);
    } else if(type === 'contact'){
      windowRef.KarhaApp?.contactApi?.trash?.(pid, gid);
    } else if(type === 'activity'){
      windowRef.KarhaApp?.activityApi?.trash?.(pid, gid);
    }
    pendingDelete = null;
    call('persist', { local:false });
    call('renderAll');
    try{
      const pp = documentRef?.getElementById?.('projectsPage');
      if(pp && !pp.classList.contains('hidden')) call('renderManagementPage');
    }catch(e){}
    call('renderContactsPage');
    call('renderProjectActivitiesPage');
    call('renderProjectTrashPage');
    hideUndoToast();
  }

  function softDelete(type, pid, tid, sid, label){
    if(type === 'task' || type === 'sub'){
      const checkId = type === 'task' ? tid : sid;
      const checkType = type === 'task' ? 'task' : 'subtask';
      const check = call('canDeleteProjectRecord', checkType, checkId);
      if(check && check.ok === false){
        call('showRecordDeleteBlocked', checkType, check.refs);
        return false;
      }
    }
    if(pendingDelete) finalizePendingDelete();
    pendingDelete = { type, pid, tid, sid };
    call('renderAll');
    try{
      if(windowRef.taskUI?.hasCurrentDetail?.()) call('renderSheet');
    }catch(e){}
    try{
      const pp = documentRef?.getElementById?.('projectsPage');
      if(type === 'project' && pp && !pp.classList.contains('hidden')) call('renderManagementPage');
    }catch(e){}
    showUndoToast(label);
    pendingDelete.timeoutId = setTimeout(finalizePendingDelete, 4000);
    return true;
  }

  function softDeleteProjectRecord(type, id, label){
    if(type === 'contact' || type === 'activity'){
      const check = call('canDeleteProjectRecord', type, id);
      if(check && check.ok === false){
        call('showRecordDeleteBlocked', type, check.refs);
        return false;
      }
    }
    if(pendingDelete) finalizePendingDelete();
    const scopeProjectId = call('getCurrentProjectScopeId');
    const p = scopeProjectId ? call('findProject', scopeProjectId) : null;
    if(!p || (type !== 'contact' && type !== 'activity')) return false;
    pendingDelete = { type, pid: scopeProjectId, tid: null, sid: null, gid: id, scopeProjectId };
    call('renderAll');
    if(type === 'contact') call('renderContactsPage');
    if(type === 'activity') call('renderProjectActivitiesPage');
    showUndoToast(label);
    pendingDelete.timeoutId = setTimeout(finalizePendingDelete, 4000);
    return true;
  }

  function undoPendingDelete(){
    if(!pendingDelete) return;
    try{ clearTimeout(pendingDelete.timeoutId); }catch(e){}
    pendingDelete = null;
    call('renderAll');
    try{
      if(windowRef.taskUI?.hasCurrentDetail?.()) call('renderSheet');
    }catch(e){}
    hideUndoToast();
  }

  if(documentRef){
    const btn = documentRef.getElementById('undoToastBtn');
    if(btn) btn.onclick = undoPendingDelete;
  }

  const api = Object.freeze({
    isPendingDeleted,
    softDelete,
    softDeleteProjectRecord,
    finalizePendingDelete,
    undoPendingDelete,
    showUndoToast,
    hideUndoToast,
    getPendingDelete: () => pendingDelete,
  });
  windowRef.KarhaSoftDelete = api;
  return api;
}

export default { installSoftDelete };
