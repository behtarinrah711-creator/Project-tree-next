import { projectRepository } from '../data/projectRepository.js';
import { getSession } from '../core/session.js';
import { isProjectVisibleForSession, projectsVisibleForSession } from '../core/projectVisibility.js';
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
  if(typeof window !== 'undefined'){
    if(projectId) adapterMarkDirty(projectId);
    adapterPersist({ local:false });
  }
}

export const projectApi = {
  get(projectId){
    const project = projectRepository.find(projectId);
    return isProjectVisibleForSession(project, getSession()) ? project : null;
  },

  lookup(projectId){
    const project = this.get(projectId);
    return project && !project.trashed && !project.archived ? project : null;
  },

  listPage({ cursor = 0, limit = DEFAULT_LIMIT, includeHidden = false } = {}){
    const start = Math.max(0, Number(cursor) || 0);
    const size = clampLimit(limit);
    const all = projectsVisibleForSession(projectRepository.getProjectsList(), getSession())
      .filter(project => includeHidden || (!project.trashed && !project.archived));
    return {
      items: all.slice(start, start + size),
      cursor: start + size < all.length ? start + size : null,
    };
  },

  create({ name } = {}){
    if(isOffline()) return deny('offline', 'برای ثبت تغییرات به اینترنت متصل شوید');
    const trimmed = String(name || '').trim();
    if(!trimmed) return deny('invalid', 'نام پروژه را وارد کنید');
    const session = getSession();
    const project = {
      id: makeId(),
      name: trimmed,
      type:'project',
      tasks: [],
      contacts: [],
      activityTemplates: [],
      contractTemplates: [],
      contracts: [],
      contractStatusReports: [],
      completedOpen:false,
      archived:false,
      trashed:false,
      createdAt: Date.now(),
    };
    if(session.uid){
      project.ownerUid = session.uid;
    }
    const list = projectRepository.getProjectsList();
    list.push(project);
    projectRepository.saveProjectsList(list);
    publishLive(project.id);
    return allow({ project });
  },

  rename(projectId, name){
    if(isOffline()) return deny('offline', 'برای ثبت تغییرات به اینترنت متصل شوید');
    const trimmed = String(name || '').trim();
    if(!projectId || !trimmed) return deny('invalid', 'نام پروژه نامعتبر است');
    const project = projectRepository.find(projectId);
    const access = canWriteProject(project);
    if(!access.ok) return access;
    const saved = projectRepository.updateProject(projectId, current => ({ ...current, name: trimmed }));
    if(!saved) return deny('conflict', 'تغییر نام انجام نشد');
    publishLive(projectId);
    return allow({ project: saved });
  },

  trash(projectId){
    if(isOffline()) return deny('offline', 'برای ثبت تغییرات به اینترنت متصل شوید');
    if(!projectId) return deny('invalid', 'پروژه نامعتبر است');
    const project = projectRepository.find(projectId);
    const access = canWriteProject(project);
    if(!access.ok) return access;
    const saved = projectRepository.updateProject(projectId, current => ({
      ...current,
      trashed: true,
      deletedAt: Date.now(),
      deletedType: 'project',
    }));
    if(!saved) return deny('conflict', 'حذف پروژه انجام نشد');
    publishLive(projectId);
    return allow({ project: saved });
  },

  archive(projectId, archived = true){
    if(isOffline()) return deny('offline', 'برای ثبت تغییرات به اینترنت متصل شوید');
    if(!projectId) return deny('invalid', 'پروژه نامعتبر است');
    const project = projectRepository.find(projectId);
    const access = canWriteProject(project);
    if(!access.ok) return access;
    const saved = projectRepository.updateProject(projectId, current => ({ ...current, archived: !!archived }));
    if(!saved) return deny('conflict', 'آرشیو پروژه انجام نشد');
    publishLive(projectId);
    return allow({ project: saved });
  },
};
