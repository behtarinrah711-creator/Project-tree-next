import {currentExecutionActor} from '../../modules/wbs/executionActor.js';
import {canWriteProjectModule,projectPermissionState} from '../../modules/roleManagement/permissionState.js';
import { uid } from '../../data/projectFactories.js';
import { contactRepository } from '../../data/contactRepository.js';
import { workTaskRepository } from '../../data/workTaskRepository.js';
import { markDirty, persist } from '../../sync/persistAdapter.js';
import { FOLLOW_UP_WORK_TYPE, ODD_JOB_TYPES, WORK_TYPES } from './normalize.js';
import { TASK_PRIORITIES, activeWorkTasks, executionApproverIds, inheritSubworkFields, normalizeWorkTask, workTaskProgress } from './workTaskModel.js';
import { validatePredecessors } from './scheduling.js';
import { projectRepository } from '../../data/projectRepository.js';
import { cardFundingKey, placeCardFunding } from './fundingReceipts.js';
import { activityRepository } from '../../data/activityRepository.js';
import { linkedWorkTaskContract, syncContractFromWorkTask } from './workTaskContractSync.js';

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
  const counterpartyContactId = String(input?.counterpartyContactId || '');
  const contractorContactId = String(input?.contractorContactId || '');
  const executionApproverContactIds=executionApproverIds(input);
  const approvalContactId=executionApproverContactIds[0]||'';
  const activityId = input.type === FOLLOW_UP_WORK_TYPE ? '' : String(input?.activityId || '');
  const contractTemplateId=String(input?.contractTemplateId || '');
  if(input.hasContract && contractTemplateId && !(projectRepository.find(projectId)?.contractTemplates || []).some(t=>!t.trashed && String(t.id)===contractTemplateId)) return {ok:false,code:'contract_template'};
  const contractApproverContactIds=[...new Set((Array.isArray(input?.contractApproverContactIds)?input.contractApproverContactIds:[]).map(String).filter(Boolean))];
  if(input.hasContract && contractApproverContactIds.some(id=>{const contact=contactRepository.get(projectId,id);return !contact || contact.trashed;}))return {ok:false,code:'approver'};
  if(!title) return { ok:false, code:'title' };
  if(input?.type !== '' && !WORK_TYPES.includes(input?.type)) return { ok:false, code:'type' };
  if(!TASK_PRIORITIES.includes(input?.priority)) return { ok:false, code:'priority' };
  if(!Number.isFinite(weight) || weight <= 0) return { ok:false, code:'weight' };
  if(assigneeContactId && !contactRepository.get(projectId, assigneeContactId)) return { ok:false, code:'assignee' };
  if(counterpartyContactId && !contactRepository.get(projectId, counterpartyContactId)) return { ok:false, code:'counterparty' };
  if(contractorContactId && !contactRepository.get(projectId, contractorContactId)) return { ok:false, code:'contractor' };
  if(executionApproverContactIds.some(id=>{const contact=contactRepository.get(projectId,id);return !contact || contact.trashed;})) return { ok:false, code:'approver' };
  if(activityId && !activityRepository.get(projectId, activityId)) return { ok:false, code:'activity' };
  if(input.scheduleMode==='auto' && (!Number.isInteger(input.scheduleDuration)||input.scheduleDuration<1
    || (!input.isSubwork && (!input.scheduleStart || !input.scheduleEnd)) || !input.predecessorIds?.length))return {ok:false,code:'automatic_schedule'};
  if(!validDateRange(input.scheduleStart || '', input.scheduleEnd || '')) return { ok:false, code:'dates' };
  if(workId && !workTaskRepository.work(projectId, workId)) return { ok:false, code:'work' };
  return { ok:true, value:{ ...input, title, weight, assigneeContactId, counterpartyContactId, contractorContactId,
    contractTemplateId:input.hasContract ? contractTemplateId : '',
    activityId, activityIds:activityId ? [activityId] : [], activities:activityId ? [activityId] : [],
    requiresManagementApproval:Boolean(approvalContactId),
    approvalContactId, ...(Array.isArray(input.executionApproverContactIds)?{executionApproverContactIds}:{}), contractApproverContactIds:input.hasContract?contractApproverContactIds:[],
  } };
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

