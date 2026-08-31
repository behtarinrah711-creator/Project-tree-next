/**
 * Phase 6.4 — Owned-only cloud listener ownership.
 * Behavior: identical to prior legacy path — ownerUid == uid only, no sharedWith.
 * mergePolicy / anti-empty remain in merge + applyCloudSnapshot callers.
 * Auth is not owned here.
 */

let unsubOwned = null;
let unsubShared = null; // always kept null (sharing removed)

/**
 * @param {object} ctx
 * @param {FirebaseFirestore} ctx.db
 * @param {string} ctx.uid
 * @param {(ownedDocs: any[], sharedDocs: any[]) => void} ctx.onOwnedSnapshot
 * @param {(err: any) => void} [ctx.onError]
 */
export function startOwnedCloudListeners(ctx){
  stopOwnedCloudListeners();
  if(!ctx?.db || !ctx.uid) return;
  const sharedDocs = [];
  unsubOwned = ctx.db.collection('projects').where('ownerUid', '==', ctx.uid)
    .onSnapshot(
      snap => { ctx.onOwnedSnapshot?.(snap.docs, sharedDocs); },
      err => { ctx.onError?.(err); }
    );
  unsubShared = null;
}

export function stopOwnedCloudListeners(){
  try{ unsubOwned?.(); }catch(_){}
  try{ unsubShared?.(); }catch(_){}
  unsubOwned = null;
  unsubShared = null;
}

export function isSharedCloudDisabled(){
  return true;
}
