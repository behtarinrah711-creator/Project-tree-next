import { activityRepository } from '../data/activityRepository.js';
import { projectRepository } from '../data/projectRepository.js';
import { getSession } from '../core/session.js';
import { canDeleteActivity } from './deleteGuard.js';
import { isOffline } from './mergePolicy.js';
import { markDirty as adapterMarkDirty, persist as adapterPersist } from '../sync/persistAdapter.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function clampLimit(limit){
  const n = Number(limit);
  if(!Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(n)));
}

function makeId(){
  return 'i' + Math.random().toString(36).slice(2, 10);
}

function deny(code, message, extra = {}){
  return { ok:false, code, message, ...extra };
}

function allow(extra = {}){
  return { ok:true, ...extra };
}

function canWriteProject(project){
  if(!project) return deny('not_found', 'پروژه پیدا نشد');
  const session = getSession();
  if(session.ready && !session.uid && project.ownerUid){
    return deny('forbidden', 'این پروژه در حالت مهمان قابل ویرایش نیست');
  }
  return allow();
}

function publishLive(projectId){
  const stored = projectRepository.find(projectId);
  const live = typeof window !== 'undefined' ? window.KarhaLegacy?.getProject?.(projectId) : null;
  if(live && stored){
    live.activityTemplates = Array.isArray(stored.activityTemplates) ? stored.activityTemplates : [];
  }
  // Cloud adapter remains the existing legacy persist path. It is not a second
  // domain writer: the repository already persisted the activity collection.
  if(typeof window !== 'undefined'){
    adapterMarkDirty(projectId);
    // Activity is already in the isolated app-data snapshot via the repository. persist must
    // not rewrite localStorage; it only flushes the cloud adapter.
    adapterPersist({ local:false });
  }
}

export const activityApi = {
  get(projectId, activityId){
    return activityRepository.get(projectId, activityId);
  },

  lookup(projectId, activityId){
    const activity = activityRepository.get(projectId, activityId);
    return activity && !activity.trashed ? activity : null;
  },

  listPage(projectId, { cursor = 0, limit = DEFAULT_LIMIT, includeTrashed = false } = {}){
    const start = Math.max(0, Number(cursor) || 0);
    const size = clampLimit(limit);
    const all = activityRepository.list(projectId)
      .filter(activity => includeTrashed || !activity.trashed);
    return {
      items: all.slice(start, start + size),
      cursor: start + size < all.length ? start + size : null,
    };
  },

  save(projectId, draft){
    if(isOffline()) return deny('offline', 'برای ثبت تغییرات به اینترنت متصل شوید');
    if(!projectId || !draft) return deny('invalid', 'فعالیت نامعتبر است');
    const project = projectRepository.find(projectId);
    const access = canWriteProject(project);
    if(!access.ok) return access;

    const name = String(draft.name || '').trim();
    if(!name) return deny('invalid', 'نام فعالیت را وارد کنید');

    const id = draft.id || makeId();
    const duplicate = activityRepository.list(projectId).some(item =>
      String(item.id) !== String(id)
      && !item.trashed
      && String(item.name || '').trim() === name
    );
    if(duplicate) return deny('conflict', 'این فعالیت قبلاً ثبت شده است');

    const current = draft.id ? activityRepository.get(projectId, draft.id) : null;
    const record = { ...(current || {}), ...draft, id, name, trashed:false };
    if(!current) record.createdAt = record.createdAt || Date.now();
    else record.updatedAt = Date.now();

    if(!activityRepository.save(projectId, record)) return deny('conflict', 'ذخیره فعالیت انجام نشد');
    publishLive(projectId);
    return allow({ activity: record });
  },

  trash(projectId, activityId){
    if(isOffline()) return deny('offline', 'برای ثبت تغییرات به اینترنت متصل شوید');
    if(!projectId || !activityId) return deny('invalid', 'فعالیت نامعتبر است');
    const project = projectRepository.find(projectId);
    const access = canWriteProject(project);
    if(!access.ok) return access;
    if(!activityRepository.get(projectId, activityId)) return deny('not_found', 'فعالیت پیدا نشد');

    const check = canDeleteActivity(projectRepository.getProjectsList(), activityId);
    if(!check.ok) return deny('in_use', 'این فعالیت قابل حذف نیست؛ هنوز در سیستم استفاده شده است', { refs: check.refs });

    if(!activityRepository.softDelete(projectId, activityId)) return deny('conflict', 'حذف فعالیت انجام نشد');
    publishLive(projectId);
    return allow();
  },
};
