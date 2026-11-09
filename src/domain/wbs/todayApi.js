import {approveExecutionEntity} from './executionApproval.js';
import { canWriteProjectModule } from '../../modules/roleManagement/permissionState.js';
import { uid } from '../../data/projectFactories.js';
import { todayRepository } from '../../data/todayRepository.js';
import { markDirty, persist } from '../../sync/persistAdapter.js';
import { workTaskApi } from './workTaskApi.js';
import { canRecordStartDelay, executionReportDay, START_DELAY_REASONS, tehranTodayJalali } from './todayDomain.js';

export const REPORT_MIN_LENGTH = 3;
export const COMMENT_MIN_LENGTH = 2;
export const REJECTION_MIN_LENGTH = 5;

function actorValue(actor){
  return { id:String(actor?.id || 'guest'), contactId:String(actor?.contactId || ''), name:String(actor?.name || 'کاربر') };
}

function publish(projectId){
  if(typeof window === 'undefined') return;
  markDirty(projectId);
  persist({ local:false });
}

function event(type, actor, at, extra = {}){
  return { id:uid(), type, actor:actorValue(actor), at, ...extra };
}

function mutate(projectId, ref, updater, { completion } = {}){
  const entity = todayRepository.get(projectId, ref);
  if(!entity) return { ok:false, code:'not_found' };
  const scope = entity.type === 'خرید' ? 'execution:shopping' : 'execution:today';
  if(!canWriteProjectModule(projectId, scope)) return { ok:false, code:'forbidden' };
  const saved = todayRepository.update(projectId, ref, updater);
  if(!saved) return { ok:false, code:'not_found' };
  const completed = typeof completion==='function' ? completion(saved) : completion;
  if(ref.kind === 'task' && completed !== undefined){
    workTaskApi.setCompleted(projectId, ref.workId, ref.id, completed);
  }else publish(projectId);
  return { ok:true, entity:saved };
}

function completeExecution(entity,ref,by,at,day){
  const immediate = !entity.approvalContactId;
  const status = immediate ? 'approved' : 'pending_approval';
  const workProgress = immediate
    ? {progress:100,status:'completed'}
    : {progressBeforeApproval:Number(entity.progress)||0,status:'in_progress'};
  return {
    ...entity, completed:immediate, done:immediate, completionState:status, workflowStatus:status,
    completionSubmittedAt:at, completionSubmittedBy:by, actualFinishDay:immediate ? day : null,
    ...(immediate ? { completedAt:at } : {}),
    ...(ref.kind==='work' ? workProgress : {}),
    executionHistory:[...(entity.executionHistory||[]),event('marked_complete',by,at),
      event(immediate?'completed_without_approval':'sent_for_approval',by,at)],
    updatedAt:at,
  };
}

