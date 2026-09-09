import { uid } from '../../data/projectFactories.js';
import { todayRepository } from '../../data/todayRepository.js';
import { markDirty, persist } from '../../sync/persistAdapter.js';
import { workTaskApi } from './workTaskApi.js';
import { tehranTodayJalali } from './todayDomain.js';

export const REPORT_MIN_LENGTH = 3;
export const COMMENT_MIN_LENGTH = 2;
export const REJECTION_MIN_LENGTH = 5;

function actorValue(actor){
  return { id:String(actor?.id || 'guest'), name:String(actor?.name || 'کاربر') };
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
  saveReport(projectId, ref, description, actor, clock = Date.now){
    const text = String(description || '').trim();
    if(text.length < REPORT_MIN_LENGTH) return { ok:false, code:'report_too_short' };
    const at = clock(); const by = actorValue(actor);
    return mutate(projectId, ref, entity => {
      const reports = [...(entity.executionReports || []).filter(report => report && !report.trashed)];
      const history = [...(entity.executionHistory || [])];
      const last = reports.at(-1);
      if(last && String(last.createdBy?.id) === by.id){
        reports[reports.length - 1] = { ...last, description:text, updatedBy:by, updatedAt:at };
        history.push(event('report_edited', by, at, { reportId:last.id }));
      }else{
        const report = { id:uid(), description:text, createdBy:by, createdAt:at, updatedAt:null, updatedBy:null };
        reports.push(report);
        history.push(event('report_created', by, at, { reportId:report.id }));
      }
      return { ...entity, executionReports:reports, executionHistory:history, workflowStatus:'in_progress', updatedAt:at };
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

  markComplete(projectId, ref, actor, clock = Date.now){
    const at = clock(); const by = actorValue(actor);
    return mutate(projectId, ref, entity => ({
      ...entity, completed:false, done:false, completionState:'pending_approval', workflowStatus:'pending_approval',
      ...(ref.kind === 'work' ? { progressBeforeApproval:Number(entity.progress) || 0, status:'in_progress' } : {}),
      executionHistory:[...(entity.executionHistory || []), event('marked_complete', by, at), event('sent_for_approval', by, at)],
      updatedAt:at,
    }), { completion:false });
  },

  approve(projectId, ref, actor, clock = Date.now){
    const at = clock(); const by = actorValue(actor);
    return mutate(projectId, ref, entity => ({
      ...entity, completed:true, done:true, completionState:'approved', workflowStatus:'approved', completedAt:at,
      ...(ref.kind === 'work' ? { progress:100, status:'completed' } : {}),
      executionHistory:[...(entity.executionHistory || []), event('approved', by, at)], updatedAt:at,
    }), { completion:true });
  },

  reject(projectId, ref, reason, actor, clock = Date.now){
    const text = String(reason || '').trim();
    if(text.length < REJECTION_MIN_LENGTH) return { ok:false, code:'rejection_too_short' };
    const at = clock(); const by = actorValue(actor); const commentId = uid();
    return mutate(projectId, ref, entity => ({
      ...entity, completed:false, done:false, completionState:'incomplete', workflowStatus:'in_progress', completedAt:null,
      returnedToTodayOn:tehranTodayJalali(new Date(at)),
      ...(ref.kind === 'work' ? { progress:Number(entity.progressBeforeApproval) || 0, status:'in_progress' } : {}),
      executionComments:[...(entity.executionComments || []), { id:commentId, text, createdBy:by, createdAt:at, type:'approval_rejected' }],
      executionHistory:[...(entity.executionHistory || []), event('approval_rejected', by, at, { commentId }), event('returned_to_active', by, at)],
      updatedAt:at,
    }), { completion:false });
  },
};
