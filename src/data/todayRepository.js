import { projectRepository } from './projectRepository.js';
import { isWork } from '../domain/wbs/normalize.js';

function updateTarget(nodes, ref, updater){
  let updated = null;
  const visit = (nodes || []).map(node => {
    if(!node) return node;
    if(ref.kind === 'work' && isWork(node) && String(node.id) === String(ref.id)){
      updated = updater(node);
      return updated;
    }
    if(ref.kind === 'task' && isWork(node) && String(node.id) === String(ref.workId)){
      const workTasks = (node.workTasks || []).map(task => {
        if(String(task?.id) !== String(ref.id)) return task;
        updated = updater(task);
        return updated;
      });
      return updated ? { ...node, workTasks } : node;
    }
    const nested = updateTarget(node.subtasks, ref, updater);
    if(nested.updated){
      updated = nested.updated;
      return { ...node, subtasks:nested.nodes };
    }
    return node;
  });
  return { nodes:visit, updated };
}

export class TodayRepository{
  constructor(projectRepo = projectRepository){ this.projectRepository = projectRepo; }

  update(projectId, ref, updater){
    let updated = null;
    const saved = this.projectRepository.updateProject(projectId, project => {
      const result = updateTarget(project.tasks || [], ref, updater);
      updated = result.updated;
      return updated ? { ...project, tasks:result.nodes } : project;
    });
    return saved && updated ? updated : null;
  }
}

export const todayRepository = new TodayRepository();
