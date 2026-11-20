import {uid} from '../../data/projectFactories.js';
import {collectStandaloneWorks,collectTodayItems} from './todayDomain.js';
import {collectShoppingItems} from './shoppingDomain.js';
import {executionApproverIds,pendingExecutionApproverIds,workTaskProgress} from './workTaskModel.js';
import {tehranTodayJalali} from './todayDomain.js';

export function executionApprovalItem(project,ref){
  return [...collectStandaloneWorks(project),...collectTodayItems(project),...collectShoppingItems(project)].find(item=>
    (item.entity.expenseApprovalStatus==='pending' || (item.mode==='pending' && !item.entity.completed)) && item.kind===ref.kind && String(item.id)===String(ref.id)
    && (item.kind==='work' || String(item.workId)===String(ref.workId)));
}

export function approveExecutionEntity(entity,kind,actor,at){
  if(kind==='standalone' && entity.oddJobType)return {...entity,expenseApprovalStatus:'approved',expenseApprovedAt:at,expenseApprovedBy:actor,completed:true,done:true,completionState:'approved',workflowStatus:'approved',approvedAt:at,approvedBy:actor,completedAt:at,actualFinishDay:tehranTodayJalali(new Date(at)),progress:100,executionHistory:[...(entity.executionHistory||[]),{id:uid(),type:'approved',actor,at}],updatedAt:at};
  if(executionApproverIds(entity).length>1){
    const pending=pendingExecutionApproverIds(entity);
    if(entity.completionState!=='pending_approval' || !pending.includes(String(actor?.contactId||'')))return entity;
    entity={...entity,executionHistory:[...(entity.executionHistory||[]),{id:uid(),type:'execution_approval_vote',actor,at}],updatedAt:at};
    if(pending.length>1)return entity;
  }
  return {
    ...entity,completed:true,done:true,completionState:'approved',workflowStatus:'approved',
    completedAt:at,actualFinishDay:tehranTodayJalali(new Date(at)),
    approvedAt:at,approvedBy:actor,
    ...(kind==='work'?{progress:100,status:'completed'}:{}),
    executionHistory:[...(entity.executionHistory||[]),{id:uid(),type:'approved',actor,at}],updatedAt:at,
  };
}

export function rejectExecutionEntity(entity,kind,reason,actor,at,{progress,endDate}={}){
  const revised=Number(progress);
  const hasRevision=progress!==undefined && Number.isInteger(revised) && revised>=0 && revised<100;
  const newEnd=/^\d{4}\/\d{2}\/\d{2}$/.test(String(endDate||''))?endDate:entity.scheduleEnd;
  const scheduleChange={scheduleEnd:newEnd,dueDate:kind==='standalone'?newEnd:entity.dueDate};
  const progressChange=hasRevision?{progress:revised}:{};
  const commentId=uid();
  const rejection={
    executionComments:[...(entity.executionComments||[]),{id:commentId,text:reason,createdBy:actor,createdAt:at,type:'approval_rejected'}],
    executionHistory:[...(entity.executionHistory||[]),{id:uid(),type:'approval_rejected',actor,at,commentId}],
    updatedAt:at,
  };
  rejection.executionHistory.push({id:uid(),type:'approval_revised',actor,at,previousProgress:100,progress:hasRevision?revised:null,previousEnd:entity.scheduleEnd||'',endDate:newEnd});
  if(kind==='standalone' && entity.oddJobType)return {...entity,...rejection,...scheduleChange,...progressChange,completed:false,done:false,completionState:'incomplete',expenseApprovalStatus:'rejected',workflowStatus:'in_progress',completedAt:null,approvedAt:null,actualFinishDay:null,completionSubmittedAt:null,returnedToTodayOn:tehranTodayJalali(new Date(at))};
  rejection.executionHistory.push({id:uid(),type:'returned_to_active',actor,at});
  return {...entity,...rejection,...scheduleChange,...progressChange,completed:false,done:false,completionState:'incomplete',workflowStatus:'in_progress',
    completedAt:null,completionSubmittedAt:null,actualFinishDay:null,approvedAt:null,
    returnedToTodayOn:tehranTodayJalali(new Date(at)),
    ...(kind==='work'?{progress:hasRevision?revised:Number(entity.progressBeforeApproval)||0,status:'in_progress'}:{})};
}

export function applyExecutionApproval(project,item,approved){
  if(item.kind==='standalone')return {...project,standaloneWorks:project.standaloneWorks.map(work=>work.id===item.id?approved:work)};
  const update=nodes=>(nodes||[]).map(node=>{
    if(String(node.id)===String(item.workId)){
      if(item.kind==='work')return approved;
      const workTasks=node.workTasks.map(task=>String(task.id)===String(item.id)?approved:task);
      if(approved.completionState==='pending_approval')return {...node,workTasks};
      const progress=workTaskProgress({...node,workTasks});
      return {...node,workTasks,progress,done:progress===100,
        status:progress===100?'completed':progress>0?'in_progress':'not_started',
        completedAt:progress===100?(node.completedAt || approved.updatedAt):null};
    }
    return node.subtasks?.length?{...node,subtasks:update(node.subtasks)}:node;
  });
  return {...project,tasks:update(project.tasks)};
}
