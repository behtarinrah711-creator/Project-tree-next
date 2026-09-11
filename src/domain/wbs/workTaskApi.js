import { uid } from '../../data/projectFactories.js';
import { contactRepository } from '../../data/contactRepository.js';
import { workTaskRepository } from '../../data/workTaskRepository.js';
import { markDirty, persist } from '../../sync/persistAdapter.js';
import { WORK_TYPES } from './normalize.js';
import { TASK_PRIORITIES, activeWorkTasks, normalizeWorkTask, workTaskProgress } from './workTaskModel.js';
import { validatePredecessors } from './scheduling.js';
import { projectRepository } from '../../data/projectRepository.js';

function publish(projectId){
  if(typeof window !== 'undefined'){
    markDirty(projectId);
    persist({ local:false });
  }
}

function validDateRange(start, end){
  if(!start && !end) return true;
  return /^\d{4}\/\d{2}\/\d{2}$/.test(start) && /^\d{4}\/\d{2}\/\d{2}$/.test(end) && end >= start;
}

function validate(projectId, workId, input){
  const title = String(input?.title || '').trim();
  const weight = Number(input?.weight);
  const assigneeContactId = String(input?.assigneeContactId || '');
  const contractorContactId = String(input?.contractorContactId || '');
  if(!title) return { ok:false, code:'title' };
  if(!WORK_TYPES.includes(input?.type)) return { ok:false, code:'type' };
  if(!TASK_PRIORITIES.includes(input?.priority)) return { ok:false, code:'priority' };
  if(!Number.isFinite(weight) || weight <= 0) return { ok:false, code:'weight' };
  if(assigneeContactId && !contactRepository.get(projectId, assigneeContactId)) return { ok:false, code:'assignee' };
  if(contractorContactId && !contactRepository.get(projectId, contractorContactId)) return { ok:false, code:'contractor' };
  if(!validDateRange(input.scheduleStart || '', input.scheduleEnd || '')) return { ok:false, code:'dates' };
  if(!workTaskRepository.work(projectId, workId)) return { ok:false, code:'work' };
  return { ok:true, value:{ ...input, title, weight, assigneeContactId, contractorContactId } };
}

function syncWorkCompletion(projectId, workId){
  const work = workTaskRepository.work(projectId, workId);
  const progress = workTaskProgress(work);
  if(progress == null) return;
  workTaskRepository.mutate(projectId, workId, current => ({
    ...current,
    progress,
    done:progress === 100,
    status:progress === 100 ? 'completed' : (progress > 0 ? 'in_progress' : 'not_started'),
    completedAt:progress === 100 ? (current.completedAt || Date.now()) : null,
  }));
}

function predecessorIds(value){
  return [...new Set((Array.isArray(value) ? value : []).map(String).filter(Boolean))];
}

export const workTaskApi = {
  list:(projectId, workId) => workTaskRepository.list(projectId, workId),
  get:(projectId, workId, taskId) => workTaskRepository.get(projectId, workId, taskId),
  create(projectId, workId, draft, clock = Date.now){
    const checked = validate(projectId, workId, draft);
    if(!checked.ok) return checked;
    const now = clock(); const id = uid();
    const dependencyCheck = validatePredecessors(projectRepository.find(projectId)?.tasks || [], id, draft.predecessorIds || []);
    if(!dependencyCheck.ok) return dependencyCheck;
    const work = workTaskRepository.work(projectId, workId);
    const firstTask = activeWorkTasks(work).length === 0;
    const inherited = firstTask ? predecessorIds(work?.predecessorIds) : [];
    const inheritedDependencies = firstTask && Array.isArray(work?.dependencies)
      ? work.dependencies.map(row => ({ ...row }))
      : [];
    const explicitIds = predecessorIds(checked.value.predecessorIds);
    const task = normalizeWorkTask({
      ...checked.value,
      predecessorIds:explicitIds.length ? explicitIds : inherited,
      dependencies:explicitIds.length
        ? (checked.value.dependencies || [])
        : inheritedDependencies,
      id, workId, completed:false, completedAt:null, createdAt:now, updatedAt:now,
    }, workId);
    const saved = workTaskRepository.save(projectId, workId, task, { clearWorkPredecessors:firstTask && inherited.length > 0 });
    if(!saved) return { ok:false, code:'persist' };
    syncWorkCompletion(projectId, workId); publish(projectId);
    return { ok:true, task:saved };
  },
  update(projectId, workId, taskId, patch, clock = Date.now){
    const current = workTaskRepository.get(projectId, workId, taskId);
    if(!current) return { ok:false, code:'not_found' };
    const next = { ...current, ...patch };
    const dependencyCheck = validatePredecessors(projectRepository.find(projectId)?.tasks || [], taskId, next.predecessorIds || []);
    if(!dependencyCheck.ok) return dependencyCheck;
    const checked = validate(projectId, workId, next);
    if(!checked.ok) return checked;
    const saved = workTaskRepository.update(projectId, workId, taskId, {
      ...checked.value,
      id:current.id, workId, completed:Boolean(next.completed),
      completedAt:next.completed ? (current.completedAt || clock()) : null,
      createdAt:current.createdAt, updatedAt:clock(),
    });
    if(!saved) return { ok:false, code:'persist' };
    syncWorkCompletion(projectId, workId); publish(projectId);
    return { ok:true, task:saved };
  },
  setCompleted(projectId, workId, taskId, completed, clock = Date.now){
    return this.update(projectId, workId, taskId, { completed:Boolean(completed), progress:completed ? 100 : 0 }, clock);
  },
  remove(projectId, workId, taskId, clock = Date.now){
    const current = workTaskRepository.get(projectId, workId, taskId);
    if(!current) return { ok:false, code:'not_found' };
    const remaining = workTaskRepository.list(projectId, workId).filter(task => String(task.id) !== String(taskId));
    const saved = workTaskRepository.mutate(projectId, workId, work => ({
      ...work,
      predecessorIds:remaining.length ? work.predecessorIds : predecessorIds(current.predecessorIds),
      dependencies:remaining.length ? (work.dependencies || []) : (current.dependencies || []),
      workTasks:(work.workTasks || []).filter(task => String(task?.id) !== String(taskId)),
      updatedAt:clock(),
    }));
    if(!saved) return { ok:false, code:'persist' };
    if(remaining.length) syncWorkCompletion(projectId, workId);
    publish(projectId);
    return { ok:true };
  },
};

export default workTaskApi;
