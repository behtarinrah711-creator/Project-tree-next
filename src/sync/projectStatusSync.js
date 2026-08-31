import { STORAGE_KEYS } from '../config/deploymentConfig.js';
/**
 * Project trashed/archived status cloud sync + offline queue.
 * Sole owner of status write/verify/retry — Auth/session provided by caller ctx.
 */

const QUEUE_KEY = STORAGE_KEYS.projectStatusQueue;
let projectStatusRetryTimer = null;

export function readProjectStatusQueue({ storage = localStorage } = {}){
  try{ return JSON.parse(storage.getItem(QUEUE_KEY) || '{}') || {}; }catch(e){ return {}; }
}

export function writeProjectStatusQueue(q, { storage = localStorage } = {}){
  try{ storage.setItem(QUEUE_KEY, JSON.stringify(q || {})); }catch(e){}
}

export function queueProjectStatus(p, { storage = localStorage } = {}){
  if(!p || !p.id) return;
  const q = readProjectStatusQueue({ storage });
  q[p.id] = { trashed: !!p.trashed, archived: !!p.archived, at: Date.now() };
  writeProjectStatusQueue(q, { storage });
}

export function dequeueProjectStatus(pid, { storage = localStorage } = {}){
  const q = readProjectStatusQueue({ storage });
  if(q[pid]){ delete q[pid]; writeProjectStatusQueue(q, { storage }); }
}

/**
 * @param {object} ctx { cloudMode, currentUser, db, DATA_SCHEMA_VERSION, firebase }
 */
export async function writeProjectStatusVerified(ctx, p){
  if(!ctx?.cloudMode || !ctx.currentUser || !p || !p.ownerUid) return { ok:false, skipped:true };
  if(p.ownerUid !== ctx.currentUser.uid) return { ok:false, skipped:true };

  const ref = ctx.db.collection('projects').doc(p.id);
  const payload = {
    trashed: !!p.trashed,
    archived: !!p.archived,
    schemaVersion: ctx.DATA_SCHEMA_VERSION,
    updatedAt: ctx.firebase.firestore.FieldValue.serverTimestamp()
  };

  await ref.set(payload, { merge:true });

  const verify = await ref.get({ source:'server' });
  if(!verify.exists){
    throw Object.assign(new Error('Project document disappeared after status write'), { code:'verification-failed' });
  }
  const d = verify.data() || {};
  if(!!d.trashed !== !!p.trashed || !!d.archived !== !!p.archived){
    throw Object.assign(new Error('Project status verification mismatch'), { code:'verification-failed' });
  }
  return { ok:true };
}

export async function flushProjectStatusQueue(ctx){
  if(!ctx?.cloudMode || !ctx.currentUser || (typeof navigator !== 'undefined' && !navigator.onLine)) return;
  const q = readProjectStatusQueue();
  const ids = Object.keys(q);
  if(!ids.length) return;

  for(const pid of ids){
    const p = ctx.findProject?.(pid);
    if(!p || !p.ownerUid || p.ownerUid !== ctx.currentUser.uid){
      dequeueProjectStatus(pid);
      continue;
    }
    const latest = { ...p, trashed: !!p.trashed, archived: !!p.archived };
    try{
      await writeProjectStatusVerified(ctx, latest);
      dequeueProjectStatus(pid);
    }catch(err){
      console.warn('queued project status sync failed', pid, err);
      if(ctx.isPermissionError?.(err)){
        dequeueProjectStatus(pid);
      }
      break;
    }
  }
}

export function scheduleProjectStatusRetry(ctx){
  clearTimeout(projectStatusRetryTimer);
  projectStatusRetryTimer = setTimeout(()=>{
    projectStatusRetryTimer = null;
    flushProjectStatusQueue(ctx);
  }, 5000);
}

export async function cloudSyncProjectStatus(ctx, p){
  if(!ctx?.cloudMode || !ctx.currentUser || !p || !p.ownerUid) return false;
  if(p.ownerUid !== ctx.currentUser.uid) return false;

  try{
    const result = await writeProjectStatusVerified(ctx, p);
    if(result.ok){
      dequeueProjectStatus(p.id);
      return true;
    }
    return false;
  }catch(err){
    console.warn('project status sync failed', p.id, err);
    if(ctx.isRetryableCloudError?.(err)){
      queueProjectStatus(p);
      scheduleProjectStatusRetry(ctx);
    }else{
      dequeueProjectStatus(p.id);
    }
    return false;
  }
}

export default {
  readProjectStatusQueue, writeProjectStatusQueue, queueProjectStatus, dequeueProjectStatus,
  writeProjectStatusVerified, flushProjectStatusQueue, scheduleProjectStatusRetry, cloudSyncProjectStatus,
};