function oddJobHistory(projectId,work,type,at){
  const actor=currentExecutionActor(projectRepository.find(projectId),globalThis.window||{});
  const history=[...(work.executionHistory||[])];
  if(type!=='odd_job_created' && work.createdAt && !history.some(entry=>entry.type==='odd_job_created')){
    history.unshift({id:uid(),type:'odd_job_created',at:work.createdAt,actor:work.createdBy});
  }
  history.push({id:uid(),type,at,actor});
  return history;
}

export function createStandaloneWork(projectId,draft,clock=Date.now){
  if(!canWriteProjectModule(projectId,'execution:today'))return {ok:false,code:'forbidden'};
  if(!ODD_JOB_TYPES.includes(draft.oddJobType) || !/^oddjob-[a-z0-9]+$/.test(draft.id)
    || !Number.isFinite(draft.amount) || draft.amount<0)return {ok:false,code:'invalid'};
  if(draft.expenseApproverContactId && !contactRepository.get(projectId,draft.expenseApproverContactId))return {ok:false,code:'approver'};
  const start=draft.scheduleStart||draft.dueDate||'';
  const end=draft.scheduleEnd||draft.dueDate||start;
  const checked=validate(projectId,null,{
    title:draft.title,type:'',weight:1,priority:draft.priority,assigneeContactId:draft.assigneeContactId,
    scheduleStart:start,scheduleEnd:end,amount:draft.amount,
  });
  if(!checked.ok)return checked;
  const now=clock();
  const task=normalizeWorkTask({...checked.value,id:draft.id,description:String(draft.description||'').trim(),oddJobType:draft.oddJobType,linkedWbsId:String(draft.linkedWbsId||''),
    scheduleStart:start,scheduleEnd:end,dueDate:end,
    expenseApproverContactId:draft.expenseApproverContactId,
    expenseApprovalStatus:draft.expenseApproverContactId?'pending':null,
    invoices:(draft.invoices||[]).filter(file=>file.category==='oddjob-invoices' && file.projectId===projectId && file.recordId===draft.id),
    executionHistory:oddJobHistory(projectId,{},'odd_job_created',now),createdAt:now,updatedAt:now});
  const saved=projectRepository.updateProject(projectId,project=>(project.standaloneWorks||[]).some(work=>work.id===task.id)?project:({...project,standaloneWorks:[...(project.standaloneWorks||[]),task]}));
  if(!saved)return {ok:false,code:'persist'};
  publish(projectId);
  return {ok:true,task};
}

export function updateStandaloneWork(projectId,draft,clock=Date.now){
  if(!canWriteProjectModule(projectId,'execution:today'))return {ok:false,code:'forbidden'};
  if(!ODD_JOB_TYPES.includes(draft.oddJobType) || !/^oddjob-[a-z0-9]+$/.test(draft.id))return {ok:false,code:'invalid'};
  const start=draft.scheduleStart||'';
  const end=draft.scheduleEnd||start;
  const checked=validate(projectId,null,{
    title:draft.title,type:'',weight:1,priority:draft.priority,assigneeContactId:draft.assigneeContactId,
    scheduleStart:start,scheduleEnd:end,amount:Number(draft.amount)||0,
  });
  if(!checked.ok)return checked;
  const now=clock();
  let found=false;
  const saved=projectRepository.updateProject(projectId,project=>{
    const works=project.standaloneWorks||[];
    if(!works.some(work=>work.id===draft.id && !work.trashed))return project;
    found=true;
    return {...project,standaloneWorks:works.map(work=>work.id===draft.id?{...work,...checked.value,description:String(draft.description||'').trim(),oddJobType:draft.oddJobType,scheduleStart:start,scheduleEnd:end,dueDate:end,expenseApproverContactId:draft.expenseApproverContactId||'',amount:Number(draft.amount)||0,executionHistory:oddJobHistory(projectId,work,'odd_job_edited',now),updatedAt:now}:work)};
  });
  if(!found || !saved)return {ok:false,code:'not_found'};
  publish(projectId);
  return {ok:true};
}

