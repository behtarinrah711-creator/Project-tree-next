import { activityRepository } from '../../data/activityRepository.js';
import { contractRepository } from '../../data/contractRepository.js';
import { projectRepository } from '../../data/projectRepository.js';
import { workTaskRepository } from '../../data/workTaskRepository.js';
import { markDirty, persist } from '../../sync/persistAdapter.js';

function publishTaskChange(projectId, saved){
  if(saved && typeof window!=='undefined'){
    markDirty(projectId);
    persist({local:false});
  }
  return saved;
}

function taskContract(projectId, workId, taskId){
  return contractRepository.list(projectId).find(contract =>
    !contract.trashed
    && String(contract.workTaskId || '') === String(taskId)
    && (!contract.projectItemId || String(contract.projectItemId) === String(workId))
  ) || null;
}

function workPath(project, workId){
  let result='';
  const walk=(items,path=[])=>{
    for(const item of items || []){
      const next=[...path,item.text || item.title || item.name || ''].filter(Boolean);
      if(String(item.id)===String(workId)){result=next.join(' / ');return true;}
      if(walk(item.subtasks,next)) return true;
    }
    return false;
  };
  walk(project?.tasks || []);
  return result;
}

export function linkedWorkTaskContract(projectId, workId, taskId){
  return taskContract(projectId, workId, taskId);
}

export function syncContractFromWorkTask(projectId, workId, task, clock=Date.now){
  if(!projectId || !workId || !task?.id) return null;
  const current=taskContract(projectId,workId,task.id);
  if(!task.hasContract){
    if(current?.isDraft || current?.status==='draft') contractRepository.softDelete(projectId,current.id);
    return current && !(current.isDraft || current.status==='draft') ? current : null;
  }
  const project=projectRepository.find(projectId);
  if(!project) return null;
  const activityId=String(task.activityId || '');
  const activity=activityId ? activityRepository.get(projectId,activityId) : null;
  const now=clock();
  const record={
    ...(current || {}),
    id:current?.id || `rc_task_${task.id}`,
    workTaskId:String(task.id),
    projectItemId:String(workId),
    projectItemRootTaskId:String(workId),
    projectItemPath:[workPath(project,workId),task.title].filter(Boolean).join(' / '),
    contractorId:String(task.counterpartyContactId || ''),
    contactId:String(task.counterpartyContactId || ''),
    activityId,
    activityIds:activityId ? [activityId] : [],
    title:`قرارداد ${activity?.name || task.title || ''}`.trim(),
    status:current?.status || 'draft',
    isDraft:current ? Boolean(current.isDraft || current.status==='draft') : true,
    systemGenerated:true,
    contractApproverContactIds:[...(task.contractApproverContactIds || [])],
    trashed:false,
    createdAt:current?.createdAt || now,
    updatedAt:now,
  };
  return contractRepository.save(projectId,record);
}

export function syncWorkTaskFromContract(projectId, contract){
  if(!contract?.workTaskId || !contract?.projectItemId) return null;
  const activityId=String(contract.activityId || '');
  const saved=workTaskRepository.update(projectId,contract.projectItemId,contract.workTaskId,task=>({
    ...task,
    hasContract:true,
    activityId,
    activityIds:activityId ? [activityId] : [],
    activities:activityId ? [activityId] : [],
    counterpartyContactId:String(contract.contractorId || contract.contactId || ''),
  }));
  return publishTaskChange(projectId,saved);
}

export function clearWorkTaskContractFlag(projectId, contract){
  if(!contract?.workTaskId || !contract?.projectItemId) return null;
  return workTaskRepository.update(projectId,contract.projectItemId,contract.workTaskId,task=>({
    ...task,
    hasContract:false,
  }));
}
