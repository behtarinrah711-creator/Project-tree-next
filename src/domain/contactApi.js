import { contactRepository } from '../data/contactRepository.js';
import { projectRepository } from '../data/projectRepository.js';
import { getSession } from '../core/session.js';
import { canDeleteContact } from './deleteGuard.js';
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
    live.contacts = Array.isArray(stored.contacts) ? stored.contacts : [];
  }
  if(typeof window !== 'undefined'){
    adapterMarkDirty(projectId);
    adapterPersist({ local:false });
  }
}

export const contactApi = {
  get(projectId, contactId){
    return contactRepository.get(projectId, contactId);
  },

  lookup(projectId, contactId){
    const contact = contactRepository.get(projectId, contactId);
    return contact && !contact.trashed ? contact : null;
  },

  listPage(projectId, { cursor = 0, limit = DEFAULT_LIMIT, includeTrashed = false } = {}){
    const start = Math.max(0, Number(cursor) || 0);
    const size = clampLimit(limit);
    const all = contactRepository.list(projectId)
      .filter(contact => includeTrashed || !contact.trashed);
    return {
      items: all.slice(start, start + size),
      cursor: start + size < all.length ? start + size : null,
    };
  },

  save(projectId, draft){
    if(isOffline()) return deny('offline', 'برای ثبت تغییرات به اینترنت متصل شوید');
    if(!projectId || !draft) return deny('invalid', 'مخاطب نامعتبر است');
    const project = projectRepository.find(projectId);
    const access = canWriteProject(project);
    if(!access.ok) return access;

    const id = draft.id || makeId();
    const current = draft.id ? contactRepository.get(projectId, draft.id) : null;
    const record = { ...(current || {}), ...draft, id };
    if(!current) record.createdAt = record.createdAt || Date.now();
    else record.updatedAt = Date.now();

    if(!contactRepository.save(projectId, record)) return deny('conflict', 'ذخیره مخاطب انجام نشد');
    publishLive(projectId);
    return allow({ contact: record });
  },

  trash(projectId, contactId){
    if(isOffline()) return deny('offline', 'برای ثبت تغییرات به اینترنت متصل شوید');
    if(!projectId || !contactId) return deny('invalid', 'مخاطب نامعتبر است');
    const project = projectRepository.find(projectId);
    const access = canWriteProject(project);
    if(!access.ok) return access;
    if(!contactRepository.get(projectId, contactId)) return deny('not_found', 'مخاطب پیدا نشد');

    const check = canDeleteContact(projectRepository.getProjectsList(), contactId);
    if(!check.ok) return deny('in_use', 'این مخاطب قابل حذف نیست؛ هنوز در سیستم استفاده شده است', { refs: check.refs });

    if(!contactRepository.softDelete(projectId, contactId)) return deny('conflict', 'حذف مخاطب انجام نشد');
    publishLive(projectId);
    return allow();
  },
};
