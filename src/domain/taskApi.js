import { projectItemRepository } from '../data/projectItemRepository.js';
import { projectRepository } from '../data/projectRepository.js';
import { taskRuntimeModule } from '../modules/tasks/taskRuntimeModule.js';
import { getSession } from '../core/session.js';
import { canDeleteTask } from './deleteGuard.js';
import { isOffline } from './mergePolicy.js';
import { markDirty as adapterMarkDirty, persist as adapterPersist } from '../sync/persistAdapter.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function clampLimit(limit){
  const n = Number(limit);
  if(!Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(n)));
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
    live.tasks = Array.isArray(stored.tasks) ? stored.tasks : [];
  }
  if(typeof window !== 'undefined'){
    adapterMarkDirty(projectId);
    adapterPersist({ local:false });
  }
}

export const taskApi = {
  get(projectId, itemId){
    return projectItemRepository.get(projectId, itemId);
  },

  lookup(projectId, itemId){
    const item = projectItemRepository.get(projectId, itemId);
    return item && !item.trashed ? item : null;
  },

  listPage(projectId, { cursor = 0, limit = DEFAULT_LIMIT, includeTrashed = false } = {}){
    const start = Math.max(0, Number(cursor) || 0);
    const size = clampLimit(limit);
    const all = projectItemRepository.list(projectId)
      .filter(item => includeTrashed || !item.trashed);
    return {
      items: all.slice(start, start + size),
      cursor: start + size < all.length ? start + size : null,
    };
  },

  trash(projectId, itemId, subtaskId = null){
    if(isOffline()) return deny('offline', 'برای ثبت تغییرات به اینترنت متصل شوید');
    if(!projectId || !itemId) return deny('invalid', 'آیتم نامعتبر است');
    const project = projectRepository.find(projectId);
    const access = canWriteProject(project);
    if(!access.ok) return access;

    const check = canDeleteTask(projectRepository.getProjectsList(), itemId, subtaskId);
    if(!check.ok) return deny('in_use', 'این آیتم در قرارداد استفاده شده و حذف نمی‌شود', { refs: check.refs });

    const deleted = taskRuntimeModule.softDelete(projectId, itemId, subtaskId);
    if(!deleted) return deny('conflict', 'حذف آیتم انجام نشد');
    publishLive(projectId);
    return allow();
  },
};
