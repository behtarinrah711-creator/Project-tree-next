import { projectRepository } from './projectRepository.js';

/**
 * Project-scoped persistence boundary for project items.
 *
 * Project items intentionally remain in Project.tasks. This repository keeps
 * the existing data shape and delegates storage-key handling to
 * ProjectRepository.
 */
export class ProjectItemRepository{
  constructor(projectRepo = projectRepository){
    this.projectRepository = projectRepo;
  }

  list(projectId){
    return this.projectRepository.scoped(projectId, 'tasks');
  }

  listPage(projectId, { cursor = 0, limit = 50, includeTrashed = false } = {}){
    const start = Math.max(0, Number(cursor) || 0);
    const size = Math.min(200, Math.max(1, Number(limit) || 50));
    const all = this.list(projectId).filter(item => includeTrashed || !item.trashed);
    return {
      items: all.slice(start, start + size),
      cursor: start + size < all.length ? start + size : null,
    };
  }

  get(projectId, itemId){
    if(!itemId) return null;
    return this.list(projectId).find(item =>
      String(item.id) === String(itemId)
    ) || null;
  }

  save(projectId, item){
    if(!projectId || !item) return null;

    const saved=this.projectRepository.updateProject(projectId, project => {
      const tasks=Array.isArray(project.tasks) ? [...project.tasks] : [];
      const index=tasks.findIndex(current => String(current.id) === String(item.id));
      if(index >= 0) tasks[index]=item;
      else tasks.push(item);
      return {...project,tasks};
    });

    return saved ? item : null;
  }

  update(projectId, itemId, updater){
    if(!projectId || !itemId) return null;
    const current=this.get(projectId,itemId);
    if(!current) return null;

    const updated=typeof updater === 'function' ? updater(current) : updater;
    if(!updated) return null;
    return this.save(projectId,updated);
  }

  softDelete(projectId, itemId){
    return this.update(projectId,itemId,item => ({
      ...item,
      trashed:true,
      deletedAt:Date.now(),
      deletedType:'task',
    }));
  }

  updateSubtask(projectId,itemId,subtaskId,updater){
    if(!subtaskId) return null;
    let result=null;
    const visit=items=>(items||[]).map(item=>{
      if(String(item.id)===String(subtaskId)){
        result=typeof updater==='function' ? updater(item) : updater;
        return result || item;
      }
      if(!Array.isArray(item.subtasks)) return item;
      return {...item,subtasks:visit(item.subtasks)};
    });
    const saved=this.update(projectId,itemId,item=>({...item,subtasks:visit(item.subtasks)}));
    return saved && result ? result : null;
  }

  addSubtask(projectId,itemId,parentId,subtask){
    if(!subtask) return null;
    if(String(parentId||itemId)===String(itemId)){
      const saved=this.update(projectId,itemId,item=>({...item,subtasks:[...(item.subtasks||[]),subtask]}));
      return saved ? subtask : null;
    }
    let added=false;
    const append=items=>(items||[]).map(item=>{
      if(String(item.id)===String(parentId)){
        added=true;
        return {...item,subtasks:[...(item.subtasks||[]),subtask]};
      }
      return Array.isArray(item.subtasks) ? {...item,subtasks:append(item.subtasks)} : item;
    });
    const saved=this.update(projectId,itemId,item=>({...item,subtasks:append(item.subtasks)}));
    return saved && added ? subtask : null;
  }

  softDeleteSubtask(projectId,itemId,subtaskId){
    return this.updateSubtask(projectId,itemId,subtaskId,item=>({...item,trashed:true,deletedAt:Date.now(),deletedType:'subtask',deletedParentId:itemId}));
  }

  restore(projectId,itemId,subtaskId=null){
    const restoreItem=item=>{
      const restored={...item,trashed:false};
      delete restored.deletedAt; delete restored.deletedType; delete restored.deletedParentId;
      return restored;
    };
    return subtaskId ? this.updateSubtask(projectId,itemId,subtaskId,restoreItem) : this.update(projectId,itemId,restoreItem);
  }

  remove(projectId,itemId,subtaskId=null){
    if(!subtaskId){
      const saved=this.projectRepository.updateProject(projectId,project=>({...project,tasks:(project.tasks||[]).filter(item=>String(item.id)!==String(itemId))}));
      return saved ? true : null;
    }
    let removed=false;
    const strip=items=>(items||[]).filter(item=>{ if(String(item.id)===String(subtaskId)){ removed=true; return false; } return true; }).map(item=>Array.isArray(item.subtasks)?{...item,subtasks:strip(item.subtasks)}:item);
    const saved=this.update(projectId,itemId,item=>({...item,subtasks:strip(item.subtasks)}));
    return saved && removed ? true : null;
  }

  reorder(projectId,itemId,orderedIds,parentId=null){
    const reorderList=list=>{
      const rank=new Map(orderedIds.map((id,index)=>[String(id),index]));
      return [...(list||[])].sort((a,b)=>(rank.get(String(a.id))??Number.MAX_SAFE_INTEGER)-(rank.get(String(b.id))??Number.MAX_SAFE_INTEGER));
    };
    if(!parentId) {
      const tasks=this.list(projectId);
      const ordered=reorderList(tasks);
      const projectSaved=this.projectRepository.updateProject(projectId,project=>({...project,tasks:ordered}));
      return projectSaved ? ordered : null;
    }
    const targetId=String(parentId)===String(itemId) ? null : parentId;
    if(!targetId) return this.update(projectId,itemId,item=>({...item,subtasks:reorderList(item.subtasks)}));
    return this.updateSubtask(projectId,itemId,targetId,parent=>({...parent,subtasks:reorderList(parent.subtasks)}));
  }
}

export const projectItemRepository = new ProjectItemRepository();
