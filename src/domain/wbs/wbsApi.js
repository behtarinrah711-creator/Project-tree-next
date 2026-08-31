import { projectItemRepository } from '../../data/projectItemRepository.js';
import { projectRepository } from '../../data/projectRepository.js';
import { uid } from '../../data/projectFactories.js';
import { markDirty as adapterMarkDirty, persist as adapterPersist } from '../../sync/persistAdapter.js';
import { stampCreate, stampUpdate } from './timestamps.js';
import {
  KIND_STAGE,
  KIND_WORK,
  activityIdsOf,
  canAcceptChild,
  findInTree,
  itemKind,
  isStage,
  isWork,
  normalizeItem,
} from './normalize.js';
import { projectEstimateTotal, rollupEstimate, rollupProgress } from './estimate.js';

function publish(projectId){
  if(typeof window !== 'undefined'){
    adapterMarkDirty(projectId);
    adapterPersist({ local:false });
  }
}

function roots(projectId){
  return projectItemRepository.list(projectId) || [];
}

function locate(projectId, itemId){
  return findInTree(roots(projectId), itemId);
}

function persistNode(projectId, located, next){
  if(!located) return null;
  if(!located.parent){
    return projectItemRepository.save(projectId, next);
  }
  const root = located.rootId;
  return projectItemRepository.updateSubtask(projectId, root, located.item.id, () => next);
}

function makeNode(kind, text, extra = {}, clock){
  return stampCreate({
    id: extra.id || uid(),
    kind,
    text: String(text || '').trim(),
    done: false,
    starred: false,
    cost: extra.unitCost ?? null,
    activities: extra.activityIds || extra.activities || [],
    activityIds: extra.activityIds || extra.activities || [],
    subtasks: [],
    completedAt: null,
    status: 'not_started',
    progress: 0,
    quantity: extra.quantity ?? 0,
    unit: extra.unit || '',
    unitCost: extra.unitCost ?? 0,
    type: kind === KIND_WORK ? (extra.type || '') : '',
    priority: extra.priority || '',
    description: extra.description || '',
  }, clock);
}

