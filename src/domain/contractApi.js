import { contractRepository } from '../data/contractRepository.js';
import { projectRepository } from '../data/projectRepository.js';
import { getSession } from '../core/session.js';
import { canDeleteContract } from './deleteGuard.js';
import { isOffline } from './mergePolicy.js';
import { markDirty as adapterMarkDirty, persist as adapterPersist } from '../sync/persistAdapter.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function clampLimit(limit){
  const n = Number(limit);
  if(!Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(n)));
}

function createdAtValue(value){
  const n=Number(value);
  return Number.isFinite(n) && n>0 ? n : 0;
}

function newestFirst(items){
  return items
    .map((item,index)=>({item,index,createdAt:createdAtValue(item?.createdAt)}))
    .sort((a,b)=>(b.createdAt-a.createdAt)||(a.index-b.index))
    .map(entry=>entry.item);
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

function publishLive(projectId, fields = ['contracts', 'contractTemplates']){
  const stored = projectRepository.find(projectId);
  const live = typeof window !== 'undefined' ? window.KarhaLegacy?.getProject?.(projectId) : null;
  if(live && stored){
    fields.forEach(field => {
      if(Array.isArray(stored[field])) live[field] = stored[field];
    });
  }
  if(typeof window !== 'undefined'){
    adapterMarkDirty(projectId);
    adapterPersist({ local:false });
  }
}

function saveContractRecord(projectId, draft, {status = null} = {}){
  if(isOffline()) return deny('offline', 'برای ثبت تغییرات به اینترنت متصل شوید');
  if(!projectId || !draft) return deny('invalid', 'قرارداد نامعتبر است');
  const project = projectRepository.find(projectId);
  const access = canWriteProject(project);
  if(!access.ok) return access;

  const id = draft.id || makeId();
  const current = draft.id ? contractRepository.get(projectId, draft.id) : null;
  const record = { ...(current || {}), ...draft, id, trashed:false };
  if(status) record.status = status;
  if(status === 'draft'){
    record.isDraft = true;
    record.title = String(record.title || '').trim() || 'پیش‌نویس قرارداد';
  }else if(status === 'final'){
    record.isDraft = false;
  }
  if(!current) record.createdAt = record.createdAt || Date.now();
  record.updatedAt = Date.now();

  if(!contractRepository.save(projectId, record)) return deny('conflict', 'ذخیره قرارداد انجام نشد');
  publishLive(projectId, ['contracts']);
  return allow({ contract: record });
}

export const contractApi = {
  get(projectId, contractId){
    return contractRepository.get(projectId, contractId);
  },

  lookup(projectId, contractId){
    const contract = contractRepository.get(projectId, contractId);
    return contract && !contract.trashed ? contract : null;
  },

  listPage(projectId, { cursor = 0, limit = DEFAULT_LIMIT, includeTrashed = false } = {}){
    const start = Math.max(0, Number(cursor) || 0);
    const size = clampLimit(limit);
    const all = newestFirst(contractRepository.list(projectId)
      .filter(contract => includeTrashed || !contract.trashed));
    return {
      items: all.slice(start, start + size),
      cursor: start + size < all.length ? start + size : null,
    };
  },

  save(projectId, draft){
    return saveContractRecord(projectId, draft, {status:'final'});
  },

  saveDraft(projectId, draft){
    return saveContractRecord(projectId, draft, {status:'draft'});
  },

  trash(projectId, contractId){
    if(isOffline()) return deny('offline', 'برای ثبت تغییرات به اینترنت متصل شوید');
    if(!projectId || !contractId) return deny('invalid', 'قرارداد نامعتبر است');
    const project = projectRepository.find(projectId);
    const access = canWriteProject(project);
    if(!access.ok) return access;
    if(!contractRepository.get(projectId, contractId)) return deny('not_found', 'قرارداد پیدا نشد');

    const check = canDeleteContract(projectRepository.getProjectsList(), contractId);
    if(!check.ok) return deny('in_use', 'این قرارداد قابل حذف نیست؛ هنوز صورت وضعیت به آن وصل است', { refs: check.refs });

    if(!contractRepository.softDelete(projectId, contractId)) return deny('conflict', 'حذف قرارداد انجام نشد');
    publishLive(projectId, ['contracts']);
    return allow();
  },

  listTemplatesPage(projectId, { cursor = 0, limit = DEFAULT_LIMIT, includeTrashed = false } = {}){
    const start = Math.max(0, Number(cursor) || 0);
    const size = clampLimit(limit);
    const project = projectRepository.find(projectId);
    const all = (Array.isArray(project?.contractTemplates) ? project.contractTemplates : [])
      .filter(template => includeTrashed || !template.trashed);
    return {
      items: all.slice(start, start + size),
      cursor: start + size < all.length ? start + size : null,
    };
  },

  getTemplate(projectId, templateId){
    if(!projectId || !templateId) return null;
    const project = projectRepository.find(projectId);
    return (project?.contractTemplates || []).find(t => String(t.id) === String(templateId)) || null;
  },

  saveTemplate(projectId, draft, activityName = ''){
    if(isOffline()) return deny('offline', 'برای ثبت تغییرات به اینترنت متصل شوید');
    if(!projectId || !draft) return deny('invalid', 'قالب قرارداد نامعتبر است');
    const project = projectRepository.find(projectId);
    const access = canWriteProject(project);
    if(!access.ok) return access;

    const id = draft.id || makeId();
    const current = draft.id ? this.getTemplate(projectId, draft.id) : null;
    const record = JSON.parse(JSON.stringify({ ...(current || {}), ...draft, id }));
    record.title = `قرارداد ${activityName || record.title || ''}`.trim();
    record.items = (record.items || [])
      .filter(x => String(x?.text || '').trim())
      .map(x => ({
        ...x,
        children: (x.children || []).filter(c => String(c?.text || '').trim()),
      }));
    record.paymentItems = [];
    record.updatedAt = Date.now();
    record.trashed = false;
    if(!current) record.createdAt = record.createdAt || Date.now();

    const saved = projectRepository.updateProject(projectId, p => {
      const templates = Array.isArray(p.contractTemplates) ? [...p.contractTemplates] : [];
      const index = templates.findIndex(item => String(item.id) === String(id));
      if(index >= 0) templates[index] = record;
      else templates.push(record);
      return { ...p, contractTemplates: templates };
    });
    if(!saved) return deny('conflict', 'ذخیره قالب قرارداد انجام نشد');
    publishLive(projectId, ['contractTemplates']);
    return allow({ template: record });
  },

  trashTemplate(projectId, templateId){
    if(isOffline()) return deny('offline', 'برای ثبت تغییرات به اینترنت متصل شوید');
    if(!projectId || !templateId) return deny('invalid', 'قالب قرارداد نامعتبر است');
    const project = projectRepository.find(projectId);
    const access = canWriteProject(project);
    if(!access.ok) return access;
    if(!this.getTemplate(projectId, templateId)) return deny('not_found', 'قالب قرارداد پیدا نشد');

    const saved = projectRepository.updateProject(projectId, p => {
      if(!Array.isArray(p.contractTemplates)) return p;
      return {
        ...p,
        contractTemplates: p.contractTemplates.map(item =>
          String(item.id) === String(templateId)
            ? { ...item, trashed: true, deletedAt: Date.now() }
            : item
        ),
      };
    });
    if(!saved) return deny('conflict', 'حذف قالب قرارداد انجام نشد');
    publishLive(projectId, ['contractTemplates']);
    return allow();
  },
};
