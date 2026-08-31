import { isDirty, isPending, markPending, acknowledgePending } from './storeSyncState.js';

/**
 * Phase 7.3 — task subcollection write + listen helpers.
 * Anti-empty merge behavior must stay identical to prior legacy path.
 */

/**
 * Write task records in chunks of 450 (Firestore batch limit safety).
 */
export async function writeTaskRecordsNormalized(ctx, pid, tasks){
  if(!ctx?.cloudMode || !ctx.currentUser || !ctx.db) return;
  const col = ctx.taskCollection(pid);
  const records = (tasks || []).map(ctx.normalizeTaskRecord);
  for(let i = 0; i < records.length; i += 450){
    const batch = ctx.db.batch();
    records.slice(i, i + 450).forEach(t => {
      const ref = col.doc(t.id);
      batch.set(ref, { ...t, projectId: pid, schemaVersion: ctx.DATA_SCHEMA_VERSION });
    });
    await batch.commit();
  }
}

/**
 * Merge incoming cloud tasks with local + recovery; never wipe non-empty local with empty cloud.
 */
export function mergeTaskSnapshot(incoming, localTasks, recoveryTasks, normalizeTaskRecord){
  const byId = new Map();
  [...incoming, ...recoveryTasks, ...localTasks].forEach(t => {
    if(t && t.id && !byId.has(String(t.id))) byId.set(String(t.id), normalizeTaskRecord(t));
  });
  return Array.from(byId.values());
}

/**
 * Install task collection listener. Returns unsubscribe function.
 */
export function attachCloudTaskListener(ctx, p){
  if(!ctx.cloudMode || !p || !p.ownerUid) return null;
  const projectId = p.id;
  return ctx.taskCollection(projectId).onSnapshot(snap => {
    const current = ctx.findProject(projectId);
    if(!current) return;
    const incoming = snap.docs.map(d => ctx.normalizeTaskRecord({ id: d.id, ...d.data() }));
    const localTasks = Array.isArray(current.tasks) ? current.tasks.map(ctx.normalizeTaskRecord) : [];
    const recoveryTasks = ctx.getRecoveredLocalTasks(current);
    const merged = mergeTaskSnapshot(incoming, localTasks, recoveryTasks, ctx.normalizeTaskRecord);
    if(!incoming.length && !merged.length) return;
    if(!merged.length) return;
    current.tasks = merged;
    ctx.rememberProjectTasks(current);
    if(merged.length > incoming.length && !isDirty(ctx.appDataStore, projectId) && !isPending(ctx.appDataStore, projectId)){
      markPending(ctx.appDataStore, projectId);
      writeTaskRecordsNormalized(ctx, projectId, merged)
        .finally(() => acknowledgePending(ctx.appDataStore, projectId));
    }
    current.schemaVersion = ctx.DATA_SCHEMA_VERSION;
    ctx.persistLocalFromCloud?.();
    ctx.onTaskUiRefresh?.(projectId);
  }, err => console.warn('task listener', projectId, err));
}
