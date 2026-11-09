import {uid} from '../../data/projectFactories.js';
import {collectTodayItems} from './todayDomain.js';
import {collectShoppingItems} from './shoppingDomain.js';
import {workTaskProgress} from './workTaskModel.js';

export function executionApprovalItem(project,ref){
  return [...collectTodayItems(project),...collectShoppingItems(project)].find(item=>
    item.mode==='pending' && item.kind===ref.kind && String(item.id)===String(ref.id)
    && (item.kind==='work' || String(item.workId)===String(ref.workId)));
}

export function approveExecutionEntity(entity,kind,actor,at){
  return {
    ...entity,completed:true,done:true,completionState:'approved',workflowStatus:'approved',
    completedAt:entity.completionSubmittedAt || at,actualFinishDay:entity.completionSubmittedAt || at,
    approvedAt:at,approvedBy:actor,
    ...(kind==='work'?{progress:100,status:'completed'}:{}),
    executionHistory:[...(entity.executionHistory||[]),{id:uid(),type:'approved',actor,at}],updatedAt:at,
  };
}

export function applyExecutionApproval(project,item,approved){
  const update=nodes=>(nodes||[]).map(node=>{
    if(String(node.id)===String(item.workId)){
      if(item.kind==='work')return approved;
      const workTasks=node.workTasks.map(task=>String(task.id)===String(item.id)?approved:task);
      const progress=workTaskProgress({...node,workTasks});
      return {...node,workTasks,progress,done:progress===100,
        status:progress===100?'completed':progress>0?'in_progress':'not_started',
        completedAt:progress===100?(node.completedAt || approved.updatedAt):null};
    }
    return node.subtasks?.length?{...node,subtasks:update(node.subtasks)}:node;
  });
  return {...project,tasks:update(project.tasks)};
}
