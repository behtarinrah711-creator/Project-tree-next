import { FOLLOW_UP_WORK_TYPE, WORK_TYPES, taskCostOf } from './normalize.js';

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

export { taskCostOf };

export function inheritSubworkFields(task, work){
  if(!task?.isSubwork || !work)return task;
  const contractorContactId=String(work.contractorContactId || work.counterpartyContactId || '');
  return {
    ...task,
    type:work.type || '',
    assigneeContactId:String(work.assigneeContactId || ''),
    contractorContactId,
    counterpartyContactId:String(work.counterpartyContactId || contractorContactId),
    activityId:String(work.activityId || work.activityIds?.[0] || work.activities?.[0] || ''),
    activityIds:work.activityIds || work.activities || [],
    activities:work.activityIds || work.activities || [],
    executionApproverContactIds:executionApproverIds(work),
    approvalContactId:executionApproverIds(work)[0] || '',
    hasContract:false,
  };
}

export function activeWorkTasks(work){
  return (Array.isArray(work?.workTasks) ? work.workTasks : [])
    .filter(task => task && !task.trashed);
}

export function workTaskProgress(work){
  const all = activeWorkTasks(work);
  const tasks=all.filter(task=>!task.parentTaskId).map(task=>{
    const children=all.filter(child=>child.parentTaskId===task.id);
    return children.length?{...task,completed:false,done:false,progress:workTaskProgress({workTasks:children.map(child=>({...child,parentTaskId:''}))})}:task;
  });
  if(!tasks.length) return null;
  const total = tasks.reduce((sum, task) => sum + taskWeightOf(task), 0);
  const weighted = tasks.reduce((sum, task) => sum + taskProgressOf(task) * taskWeightOf(task), 0);
  return total ? Math.round(weighted / total) : 0;
}

function normalizeDependencies(value){
  return (Array.isArray(value) ? value : []).map(row => ({
    predecessorId:String(row?.predecessorId || row?.id || ''),
    type:['FS','SS','FF'].includes(row?.type) ? row.type : 'FS',
    lagDays:Number.isFinite(Number(row?.lagDays)) ? Number(row.lagDays) : 0,
  })).filter(row => row.predecessorId);
}

export function executionApproverIds(task){
  return [...new Set((Array.isArray(task?.executionApproverContactIds)
    ? task.executionApproverContactIds : [task?.approvalContactId]).map(id=>String(id||'')).filter(Boolean))];
}

export function pendingExecutionApproverIds(task){
  const history=task?.executionHistory||[];
  const submitted=history.findLastIndex(entry=>entry.type==='sent_for_approval');
  const voted=new Set(history.slice(submitted+1).filter(entry=>entry.type==='execution_approval_vote')
    .map(entry=>String(entry.actor?.contactId||'')));
  return executionApproverIds(task).filter(id=>!voted.has(id));
}

export function normalizeWorkTask(task, workId = ''){
  if(!task || typeof task !== 'object') return task;
  const activityId = task.type === FOLLOW_UP_WORK_TYPE ? '' : String(task.activityId || task.activityIds?.[0] || task.activities?.[0] || '');
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
    contractTemplateId:String(task.contractTemplateId || ''),
    activityId,
    activityIds:activityId ? [activityId] : [],
    activities:activityId ? [activityId] : [],
    counterpartyContactId:String(task.counterpartyContactId || ''),
    approvalContactId:executionApproverIds(task)[0]||'',
    contractApproverContactIds:[...new Set((Array.isArray(task.contractApproverContactIds)?task.contractApproverContactIds:[]).map(String).filter(Boolean))],
    requiresManagementApproval:executionApproverIds(task).length>0,
    contractorContactId:String(task.contractorContactId || ''),
    weight:taskWeightOf(task),
    progress:taskProgressOf(task),
    amount:taskCostOf(task),
    predecessorIds:Array.isArray(task.predecessorIds) ? [...new Set(task.predecessorIds.map(String).filter(Boolean))] : [],
    dependencies:normalizeDependencies(task.dependencies),
    completed:isTaskComplete(task),
    completedAt:isTaskComplete(task) ? (task.completedAt || null) : null,
    completionState:task.completionState || (isTaskComplete(task) ? 'approved' : 'incomplete'),
    workflowStatus:task.workflowStatus || 'not_started',
    hasContract:Boolean(task.hasContract),
    hasProgressReport:Boolean(task.hasProgressReport),
    hasInvoice:Boolean(task.hasInvoice),
    hasPreInvoice:Boolean(task.hasPreInvoice),
    hasLaborPayroll:Boolean(task.hasLaborPayroll),
    isRental:Boolean(task.isRental),
    executionReports:Array.isArray(task.executionReports) ? task.executionReports.map(report => ({ ...report })) : [],
    executionComments:Array.isArray(task.executionComments) ? task.executionComments.map(comment => ({ ...comment })) : [],
    executionHistory:Array.isArray(task.executionHistory) ? task.executionHistory.map(entry => ({ ...entry })) : [],
  };
}
