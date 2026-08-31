/**
 * Phase 3 pure merge policy.
 * - Anti-empty overwrite for collections
 * - updatedAt only when BOTH sides have it; otherwise keep local
 * - projectDirty protects metadata; collectionDirty protects that collection
 */

function asArray(value){
  return Array.isArray(value) ? value : [];
}

function idKey(item){
  if(!item || item.id == null) return null;
  return String(item.id);
}

function hasUpdatedAt(item){
  return item && item.updatedAt != null && Number.isFinite(Number(item.updatedAt));
}

/**
 * When both records have updatedAt, newer wins.
 * If either lacks updatedAt → keep local (no guessed overwrite).
 */
export function pickRecordByConflict(localItem, cloudItem){
  if(!localItem) return cloudItem || null;
  if(!cloudItem) return localItem;
  if(hasUpdatedAt(localItem) && hasUpdatedAt(cloudItem)){
    return Number(cloudItem.updatedAt) > Number(localItem.updatedAt) ? cloudItem : localItem;
  }
  return localItem;
}

/**
 * @param {object[]} localItems
 * @param {object[]} cloudItems
 * @param {{ dirty?: boolean, pending?: boolean, collectionDirty?: boolean }} flags
 * @returns {{ items: object[], needsRepair: boolean, keptLocalEmptyCloud: boolean }}
 */
export function mergeCollection(localItems, cloudItems, flags = {}){
  const local = asArray(localItems).filter(Boolean);
  const cloud = asArray(cloudItems).filter(Boolean);
  const forceLocal = !!(flags.dirty || flags.pending || flags.collectionDirty);

  if(forceLocal){
    return {
      items: local.length ? local : cloud,
      needsRepair: cloud.length < local.length,
      keptLocalEmptyCloud: false,
    };
  }

  // Cloud explicitly empty, local non-empty → keep local, repair later
  if(cloud.length === 0 && local.length > 0){
    return { items: local, needsRepair: true, keptLocalEmptyCloud: true };
  }

  // Cloud missing treated as empty array by caller; same rule
  if(local.length === 0){
    return { items: cloud, needsRepair: false, keptLocalEmptyCloud: false };
  }

  const byId = new Map();
  local.forEach(item => {
    const key = idKey(item);
    if(key) byId.set(key, item);
  });
  cloud.forEach(item => {
    const key = idKey(item);
    if(!key) return;
    if(!byId.has(key)) byId.set(key, item);
    else byId.set(key, pickRecordByConflict(byId.get(key), item));
  });

  const items = Array.from(byId.values());
  const needsRepair = items.length > cloud.length;
  return { items, needsRepair, keptLocalEmptyCloud: false };
}

/**
 * Metadata when project is dirty: keep local fields.
 * When not dirty: prefer cloud if defined, else local.
 */
export function mergeProjectMetadata(localProject, cloudMeta, { projectDirty = false } = {}){
  const local = localProject || {};
  const cloud = cloudMeta || {};
  if(projectDirty){
    return {
      name: local.name ?? cloud.name,
      completedOpen: local.completedOpen !== undefined ? !!local.completedOpen : !!cloud.completedOpen,
      trashed: local.trashed !== undefined ? !!local.trashed : !!cloud.trashed,
      archived: local.archived !== undefined ? !!local.archived : !!cloud.archived,
      ownerUid: local.ownerUid ?? cloud.ownerUid,
      ownerEmail: local.ownerEmail ?? cloud.ownerEmail,
      sharedWith: Array.isArray(local.sharedWith) ? local.sharedWith : (cloud.sharedWith || []),
    };
  }
  return {
    name: cloud.name !== undefined && cloud.name !== null ? cloud.name : local.name,
    completedOpen: cloud.completedOpen !== undefined ? !!cloud.completedOpen : !!local.completedOpen,
    trashed: cloud.trashed !== undefined ? !!cloud.trashed : !!local.trashed,
    archived: cloud.archived !== undefined ? !!cloud.archived : !!local.archived,
    ownerUid: cloud.ownerUid !== undefined ? cloud.ownerUid : local.ownerUid,
    ownerEmail: cloud.ownerEmail !== undefined ? cloud.ownerEmail : local.ownerEmail,
    sharedWith: Array.isArray(cloud.sharedWith) ? cloud.sharedWith : (local.sharedWith || []),
  };
}

/** Guard before pushing collection to cloud: never upload empty over non-empty store. */
export function shouldUploadCollection(storeItems, payloadItems){
  const store = asArray(storeItems);
  const payload = asArray(payloadItems);
  if(store.length > 0 && payload.length === 0) return false;
  return true;
}

export function isOffline(){
  if(typeof navigator === 'undefined') return false;
  return navigator.onLine === false;
}
