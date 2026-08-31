import { projectItemRepository } from '../../data/projectItemRepository.js';
import { projectRepository } from '../../data/projectRepository.js';
import { canDeleteTask } from '../../domain/deleteGuard.js';
import { createTaskView } from './taskView.js';

const makeItem=(id,text)=>({id,text,done:false,starred:false,cost:null,activities:[],subtasks:[],completedAt:null});

/** Domain runtime for the existing Project.tasks/task.subtasks model. */
export class TaskRuntimeModule{
  constructor(repository=projectItemRepository,{uid=()=>`i${Math.random().toString(36).slice(2,10)}`,afterMutation=()=>{}}={}){
    this.repository=repository;
    this.uid=uid;
    this.afterMutation=afterMutation;
  }
  createUI(dependencies){ return createTaskView(this,dependencies); }
  configure(runtime={}){
    if(runtime.uid) this.uid=runtime.uid;
    if(runtime.afterMutation) this.afterMutation=runtime.afterMutation;
    return this;
  }
  list(projectId){ return this.repository.list(projectId); }
  get(projectId,itemId){ return this.repository.get(projectId,itemId); }
  findSubtask(projectId,itemId,subtaskId){
    let found=null;
    const walk=items=>(items||[]).some(item=>String(item.id)===String(subtaskId) ? (found=item,true) : walk(item.subtasks));
    const task=this.get(projectId,itemId); if(task) walk(task.subtasks);
    return found;
  }
  changed(projectId,value){ if(value) this.afterMutation(projectId); return value; }
  create(projectId,text){
    const value=String(text||'').trim(); if(!value) return null;
    return this.changed(projectId,this.repository.save(projectId,makeItem(this.uid(),value)));
  }
  createSubtask(projectId,itemId,text,parentId=null){
    const value=String(text||'').trim(); if(!value) return null;
    return this.changed(projectId,this.repository.addSubtask(projectId,itemId,parentId||itemId,makeItem(this.uid(),value)));
  }
  update(projectId,itemId,patch){
    return this.changed(projectId,this.repository.update(projectId,itemId,item=>({...item,...(typeof patch==='function'?patch(item):patch)})));
  }
  updateSubtask(projectId,itemId,subtaskId,patch){
    return this.changed(projectId,this.repository.updateSubtask(projectId,itemId,subtaskId,item=>({...item,...(typeof patch==='function'?patch(item):patch)})));
  }
  toggleCompleted(projectId,itemId,subtaskId=null){
    const descendants=(items,done)=>(items||[]).map(child=>({...child,done,completedAt:done?Date.now():null,subtasks:descendants(child.subtasks,done)}));
    const apply=item=>({done:!item.done,completedAt:!item.done?Date.now():null,subtasks:descendants(item.subtasks,!item.done)});
    if(subtaskId){
      const sub=this.findSubtask(projectId,itemId,subtaskId);
      const value=this.updateSubtask(projectId,itemId,subtaskId,apply);
      if(sub?.done) this.update(projectId,itemId,item=>item.done?{done:false,completedAt:null}:{});
      return value;
    }
    return this.update(projectId,itemId,apply);
  }
  toggleStarred(projectId,itemId,subtaskId=null){
    const apply=item=>({starred:!item.starred});
    return subtaskId ? this.updateSubtask(projectId,itemId,subtaskId,apply) : this.update(projectId,itemId,apply);
  }
  softDelete(projectId,itemId,subtaskId=null){
    const check=canDeleteTask(projectRepository.getProjectsList(), itemId, subtaskId);
    if(!check.ok) return null;
    return this.changed(projectId,subtaskId ? this.repository.softDeleteSubtask(projectId,itemId,subtaskId) : this.repository.softDelete(projectId,itemId));
  }
  restore(projectId,itemId,subtaskId=null){ return this.changed(projectId,this.repository.restore(projectId,itemId,subtaskId)); }
  reorder(projectId,itemId,orderedIds,parentId=null){ return this.changed(projectId,this.repository.reorder(projectId,itemId,orderedIds,parentId)); }
  permanentDelete(projectId,itemId,subtaskId=null){ return this.changed(projectId,this.repository.remove(projectId,itemId,subtaskId)); }
}



export const taskRuntimeModule=new TaskRuntimeModule();
export default taskRuntimeModule;