export const todayApi = {
  saveReport(projectId, ref, description, actor, clock = Date.now, progress = null, {files, completeAt100=false}={}){
    const text = String(description || '').trim();
    if(text.length < REPORT_MIN_LENGTH) return { ok:false, code:'report_too_short' };
    const at = clock(); const by = actorValue(actor); const reportDay = tehranTodayJalali(new Date(at));
    if(completeAt100){
      const entity = todayRepository.get(projectId, ref);
      if(!entity || entity.trashed || !entity.assigneeContactId || String(entity.assigneeContactId)!==by.contactId){
        return {ok:false,code:'forbidden'};
      }
      if(entity.completed || ['approved','pending_approval'].includes(entity.completionState)){
        return {ok:false,code:'locked'};
      }
    }
    const attachments = Array.isArray(files) ? { photos:[...files] } : {};
    return mutate(projectId, ref, entity => {
      const reports = [...(entity.executionReports || []).filter(report => report && !report.trashed)];
      const history = [...(entity.executionHistory || [])];
      const reportIndex = reports.findLastIndex(report => (
        executionReportDay(report) === reportDay
      ));
      const nextProgress = progress === null || progress === undefined
        ? Number(entity.progress) || 0
        : Math.min(100, Math.max(0, Number(progress) || 0));
      if(reportIndex >= 0){
        const current = reports[reportIndex];
        reports[reportIndex] = { ...current, ...attachments, description:text, progress:nextProgress, reportDay, updatedBy:by, updatedAt:at };
        history.push(event('report_edited', by, at, { reportId:current.id }));
      }else{
        const report = { id:uid(), ...attachments, description:text, progress:nextProgress, reportDay, createdBy:by, createdAt:at, updatedAt:null, updatedBy:null };
        reports.push(report);
        history.push(event('report_created', by, at, { reportId:report.id }));
      }
      const updated = { ...entity, progress:nextProgress, actualStart:entity.actualStart || reportDay, executionReports:reports, executionHistory:history, workflowStatus:'in_progress', updatedAt:at };
      return completeAt100 && nextProgress===100 ? completeExecution(updated,ref,by,at,reportDay) : updated;
    },{completion:completeAt100 ? saved=>saved.completed || undefined : undefined});
  },

  addComment(projectId, ref, text, actor, clock = Date.now, type = 'comment_added'){
    const description = String(text || '').trim();
    if(description.length < COMMENT_MIN_LENGTH) return { ok:false, code:'comment_too_short' };
    const at = clock(); const by = actorValue(actor); const commentId = uid();
    return mutate(projectId, ref, entity => ({
      ...entity,
      executionComments:[...(entity.executionComments || []), { id:commentId, text:description, createdBy:by, createdAt:at, type }],
      executionHistory:[...(entity.executionHistory || []), event(type, by, at, { commentId })],
      updatedAt:at,
    }));
  },

  recordStartDelay(projectId, ref, reason, note, actor, clock = Date.now){
    const entity = todayRepository.get(projectId, ref);
    if(!entity) return { ok:false, code:'not_found' };
    if(!canWriteProjectModule(projectId,'execution:today') || entity.type === 'خرید'
      || !entity.assigneeContactId || String(entity.assigneeContactId) !== String(actor?.contactId || '')){
      return { ok:false, code:'forbidden' };
    }
    const at = clock();
    const day = tehranTodayJalali(new Date(at));
    if(!canRecordStartDelay(entity, day)) return { ok:false, code:'not_due_or_started' };
    const description = typeof note === 'string' ? note.trim() : '';
    if(!START_DELAY_REASONS.includes(reason) || (reason === 'سایر' && !description)){
      return { ok:false, code:'invalid_reason' };
    }
    return mutate(projectId, ref, current => ({
      ...current,
      executionHistory:[...(current.executionHistory || []),event('start_delayed', actor, at, { day, reason, description })],
      updatedAt:at,
    }));
  },

  start(projectId, ref, actor, clock = Date.now){
    const at = clock(); const by = actorValue(actor);
    const day = tehranTodayJalali(new Date(at));
    return mutate(projectId, ref, entity => {
      if(entity.actualStart) return entity;
      return {
        ...entity,
        actualStart: day,
        workflowStatus: entity.workflowStatus === 'approved' ? entity.workflowStatus : 'in_progress',
        executionHistory: [...(entity.executionHistory || []), event('started', by, at, { actualStart: day })],
        updatedAt: at,
      };
    });
  },

  markComplete(projectId, ref, actor, clock = Date.now){
    const at = clock(); const by = actorValue(actor);
    const day = tehranTodayJalali(new Date(at));
    const result = mutate(projectId, ref, entity => entity.actualStart
      ? completeExecution(entity,ref,by,at,day) : entity);
    if(result.ok && ref.kind === 'task') workTaskApi.setCompleted(projectId, ref.workId, ref.id, Boolean(result.entity.actualStart && !result.entity.approvalContactId));
    return result;
  },

  approve(projectId, ref, actor, clock = Date.now){
    const at = clock(); const by = actorValue(actor);
    return mutate(projectId,ref,entity=>approveExecutionEntity(entity,ref.kind,by,at),{completion:true});
  },

  cancelApproval(projectId, ref, actor, clock = Date.now){
    const at = clock(); const by = actorValue(actor);
    let code = null;
    const result = mutate(projectId, ref, entity => {
      if(entity.completionState !== 'approved' && !entity.completed){ code = 'not_approved'; return entity; }
      code = 'ok';
      return {
        ...entity,
        completed:false,
        done:false,
        completionState:'incomplete',
        workflowStatus:entity.actualStart ? 'in_progress' : 'not_started',
        completedAt:null,
        completionSubmittedAt:null,
        completionSubmittedBy:null,
        actualFinishDay:null,
        approvedAt:null,
        approvedBy:null,
        returnedToTodayOn:tehranTodayJalali(new Date(at)),
        ...(ref.kind === 'work' ? { progress:Number(entity.progressBeforeApproval) || 0, status:'in_progress' } : {}),
        executionHistory:[...(entity.executionHistory || []), event('approval_cancelled', by, at), event('returned_to_active', by, at)],
        updatedAt:at,
      };
    }, { completion:false });
    if(!result.ok) return result;
    return code === 'ok' ? result : { ok:false, code };
  },


  cancelStart(projectId, ref, actor, clock = Date.now){
    const at = clock(); const by = actorValue(actor);
    let code = null;
    const result = mutate(projectId, ref, entity => {
      if(entity.completionState === 'pending_approval' || entity.completionState === 'approved' || entity.completed){ code = 'locked'; return entity; }
      if(!entity.actualStart){ code = 'not_started'; return entity; }
      code = 'ok';
      const reports = (entity.executionReports || []).some(report => report && !report.trashed);
      return {
        ...entity,
        actualStart:null,
        workflowStatus: reports || Number(entity.progress) > 0 ? 'in_progress' : 'not_started',
        executionHistory:[...(entity.executionHistory || []), event('start_cancelled', by, at)],
        updatedAt:at,
      };
    });
    if(!result.ok) return result;
    return code === 'ok' ? result : { ok:false, code };
  },

  withdrawCompletion(projectId, ref, actor, clock = Date.now){
    const at = clock(); const by = actorValue(actor);
    let code = null;
    const result = mutate(projectId, ref, entity => {
      if(entity.completionState !== 'pending_approval'){ code = 'not_pending'; return entity; }
      const submitter = entity.completionSubmittedBy?.id;
      if(submitter && String(submitter) !== by.id){ code = 'not_submitter'; return entity; }
      code = 'ok';
      return {
        ...entity,
        completed:false,
        done:false,
        completionState:'incomplete',
        workflowStatus: entity.actualStart ? 'in_progress' : 'not_started',
        completionSubmittedAt:null,
        completionSubmittedBy:null,
        actualFinishDay:null,
        approvedAt:null,
        returnedToTodayOn:null,
        ...(ref.kind === 'work' ? { progress:Number(entity.progressBeforeApproval) || 0, status:'in_progress' } : {}),
        executionHistory:[...(entity.executionHistory || []), event('completion_withdrawn', by, at), event('returned_to_previous', by, at)],
        updatedAt:at,
      };
    }, { completion:false });
    if(!result.ok) return result;
    return code === 'ok' ? result : { ok:false, code };
  },

  reject(projectId, ref, reason, actor, clock = Date.now){
    const text = String(reason || '').trim();
    if(text.length < REJECTION_MIN_LENGTH) return { ok:false, code:'rejection_too_short' };
    const at = clock(); const by = actorValue(actor); const commentId = uid();
    return mutate(projectId, ref, entity => ({
      ...entity, completed:false, done:false, completionState:'incomplete', workflowStatus:'in_progress', completedAt:null,
      completionSubmittedAt:null, actualFinishDay:null, approvedAt:null,
      returnedToTodayOn:tehranTodayJalali(new Date(at)),
      ...(ref.kind === 'work' ? { progress:Number(entity.progressBeforeApproval) || 0, status:'in_progress' } : {}),
      executionComments:[...(entity.executionComments || []), { id:commentId, text, createdBy:by, createdAt:at, type:'approval_rejected' }],
      executionHistory:[...(entity.executionHistory || []), event('approval_rejected', by, at, { commentId }), event('returned_to_active', by, at)],
      updatedAt:at,
    }), { completion:false });
  },
};
