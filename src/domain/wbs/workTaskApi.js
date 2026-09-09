import { uid } from '../../data/projectFactories.js';
import { contactRepository } from '../../data/contactRepository.js';
import { workTaskRepository } from '../../data/workTaskRepository.js';
import { markDirty, persist } from '../../sync/persistAdapter.js';
import { WORK_TYPES } from './normalize.js';
import { TASK_PRIORITIES, activeWorkTasks, normalizeWorkTask, workTaskProgress } from './workTaskModel.js';

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

export const workTaskApi = {
  list:(projectId, workId) => workTaskRepository.list(projectId, workId),
  get:(projectId, workId, taskId) => workTaskRepository.get(projectId, workId, taskId),
  create(projectId, workId, draft, clock = Date.now){
    const checked = validate(projectId, workId, draft);
    if(!checked.ok) return checked;
    const now = clock();
    const task = normalizeWorkTask({
      ...checked.value,
      id:uid(), workId, completed:false, completedAt:null, createdAt:now, updatedAt:now,
    }, workId);
    const saved = workTaskRepository.save(projectId, workId, task);
    if(!saved) return { ok:false, code:'persist' };
    syncWorkCompletion(projectId, workId); publish(projectId);
    return { ok:true, task:saved };
  },
  update(projectId, workId, taskId, patch, clock = Date.now){
    const current = workTaskRepository.get(projectId, workId, taskId);
    if(!current) return { ok:false, code:'not_found' };
    const next = { ...current, ...patch };
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
    return this.update(projectId, workId, taskId, { completed:Boolean(completed) }, clock);
  },
};

export default workTaskApi;
