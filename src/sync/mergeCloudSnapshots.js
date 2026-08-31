import { dirtyProjectIds, pendingCloudWrites } from './storeSyncState.js';

/**
 * Phase 7.2 — merge owned cloud docs into local project list.
 * Sharing/collaborator fork removed (product Phase 5/6). Behavior for owner + guest preserved.
 */

export function mergeOwnedCloudSnapshots({
  ownedDocs = [],
  localProjects,
  appDataStore,
  currentUser = null,
  docToProject,
  preservedActive = null,
  preservedMode = 'simple',
  preservedStarredOrder = [],
} = {}){
  const local = Array.isArray(localProjects) ? localProjects : appDataStore.getProjects();
  const dirty = dirtyProjectIds(appDataStore);
  const pending = pendingCloudWrites(appDataStore);
  const map = {};
  const localById = {};
  local.forEach(lp => { localById[lp.id] = lp; });

  ownedDocs.forEach(doc => {
    map[doc.id] = docToProject(doc, localById[doc.id]);
  });

  if(local){
    local.forEach(localP => {
      if((dirty.has(localP.id) || pending.has(localP.id)) && map[localP.id]){
        map[localP.id] = localP;
      }
    });
  }

  const prevOrder = local.map(p => p.id);

  // Keep guest/local-only and dirty owned missing briefly from snapshot
  if(local){
    local.forEach(localP => {
      if(map[localP.id]) return;
      if(localP.ownerUid && currentUser && localP.ownerUid !== currentUser.uid) return;
      if(localP.ownerUid && currentUser && localP.ownerUid === currentUser.uid){
        if(dirty.has(localP.id) || pending.has(localP.id)){
          map[localP.id] = localP;
        }
        return;
      }
      map[localP.id] = localP;
    });
  }

  let projects = Object.values(map);
  if(prevOrder.length){
    const byId = {};
    projects.forEach(p => { byId[p.id] = p; });
    const ordered = [];
    prevOrder.forEach(id => {
      if(byId[id]){ ordered.push(byId[id]); delete byId[id]; }
    });
    Object.keys(byId).forEach(id => ordered.push(byId[id]));
    projects = ordered;
  }

  return {
    projects,
    activeTab: preservedActive,
    viewMode: preservedMode,
    starredOrder: Array.isArray(preservedStarredOrder) ? preservedStarredOrder.slice() : [],
  };
}