export const wbsApi = {
  list(projectId){
    return roots(projectId).map(normalizeItem);
  },

  get(projectId, itemId){
    const found = locate(projectId, itemId);
    return found ? normalizeItem(found.item) : null;
  },

  createStage(projectId, text, parentId = null, clock){
    const title = String(text || '').trim();
    if(!projectId || !title) return null;
    const node = makeNode(KIND_STAGE, title, {}, clock);
    if(!parentId){
      const saved = projectItemRepository.save(projectId, node);
      if(saved) publish(projectId);
      return saved;
    }
    const parent = locate(projectId, parentId);
    if(!parent || !canAcceptChild(parent.item, KIND_STAGE)) return null;
    const saved = projectItemRepository.addSubtask(projectId, parent.rootId, parentId, node);
    if(saved) publish(projectId);
    return saved;
  },

  createWorkItem(projectId, text, parentId = null, extra = {}, clock){
    const title = String(text || '').trim();
    if(!projectId || !title) return null;
    const node = makeNode(KIND_WORK, title, extra, clock);
    if(!parentId){
      const saved = projectItemRepository.save(projectId, node);
      if(saved) publish(projectId);
      return saved;
    }
    const parent = locate(projectId, parentId);
    if(!parent || !canAcceptChild(parent.item, KIND_WORK)) return null;
    const saved = projectItemRepository.addSubtask(projectId, parent.rootId, parentId, node);
    if(saved) publish(projectId);
    return saved;
  },

  updateItem(projectId, itemId, patch, clock){
    const found = locate(projectId, itemId);
    if(!found) return null;
    const current = found.item;
    const applied = typeof patch === 'function' ? patch(current) : { ...current, ...patch };
    if(isWork(current) && isStage({ ...applied, kind: applied.kind })) return null;
    if(applied.status === 'completed') { applied.done = true; applied.progress = 100; applied.completedAt = applied.completedAt || Date.now(); }
    if(applied.status === 'not_started') { applied.done = false; }
    if(applied.done === true) { applied.status = 'completed'; applied.progress = 100; }
    if(applied.done === false && applied.status === 'completed') applied.status = 'not_started';
    const ids = activityIdsOf(applied);
    applied.activities = ids;
    applied.activityIds = ids;
    const next = stampUpdate(applied, clock);
    const saved = persistNode(projectId, found, next);
    if(saved) publish(projectId);
    return saved;
  },

  attachActivity(projectId, itemId, activityId, clock){
    const id = String(activityId || '').trim();
    if(!id) return null;
    const found = locate(projectId, itemId);
    if(!found || isStage(found.item)) return null;
    const ids = activityIdsOf(found.item);
    if(ids.includes(id)) return found.item;
    return this.updateItem(projectId, itemId, item => ({
      ...item,
      activities: [...ids, id],
      activityIds: [...ids, id],
    }), clock);
  },

  detachActivity(projectId, itemId, activityId, clock){
    const id = String(activityId || '').trim();
    return this.updateItem(projectId, itemId, item => {
      const ids = activityIdsOf(item).filter(x => x !== id);
      return { ...item, activities: ids, activityIds: ids };
    }, clock);
  },

  reparent(projectId, itemId, newParentId = null, beforeId = null, clock){
    if(!projectId || !itemId) return null;
    if(newParentId && String(newParentId) === String(itemId)) return null;
    const movingFound = locate(projectId, itemId);
    if(!movingFound) return null;
    if(newParentId && findInTree(movingFound.item.subtasks || [], newParentId)) return null;
    if(newParentId){
      const dest = locate(projectId, newParentId);
      if(!dest || !canAcceptChild(dest.item, itemKind(movingFound.item))) return null;
    }
    const extract = (list, id) => {
      let extracted = null;
      const next = [];
      (list || []).forEach(item => {
        if(String(item.id) === String(id)){
          extracted = item;
          return;
        }
        const child = extract(item.subtasks, id);
        next.push({ ...item, subtasks: child.list });
        extracted = extracted || child.extracted;
      });
      return { list: next, extracted };
    };
    const insert = (list, node, before) => {
      const out = [...(list || [])];
      const idx = before ? out.findIndex(item => String(item.id) === String(before)) : -1;
      if(idx >= 0) out.splice(idx, 0, node);
      else out.push(node);
      return out;
    };
    const project = projectRepository.find(projectId);
    if(!project) return null;
    const pulled = extract(project.tasks || [], itemId);
    if(!pulled.extracted) return null;
    const oldParentId = movingFound.parent?.id || null;
    const moving = stampUpdate(pulled.extracted, clock);
    const stampIf = (item, id) => String(item.id) === String(id) ? stampUpdate(item, clock) : item;
    let nextTasks;
    if(!newParentId){
      nextTasks = insert(pulled.list, moving, beforeId).map(item => stampIf(item, oldParentId));
    }else{
      const place = (list) => (list || []).map(item => {
        if(String(item.id) === String(newParentId)){
          return stampUpdate({
            ...item,
            subtasks: insert(item.subtasks, moving, beforeId),
          }, clock);
        }
        const next = { ...item, subtasks: place(item.subtasks) };
        return stampIf(next, oldParentId);
      });
      nextTasks = place(pulled.list);
    }
    const saved = projectRepository.updateProject(projectId, current => ({
      ...current,
      tasks: nextTasks,
    }));
    if(saved) publish(projectId);
    return saved ? this.get(projectId, itemId) : null;
  },

  reorder(projectId, itemId, orderedIds, parentId = null, clock){
    const saved = projectItemRepository.reorder(projectId, itemId, orderedIds, parentId);
    if(!saved) return null;
    if(!parentId){
      const stamped = roots(projectId).map(item => stampUpdate(item, clock));
      projectRepository.updateProject(projectId, project => ({ ...project, tasks: stamped }));
      publish(projectId);
      return stamped;
    }
    const parent = locate(projectId, parentId);
    if(parent){
      const next = stampUpdate({
        ...parent.item,
        subtasks: (parent.item.subtasks || []).map(child => stampUpdate(child, clock)),
      }, clock);
      persistNode(projectId, parent, next);
    }
    publish(projectId);
    return saved;
  },

  estimate(projectId){
    const project = projectRepository.find(projectId);
    const tasks = roots(projectId);
    return {
      wbs: rollupEstimate(tasks),
      general: (project?.generalConditions || []).filter(x => !x.trashed),
      generalTotal: (project?.generalConditions || []).filter(x => !x.trashed).reduce((s, x) => s + ((Number(x.quantity)||0)*(Number(x.unitCost)||0)), 0),
      projectTotal: projectEstimateTotal(tasks, (project?.generalConditions || []).filter(x => !x.trashed)),
    };
  },

  stageProgress(projectId, itemId){
    const found = locate(projectId, itemId);
    if(!found) return 0;
    return rollupProgress([found.item]);
  },
};

export default wbsApi;
