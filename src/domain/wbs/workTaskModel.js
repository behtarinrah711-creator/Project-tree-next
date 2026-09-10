import { WORK_TYPES } from './normalize.js';

export const TASK_PRIORITIES = Object.freeze(['low', 'normal', 'high']);

export function taskWeightOf(task){
  const value = Number(task?.weight);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

export function isTaskComplete(task){
  return Boolean(task?.completed || task?.done);
}

export function taskProgressOf(task){
  if(isTaskComplete(task)) return 100;
  const value = Number(task?.progress);
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
}

export function taskCostOf(task){
  const value = Number(task?.amount ?? task?.cost);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function activeWorkTasks(work){
  return (Array.isArray(work?.workTasks) ? work.workTasks : [])
    .filter(task => task && !task.trashed);
}

export function workTaskProgress(work){
  const tasks = activeWorkTasks(work);
  if(!tasks.length) return null;
  const total = tasks.reduce((sum, task) => sum + taskWeightOf(task), 0);
  const weighted = tasks.reduce((sum, task) => sum + taskProgressOf(task) * taskWeightOf(task), 0);
  return total ? Math.round(weighted / total) : 0;
}

export function normalizeWorkTask(task, workId = ''){
  if(!task || typeof task !== 'object') return task;
  return {
    ...task,
    id:String(task.id || ''),
    workId:String(workId || task.workId || ''),
    title:String(task.title || task.text || '').trim(),
    type:WORK_TYPES.includes(task.type) ? task.type : '',
    scheduleStart:/^\d{4}\/\d{2}\/\d{2}$/.test(String(task.scheduleStart || '')) ? task.scheduleStart : '',
    scheduleEnd:/^\d{4}\/\d{2}\/\d{2}$/.test(String(task.scheduleEnd || '')) ? task.scheduleEnd : '',
    priority:TASK_PRIORITIES.includes(task.priority) ? task.priority : 'normal',
    assigneeContactId:String(task.assigneeContactId || ''),
    contractorContactId:String(task.contractorContactId || ''),
    weight:taskWeightOf(task),
    progress:taskProgressOf(task),
    amount:taskCostOf(task),
    predecessorIds:Array.isArray(task.predecessorIds) ? [...new Set(task.predecessorIds.map(String).filter(Boolean))] : [],
    completed:isTaskComplete(task),
    completedAt:isTaskComplete(task) ? (task.completedAt || null) : null,
    completionState:task.completionState || (isTaskComplete(task) ? 'approved' : 'incomplete'),
    workflowStatus:task.workflowStatus || 'not_started',
    executionReports:Array.isArray(task.executionReports) ? task.executionReports.map(report => ({ ...report })) : [],
    executionComments:Array.isArray(task.executionComments) ? task.executionComments.map(comment => ({ ...comment })) : [],
    executionHistory:Array.isArray(task.executionHistory) ? task.executionHistory.map(entry => ({ ...entry })) : [],
  };
}
