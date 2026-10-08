import { uid } from '../../data/projectFactories.js';
import { todayRepository } from '../../data/todayRepository.js';
import { markDirty, persist } from '../../sync/persistAdapter.js';
import { workTaskApi } from './workTaskApi.js';
import { tehranTodayJalali } from './todayDomain.js';

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
  const saved = todayRepository.update(projectId, ref, updater);
  if(!saved) return { ok:false, code:'not_found' };
  if(ref.kind === 'task' && completion !== undefined){
    workTaskApi.setCompleted(projectId, ref.workId, ref.id, completion);
  }else publish(projectId);
  return { ok:true, entity:saved };
}

export const todayApi = {
  saveReport(projectId, ref, description, actor, clock = Date.now, progress = null){
    const text = String(description || '').trim();
    if(text.length < REPORT_MIN_LENGTH) return { ok:false, code:'report_too_short' };
    const at = clock(); const by = actorValue(actor); const reportDay = tehranTodayJalali(new Date(at));
    return mutate(projectId, ref, entity => {
      const reports = [...(entity.executionReports || []).filter(report => report && !report.trashed)];
      const history = [...(entity.executionHistory || [])];
      const reportIndex = reports.findLastIndex(report => (
        (report.reportDay || tehranTodayJalali(new Date(report.createdAt))) === reportDay
      ));
      const nextProgress = progress === null || progress === undefined
        ? Number(entity.progress) || 0
        : Math.min(100, Math.max(0, Number(progress) || 0));
      if(reportIndex >= 0){
        const current = reports[reportIndex];
        reports[reportIndex] = { ...current, description:text, progress:nextProgress, reportDay, updatedBy:by, updatedAt:at };
        history.push(event('report_edited', by, at, { reportId:current.id }));
      }else{
        const report = { id:uid(), description:text, progress:nextProgress, reportDay, createdBy:by, createdAt:at, updatedAt:null, updatedBy:null };
        reports.push(report);
        history.push(event('report_created', by, at, { reportId:report.id }));
      }
      return { ...entity, progress:nextProgress, actualStart:entity.actualStart || reportDay, executionReports:reports, executionHistory:history, workflowStatus:'in_progress', updatedAt:at };
    });
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
    let completesImmediately = false;
    const result = mutate(projectId, ref, entity => {
      if(!entity.actualStart) return entity;
      completesImmediately = !entity.approvalContactId;
      if(completesImmediately) return {
        ...entity, completed:true, done:true, completionState:'approved', workflowStatus:'approved',
        completionSubmittedAt:at, completionSubmittedBy:by, completedAt:at, actualFinishDay:day,
        ...(ref.kind === 'work' ? { progress:100, status:'completed' } : {}),
        executionHistory:[...(entity.executionHistory || []), event('marked_complete', by, at), event('completed_without_approval', by, at)],
        updatedAt:at,
      };
      return ({
      ...entity, completed:false, done:false, completionState:'pending_approval', workflowStatus:'pending_approval',
      completionSubmittedAt:at, actualFinishDay:null,
      actualStart: entity.actualStart,
      ...(ref.kind === 'work' ? { progressBeforeApproval:Number(entity.progress) || 0, status:'in_progress' } : {}),
      completionSubmittedBy:by,
      executionHistory:[...(entity.executionHistory || []), event('marked_complete', by, at), event('sent_for_approval', by, at)],
      updatedAt:at,
    }); });
    if(result.ok && ref.kind === 'task') workTaskApi.setCompleted(projectId, ref.workId, ref.id, completesImmediately);
    return result;
  },

  approve(projectId, ref, actor, clock = Date.now){
    const at = clock(); const by = actorValue(actor);
    return mutate(projectId, ref, entity => ({
      ...entity, completed:true, done:true, completionState:'approved', workflowStatus:'approved',
      completedAt:entity.completionSubmittedAt || at,
      actualFinishDay:entity.completionSubmittedAt || at,
      approvedAt:at, approvedBy:by,
      ...(ref.kind === 'work' ? { progress:100, status:'completed' } : {}),
      executionHistory:[...(entity.executionHistory || []), event('approved', by, at)], updatedAt:at,
    }), { completion:true });
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
