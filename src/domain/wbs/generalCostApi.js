import { projectRepository } from '../../data/projectRepository.js';
import { uid } from '../../data/projectFactories.js';
import { markDirty as adapterMarkDirty, persist as adapterPersist } from '../../sync/persistAdapter.js';
import { stampCreate, stampUpdate } from './timestamps.js';
import { generalCostTotal } from './estimate.js';

function publish(projectId){
  if(typeof window !== 'undefined'){
    adapterMarkDirty(projectId);
    adapterPersist({ local:false });
  }
}

function listOf(project){
  return Array.isArray(project?.generalConditions) ? project.generalConditions : [];
}

export const generalCostApi = {
  list(projectId){
    const project = projectRepository.find(projectId);
    return listOf(project).filter(item => !item.trashed);
  },

  listAll(projectId){
    const project = projectRepository.find(projectId);
    return listOf(project);
  },

  create(projectId, title, clock){
    const name = String(title || '').trim();
    if(!projectId || !name) return null;
    const item = stampCreate({
      id: uid(),
      title: name,
      quantity: 0,
      unit: '',
      unitCost: 0,
      trashed: false,
    }, clock);
    const saved = projectRepository.updateProject(projectId, project => ({
      ...project,
      generalConditions: [...listOf(project), item],
    }));
    if(saved) publish(projectId);
    return item;
  },

  update(projectId, itemId, patch, clock){
    let next = null;
    const saved = projectRepository.updateProject(projectId, project => ({
      ...project,
      generalConditions: listOf(project).map(item => {
        if(String(item.id) !== String(itemId)) return item;
        const applied = typeof patch === 'function' ? patch(item) : { ...item, ...patch };
        next = stampUpdate(applied, clock);
        return next;
      }),
    }));
    if(saved && next) publish(projectId);
    return saved ? next : null;
  },

  remove(projectId, itemId, clock){
    return this.update(projectId, itemId, item => ({
      ...item,
      trashed: true,
      deletedAt: Date.now(),
      deletedType: 'generalCost',
    }), clock);
  },

  restore(projectId, itemId, clock){
    return this.update(projectId, itemId, item => {
      const next = { ...item, trashed: false };
      delete next.deletedAt;
      delete next.deletedType;
      return next;
    }, clock);
  },

  total(projectId){
    return generalCostTotal(this.list(projectId));
  },
};