export function deleteStandaloneWork(projectId,id,clock=Date.now){
  if(projectPermissionState(projectId,['execution:today']).levels['execution:today']!=='full')return {ok:false,code:'forbidden'};
  const now=clock();
  let found=false;
  const saved=projectRepository.updateProject(projectId,project=>{
    const works=project.standaloneWorks||[];
    if(!works.some(work=>work.id===id && !work.trashed))return project;
    found=true;
    return {...project,standaloneWorks:works.map(work=>work.id===id?{...work,trashed:true,deletedAt:now,executionHistory:oddJobHistory(projectId,work,'odd_job_deleted',now),updatedAt:now}:work)};
  });
  if(!found || !saved)return {ok:false,code:'not_found'};
  publish(projectId);
  return {ok:true};
}

export const workTaskApi = {
  list:(projectId, workId) => workTaskRepository.list(projectId, workId),
  get:(projectId, workId, taskId) => workTaskRepository.get(projectId, workId, taskId),
  create(projectId, workId, draft, clock = Date.now){
    const work = workTaskRepository.work(projectId, workId);
    const parent=draft.parentTaskId?activeWorkTasks(work).find(task=>String(task.id)===String(draft.parentTaskId)):work;
    if(draft.isSubwork && (!parent || parent.isSubwork))return {ok:false,code:'work'};
    const checked = validate(projectId, workId, inheritSubworkFields(draft,parent));
    if(!checked.ok) return checked;
    const now = clock(); const id = uid();
    const dependencyCheck = validatePredecessors(projectRepository.find(projectId)?.tasks || [], id, draft.predecessorIds || []);
    if(!dependencyCheck.ok) return dependencyCheck;
    const firstTask = activeWorkTasks(work).length === 0;
    const firstSubwork=draft.isSubwork && !activeWorkTasks(work).some(task=>task.isSubwork && (task.parentTaskId||'')===(draft.parentTaskId||''));
    const inherited = (firstSubwork || firstTask && !draft.isSubwork) ? predecessorIds(parent?.predecessorIds) : [];
    const inheritedDependencies = inherited.length && Array.isArray(parent?.dependencies)
      ? parent.dependencies.map(row => ({ ...row }))
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
    const saved = workTaskRepository.save(projectId, workId, task, { clearWorkPredecessors:!draft.isSubwork && firstTask && inherited.length > 0 });
    if(!saved) return { ok:false, code:'persist' };
    syncContractFromWorkTask(projectId,workId,saved,clock);
    syncWorkCompletion(projectId, workId); publish(projectId);
    return { ok:true, task:saved };
  },
  update(projectId, workId, taskId, patch, clock = Date.now){
    const current = workTaskRepository.get(projectId, workId, taskId);
    if(!current) return { ok:false, code:'not_found' };
    if(current.completionState==='pending_approval' && Array.isArray(patch.executionApproverContactIds)
      && JSON.stringify(executionApproverIds(current))!==JSON.stringify(executionApproverIds(patch)))
      return {ok:false,code:'approver'};
    const linkedContract=linkedWorkTaskContract(projectId,workId,taskId);
    const currentTemplateId=String(current.contractTemplateId || linkedContract?.templateId || '');
    const work=workTaskRepository.work(projectId,workId);
    const parent=current.parentTaskId?activeWorkTasks(work).find(task=>String(task.id)===String(current.parentTaskId)):work;
    const next = inheritSubworkFields({ ...current, contractTemplateId:currentTemplateId, ...patch },parent);
    if(linkedContract && !(linkedContract.isDraft || linkedContract.status==='draft') && !next.hasContract){
      return {ok:false,code:'contract_locked'};
    }
    if(linkedContract && !(linkedContract.isDraft || linkedContract.status==='draft') && String(next.contractTemplateId || '')!==currentTemplateId) return {ok:false,code:'contract_locked'};
    if(linkedContract && ['pending','approved'].includes(linkedContract.approvalStatus) &&
      JSON.stringify([...(next.contractApproverContactIds || [])].map(String).sort())!==JSON.stringify([...(current.contractApproverContactIds || [])].map(String).sort()))return {ok:false,code:'contract_locked'};
    const dependencyCheck = validatePredecessors(projectRepository.find(projectId)?.tasks || [], taskId, next.predecessorIds || []);
    if(!dependencyCheck.ok) return dependencyCheck;
    const checked = validate(projectId, workId, next);
    if(!checked.ok) return checked;
    const beforeKey = cardFundingKey(projectRepository.find(projectId), taskId);
    const saved = workTaskRepository.update(projectId, workId, taskId, {
      ...checked.value,
      id:current.id, workId, completed:Boolean(next.completed),
      completedAt:next.completed ? (current.completedAt || clock()) : null,
      createdAt:current.createdAt, updatedAt:clock(),
    });
    if(!saved) return { ok:false, code:'persist' };
    syncContractFromWorkTask(projectId,workId,saved,clock);
    if(activeWorkTasks(work).some(task=>task.parentTaskId===saved.id))workTaskRepository.mutate(projectId,workId,node=>({
      ...node,workTasks:node.workTasks.map(task=>task.parentTaskId===saved.id?inheritSubworkFields(task,saved):task),
    }));
    if(cardFundingKey(projectRepository.find(projectId), taskId) !== beforeKey){
      projectRepository.updateProject(projectId, row => placeCardFunding(row, taskId));
    }
    syncWorkCompletion(projectId, workId); publish(projectId);
    return { ok:true, task:saved };
  },
  setCompleted(projectId, workId, taskId, completed, clock = Date.now){
    return this.update(projectId, workId, taskId, { completed:Boolean(completed), progress:completed ? 100 : 0 }, clock);
  },
  remove(projectId, workId, taskId, clock = Date.now){
    const current = workTaskRepository.get(projectId, workId, taskId);
    if(!current) return { ok:false, code:'not_found' };
    if(activeWorkTasks(workTaskRepository.work(projectId,workId)).some(task=>task.parentTaskId===current.id))return {ok:false,code:'has_subworks'};
    const remaining = workTaskRepository.list(projectId, workId).filter(task => String(task.id) !== String(taskId));
    const saved = workTaskRepository.mutate(projectId, workId, work => ({
      ...work,
      predecessorIds:remaining.length || current.isSubwork ? work.predecessorIds : predecessorIds(current.predecessorIds),
      dependencies:remaining.length || current.isSubwork ? (work.dependencies || []) : (current.dependencies || []),
      workTasks:(work.workTasks || []).map(task => String(task?.id) === String(taskId)
        ? { ...task, trashed:true, deletedAt:clock(), updatedAt:clock() }
        : task),
      updatedAt:clock(),
    }));
    if(!saved) return { ok:false, code:'persist' };
    projectRepository.updateProject(projectId, row => {
      const contract=linkedWorkTaskContract(projectId,workId,taskId);
      const canDeleteContract=projectPermissionState(projectId,['contracts']).levels.contracts==='full';
      if(canDeleteContract && contract?.systemGenerated && contract.status==='draft' && contract.isDraft
        && !contract.signedAt && !contract.sentToAccountingAt && !contract.accountingPackage
        && !['pending','approved','unapproved'].includes(contract.approvalStatus)){
        const at=clock();
        row.contracts=row.contracts.map(item=>item.id===contract.id
          ? {...item,trashed:true,deletedAt:at,updatedAt:at}
          : item);
      }
      return placeCardFunding(row, taskId);
    });
    if(remaining.length) syncWorkCompletion(projectId, workId);
    publish(projectId);
    return { ok:true };
  },
  reorder(projectId, workId, orderedIds, clock = Date.now){
    const ids = (orderedIds || []).map(String);
    const active = workTaskRepository.list(projectId, workId);
    const first=active.find(task=>String(task.id)===ids[0]);
    const siblings=active.filter(task=>(task.parentTaskId||'')===(first?.parentTaskId||''));
    if(!first || ids.length !== siblings.length || new Set(ids).size !== siblings.length || siblings.some(task => !ids.includes(String(task.id)))){
      return { ok:false, code:'order' };
    }
    const order = new Map(ids.map((id, index) => [id, index]));
    const saved = workTaskRepository.mutate(projectId, workId, work => {
      const allVisible = (work.workTasks || []).filter(task => task && !task.trashed);
      const selectedIds=new Set(orderedIds.map(String));
      const visible=allVisible.filter(task=>selectedIds.has(String(task.id)))
        .sort((a, b) => order.get(String(a.id)) - order.get(String(b.id)));
      const trashed = (work.workTasks || []).filter(task => task?.trashed);
      return { ...work, workTasks:[...allVisible.map(task=>selectedIds.has(String(task.id))?visible.shift():task), ...trashed], updatedAt:clock() };
    });
    if(!saved) return { ok:false, code:'persist' };
    publish(projectId);
    return { ok:true };
  },
};

export default workTaskApi;
