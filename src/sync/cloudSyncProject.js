import { markPending, acknowledgePending } from './storeSyncState.js';
import { mergeTaskRecords } from './taskRecordMerge.js';

/**
 * Phase 7.4 — full project cloud sync (metadata + tasks).
 * shouldUploadCollection / anti-empty payload rules preserved.
 */

export function buildProjectCloudPayload(p, store, policy, normalizeEmail, DATA_SCHEMA_VERSION){
  const sharedNorm = (p.sharedWith || []).map(e => normalizeEmail(e)).filter(Boolean);
  const pickCol = (key) => {
    const fromStore = Array.isArray(store?.[key]) ? store[key] : [];
    const fromLive = Array.isArray(p[key]) ? p[key] : [];
    if(policy?.shouldUploadCollection && !policy.shouldUploadCollection(fromStore, fromLive)){
      return fromStore;
    }
    if(fromLive.length === 0 && fromStore.length > 0) return fromStore;
    return fromLive.length ? fromLive : fromStore;
  };
  return {
    name: p.name,
    type: 'project',
    completedOpen: !!p.completedOpen,
    ownerUid: p.ownerUid,
    ownerEmail: normalizeEmail(p.ownerEmail),
    sharedWith: sharedNorm,
    trashed: !!p.trashed,
    archived: !!p.archived,
    contacts: pickCol('contacts'),
    activityTemplates: pickCol('activityTemplates'),
    contractTemplates: pickCol('contractTemplates'),
    contracts: pickCol('contracts'),
    schemaVersion: DATA_SCHEMA_VERSION,
  };
}

/**
 * @param {object} ctx
 * @param {object} p project
 * @returns {Promise<boolean>} resolves true only after metadata and all task records commit.
 */
export function cloudSyncProjectFull(ctx, p){
  if(!ctx.cloudMode || !ctx.currentUser || !p || !p.ownerUid) return Promise.resolve(false);
  markPending(ctx.appDataStore, p.id);
  const sharedNorm = (p.sharedWith || []).map(e => ctx.normalizeEmail(e)).filter(Boolean);
  p.sharedWith = sharedNorm;
  ctx.normalizeProjectScopedData?.(p);
  const store = ctx.projectRepositoryFind?.(p.id) || p;
  const policy = ctx.mergePolicy;
  const payload = buildProjectCloudPayload(p, store, policy, ctx.normalizeEmail, ctx.DATA_SCHEMA_VERSION);

  return ctx.db.collection('projects').doc(p.id).set(payload, { merge: true })
    .then(async () => {
      const recovered = ctx.getRecoveredLocalTasks(p);
      const mergedTasks = mergeTaskRecords(
        [Array.isArray(p.tasks) ? p.tasks : [], recovered],
        ctx.normalizeTaskRecord,
      );
      p.tasks = mergedTasks;
      ctx.rememberProjectTasks(p);
      await ctx.writeTaskRecordsNormalized(p.id, mergedTasks);
      return true;
    })
    .then(result => {
      acknowledgePending(ctx.appDataStore, p.id);
      return result;
    })
    .catch(err => {
      acknowledgePending(ctx.appDataStore, p.id);
      console.warn('cloud project sync failed; UI remains available:', p.id, err);
      if(ctx.isRetryableCloudError?.(err)){
        ctx.markDirty(p.id);
        ctx.persist?.();
      }
      throw err;
    });
}
