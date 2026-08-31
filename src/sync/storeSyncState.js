/**
 * D5 synchronization-state boundary.
 *
 * Sync services receive AppDataStore itself rather than loose Set references.
 * This prevents callers from constructing a second dirty/pending context while
 * keeping the runtime-only D4 state out of the persisted snapshot.
 */
export function requireSyncStore(store){
  if(!store || typeof store.getProjects !== 'function'){
    throw new TypeError('AppDataStore is required for synchronization');
  }
  return store;
}

export function dirtyProjectIds(store){
  return requireSyncStore(store).getDirtyProjectIds();
}

export function pendingCloudWrites(store){
  return requireSyncStore(store).getPendingCloudWrites();
}

export function markPending(store, projectId){
  requireSyncStore(store).markCloudWritePending(projectId);
}

export function acknowledgePending(store, projectId){
  requireSyncStore(store).clearCloudWritePending(projectId);
}

export function isPending(store, projectId){
  return requireSyncStore(store).isCloudWritePending(projectId);
}

export function isDirty(store, projectId){
  return requireSyncStore(store).isProjectDirty(projectId);
}
