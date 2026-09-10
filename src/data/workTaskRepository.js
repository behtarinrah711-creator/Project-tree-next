import { projectRepository } from './projectRepository.js';
import { findInTree, isWork } from '../domain/wbs/normalize.js';
import { normalizeWorkTask } from '../domain/wbs/workTaskModel.js';

function updateWork(nodes, workId, updater){
  let changed = false;
  const visit = (nodes || []).map(node => {
    if(String(node?.id) === String(workId) && isWork(node)){
      changed = true;
      return updater(node);
    }
    const subtasks = updateWork(node?.subtasks, workId, updater);
    if(subtasks.changed){
      changed = true;
      return { ...node, subtasks:subtasks.nodes };
    }
    return node;
  });
  return { nodes:visit, changed };
}

export class WorkTaskRepository{
  constructor(projectRepo = projectRepository){ this.projectRepository = projectRepo; }

  work(projectId, workId){
    const project = this.projectRepository.find(projectId);
    const found = findInTree(project?.tasks || [], workId);
    return found && isWork(found.item) ? found.item : null;
  }

  list(projectId, workId){
    const work = this.work(projectId, workId);
    return (work?.workTasks || []).filter(task => task && !task.trashed)
      .map(task => normalizeWorkTask(task, workId));
  }

  get(projectId, workId, taskId){
    return this.list(projectId, workId).find(task => String(task.id) === String(taskId)) || null;
  }

  mutate(projectId, workId, updater){
    const saved = this.projectRepository.updateProject(projectId, project => {
      const result = updateWork(project.tasks || [], workId, updater);
      return result.changed ? { ...project, tasks:result.nodes } : project;
    });
    return saved ? this.work(projectId, workId) : null;
  }

  save(projectId, workId, task, { clearWorkPredecessors = false } = {}){
    const normalized = normalizeWorkTask(task, workId);
    const work = this.mutate(projectId, workId, current => ({
      ...current,
      predecessorIds:clearWorkPredecessors ? [] : current.predecessorIds,
      workTasks:[...(current.workTasks || []), normalized],
    }));
    return work ? normalized : null;
  }

  update(projectId, workId, taskId, updater){
    let updated = null;
    this.mutate(projectId, workId, work => ({
      ...work,
      workTasks:(work.workTasks || []).map(task => {
        if(String(task?.id) !== String(taskId)) return task;
        const next = typeof updater === 'function' ? updater(task) : updater;
        updated = normalizeWorkTask(next, workId);
        return updated;
      }),
    }));
    return updated;
  }
}

export const workTaskRepository = new WorkTaskRepository();
