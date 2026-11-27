import {dependencyRows,flattenDependencyCandidates,interruptionScheduleLookup,jalaliDayNumber,previewPlannedPause,scheduleDate,scheduleRangeOf,validatePredecessors} from './scheduling.js';
import {toEnglishDigits} from '../../ui/digits.js';
import {projectRepository} from '../../data/projectRepository.js';
import {executionApproverIds,pendingExecutionApproverIds} from './workTaskModel.js';
import {approveExecutionEntity} from './executionApproval.js';
import { canWriteProjectModule } from '../../modules/roleManagement/permissionState.js';
import { uid } from '../../data/projectFactories.js';
import { todayRepository } from '../../data/todayRepository.js';
import { markDirty, persist } from '../../sync/persistAdapter.js';
import { workTaskApi } from './workTaskApi.js';
import { canRecordStartDelay, interruptionReportOf, dailyExecutionStatus, DAILY_EXECUTION_LABELS, INACTIVE_REASONS, executionReportDay, executionInterruption, START_DELAY_REASONS, tehranTodayJalali } from './todayDomain.js';

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
  const scope = ref.kind!=='standalone' && entity.type === 'خرید' ? 'execution:shopping' : 'execution:today';
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
  const immediate = !executionApproverIds(entity).length;
  const status = immediate ? 'approved' : 'pending_approval';
  const workProgress = immediate
    ? {progress:100,status:'completed'}
    : {progressBeforeApproval:Number(entity.progress)||0,status:'in_progress'};
  return {
    ...entity, completed:immediate, done:immediate, completionState:status, workflowStatus:status,
    completionSubmittedAt:at, completionSubmittedBy:by, actualFinishDay:immediate ? day : null,
    ...(immediate ? { completedAt:at } : {}),
    ...(ref.kind==='work' ? workProgress : {}),
    executionHistory:[...(entity.executionHistory||[]),event('marked_complete',by,at,{day}),
      event(immediate?'completed_without_approval':'sent_for_approval',by,at,{day})],
    updatedAt:at,
  };
}

function dailyStatusChange(entity,status,reasonId,note,actor,at,day){
  if(!Object.hasOwn(DAILY_EXECUTION_LABELS,status))return {ok:false,code:'invalid_status'};
  const key=String(reasonId||'');
  const reason=Object.hasOwn(INACTIVE_REASONS,key)?INACTIVE_REASONS[key]:key.startsWith('custom:')?key.slice(7).trim():'';
  if(status==='inactive' && !reason)return {ok:false,code:'invalid_reason'};
  const previous=dailyExecutionStatus(entity,day);
  const details=status==='inactive'?{reasonId:key,reason,description:String(note||'').trim()}:{};
  if(previous.type==='daily_status' && previous.status===status && previous.reasonId===details.reasonId && previous.description===details.description)return {ok:true};
  return {ok:true,entry:event('daily_status',actor,at,{day,status,...details})};
}

export const todayApi = {
  saveInterruption(projectId,ref,draft,actor,clock=Date.now){
    const entity=todayRepository.get(projectId,ref);
    const by=actorValue(actor);
    if(!entity || entity.trashed || !by.contactId || String(entity.assigneeContactId)!==by.contactId)return {ok:false,code:'forbidden'};
    if(!draft.review && !draft.eligibility && (entity.completed || ['approved','pending_approval'].includes(entity.completionState)))return {ok:false,code:'locked'};
    const at=clock(), day=tehranTodayJalali(new Date(at));
    const items=projectRepository.find(projectId)?.tasks;
    const range=scheduleRangeOf({...entity,kind:ref.kind==='task'||ref.kind==='standalone'?'workTask':ref.kind});
    const lookup=interruptionScheduleLookup(items);
    const entries=entity.executionHistory||[];
    const previous=entries.find(entry=>entry?.id && entry.id===draft.id && ['planned_pause','execution_obstacle'].includes(entry.type));
    const date=value=>typeof value==='string' && /^\d{4}\/\d{2}\/\d{2}$/.test(value);
    if(draft.resume){
      if(!previous || previous.resumedOn || previous.day>day)return {ok:false,code:'invalid_interruption'};
      if(previous.type==='planned_pause' && previous.resumePredecessorId){
        const source=flattenDependencyCandidates(items)
          .find(row=>row.id===previous.resumePredecessorId);
        const predecessor=source?.item;
        const auto=previous.resumeMode==='auto';
        const type=previous.resumeRelationType||'FS';
        const forecast=auto?previewPlannedPause(entity,range,previous,lookup).window:null;
        const earliest=auto&&forecast?forecast.resume:jalaliDayNumber(previous.resumeOn);
        const needsCompletion=type==='FS' && (!auto || previous.resumeLagDays>=0);
        const needsStart=type==='SS' && previous.resumeLagDays>=0;
        const complete=predecessor?.completed || predecessor?.done || predecessor?.completionState==='approved';
        const started=predecessor?.actualStart || Number(predecessor?.progress)>0 || complete;
        const reason=!predecessor?'missing'
          :earliest===null?'date_missing'
          :jalaliDayNumber(day)<earliest?'date_pending'
          :needsCompletion&&!complete?'completion_pending'
          :needsStart&&!started?'start_pending':'';
        if(reason)return {ok:false,code:'resume_predecessor_pending',reason,
          resumeOn:earliest===null?'':scheduleDate(earliest)};
      }
      if(previous.type==='planned_pause' && previous.resumeRequiresConfirmation &&
        !previous.resumePredecessorId && previous.resumeOn>day){
        return {ok:false,code:'resume_predecessor_pending',reason:'date_pending',resumeOn:previous.resumeOn};
      }
      return mutate(projectId,ref,current=>({...current,returnedToTodayOn:day,updatedAt:at,
        executionHistory:current.executionHistory.map(entry=>entry.id===previous.id?{...entry,resumedOn:day,resumedBy:by}:entry)}));
    }
    if(draft.eligibility){
      if(!previous || previous.isDailyReport || previous.type!=='execution_obstacle' || !['pending','eligible','ineligible'].includes(draft.eligibility))
        return {ok:false,code:'invalid_interruption'};
      return mutate(projectId,ref,current=>({...current,updatedAt:at,executionHistory:current.executionHistory.map(entry=>
        entry.id===previous.id?{...entry,eligibility:draft.eligibility,eligibilityBy:by,eligibilityAt:at}:entry)}));
    }
    if(draft.review){
      if(!previous || previous.type!=='execution_obstacle' || !Number.isInteger(draft.impactDays) || draft.impactDays<0)
        return {ok:false,code:'invalid_interruption'};
      return mutate(projectId,ref,current=>({...current,updatedAt:at,executionHistory:current.executionHistory.map(entry=>
        entry.id===previous.id?{...entry,reviewed:true,impactDays:draft.impactDays,reviewedBy:by,reviewedAt:at}:entry)}));
    }
    const planned=draft.type==='planned_pause';
    if(previous?.resumedOn || (!planned && draft.type!=='execution_obstacle'))return {ok:false,code:'invalid_interruption'};
    const normalizeDate=value=>toEnglishDigits(String(value||'').trim())
      .replace(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/,(_,year,month,date)=>[year,month.padStart(2,'0'),date.padStart(2,'0')].join('/'));
    const start=previous?.day||normalizeDate(draft.day)||day;
    let resumeOn=normalizeDate(draft.resumeOn);
    const resumePredecessorId=planned?String(draft.resumePredecessorId??previous?.resumePredecessorId??''):'';
    const resumeMode=planned?(draft.resumeMode??previous?.resumeMode??''):'';
    const resumeLagDays=resumeMode==='auto'?Number(draft.resumeLagDays??previous?.resumeLagDays??0):0;
    if(!date(start) || (!planned && start>day))return {ok:false,code:'invalid_start'};
    if(resumeMode && !['manual','auto'].includes(resumeMode))return {ok:false,code:'invalid_resume_mode'};
    const resumeRelationType=planned?(draft.resumeRelationType??previous?.resumeRelationType??'FS'):'';
    const resumeDurationDays=planned?(draft.resumeDurationDays??previous?.resumeDurationDays??null):null;
    if(planned && !['FS','SS','FF'].includes(resumeRelationType))return {ok:false,code:'invalid_resume_relation'};
    if(planned && (!Number.isInteger(resumeLagDays) || Math.abs(resumeLagDays)>99999))return {ok:false,code:'invalid_resume_lag'};
    if(resumeDurationDays!==null && (!Number.isInteger(resumeDurationDays)||resumeDurationDays<1||resumeDurationDays>99999))
      return {ok:false,code:'invalid_remaining_duration'};
    if(resumePredecessorId){
      const links=[...new Set([...dependencyRows(entity).map(link=>link.predecessorId),
        ...entries.filter(entry=>entry!==previous && entry?.type==='planned_pause' && !entry.resumedOn)
          .map(entry=>entry.resumePredecessorId).filter(Boolean),resumePredecessorId])];
      if(resumePredecessorId===String(ref.workId) || !validatePredecessors(items,ref.id,links).ok)return {ok:false,code:'invalid_resume_predecessor'};
    }
    if(resumeMode==='auto' && !resumePredecessorId)return {ok:false,code:'invalid_resume_predecessor'};
    if(resumeMode==='auto' && !lookup(resumePredecessorId))return {ok:false,code:'unscheduled_resume_predecessor'};
    const stopDay=jalaliDayNumber(start);
    const historicalStop=previous && resumeMode==='manual' && (!range || stopDay<range.start || stopDay>range.end);
    if(planned && draft.multiday && !historicalStop && (range || draft.resumeDurationDays!=null || resumeMode==='auto')){
      const preview=previewPlannedPause(entity,range,{
        id:previous?.id,type:'planned_pause',multiday:true,day:start,resumeOn,
        resumeMode,resumePredecessorId,resumeLagDays,resumeRelationType,resumeDurationDays,
      },lookup);
      if(preview.conflicts)return {ok:false,code:'interruption_exists'};
      if(!preview.window){
        const stop=jalaliDayNumber(start);
        const baseline=stop===null?null:previewPlannedPause(entity,range,{
          id:previous?.id,type:'planned_pause',multiday:true,day:start,
          resumeMode:'manual',resumeOn:scheduleDate(stop+1),
        },lookup).window;
        return {ok:false,code:baseline?'invalid_resume':'invalid_start'};
      }
      resumeOn=scheduleDate(preview.window.resume);
      if(entries.some(entry=>entry?.type==='execution_obstacle' && entry.multiday && entry.day<resumeOn
        && (!entry.resumedOn || entry.resumedOn>start)))return {ok:false,code:'interruption_exists'};
    }
    const reason=String(draft.reason||'').trim(),description=String(draft.description||'').trim();
    const contact=(projectRepository.find(projectId)?.contacts||[]).find(person=>person && !person.trashed && String(person.id)===draft.contactId);
    if(!reason)return {ok:false,code:'reason_required'};
    if(!description)return {ok:false,code:'description_required'};
    if((planned && !date(resumeOn)) || (resumeOn && (!date(resumeOn)||resumeOn<start||planned && resumeOn===start)))
      return {ok:false,code:'invalid_resume'};
    if(draft.durationHours!=null && !(Number.isFinite(draft.durationHours)&&draft.durationHours>0&&draft.durationHours<=24))
      return {ok:false,code:'invalid_duration'};
    if(!planned && !['external','unknown'].includes(draft.role) && !contact)return {ok:false,code:'contact_required'};
    const contacts=(projectRepository.find(projectId)?.contacts||[]).filter(person=>person && !person.trashed);
    const contactIds=[...new Set(draft.contactIds||[])];
    if(draft.isDailyReport && contactIds.some(id=>!contacts.some(person=>String(person.id)===id)))return {ok:false,code:'contact_required'};
    if(draft.isDailyReport && !(previous?.reason===reason && previous.reasonId===draft.reasonId) && (!Object.hasOwn(INACTIVE_REASONS,draft.reasonId) || INACTIVE_REASONS[draft.reasonId]!==reason))
      return {ok:false,code:'reason_required'};
    if(!previous && draft.isDailyReport && (!planned || !range) && (executionInterruption(entity,day) || interruptionReportOf(entity,start)
      || entries.some(entry=>entry.isDailyReport && !entry.resumedOn && entry.day>=start && (!planned || entry.day<resumeOn))))
      return {ok:false,code:'interruption_exists'};
    const attributedContacts=planned?[]:contactIds.map(id=>{
      const person=contacts.find(contact=>String(contact.id)===id);
      return {id,name:[person.firstName,person.lastName].filter(Boolean).join(' ')||person.name||person.title||''};
    });
    const details={day:start,reason,description,resumeOn,...(planned?{resumePredecessorId,resumeMode,resumeLagDays,resumeRelationType,resumeDurationDays}:{}),multiday:!!draft.multiday,
      ...(draft.isDailyReport?{isDailyReport:true,reasonId:draft.reasonId,attributedContacts}:{}),
      role:planned?'':draft.role,contactId:planned?'':String(contact?.id||''),
      contactName:planned?'':String(contact?.name||contact?.title||''),
      durationHours:draft.durationHours ?? null,photos:draft.photos||[],baselineResume:previous?.baselineResume||resumeOn,baselineEnd:previous?.baselineEnd||entity.scheduleEnd||''};
    if(historicalStop && entries.some(entry=>entry!==previous && entry?.multiday &&
      ['planned_pause','execution_obstacle'].includes(entry.type) && entry.day<resumeOn &&
      (!(entry.resumedOn || entry.resumeOn) || (entry.resumedOn || entry.resumeOn)>start))){
      return {ok:false,code:'interruption_exists'};
    }
    const entry=previous?{...previous,...details,...(planned?{resumeRequiresConfirmation:true}:{}),updatedAt:at,updatedBy:by}:event(planned?'planned_pause':'execution_obstacle',by,at,details);
    return mutate(projectId,ref,current=>({...current,updatedAt:at,
      executionHistory:previous?(current.executionHistory||[]).map(value=>value.id===previous.id?entry:value):[...(current.executionHistory||[]),entry]}));
  },
  setProgress(projectId,ref,value,actor,clock=Date.now){
    const by=actorValue(actor);
    const entity=todayRepository.get(projectId,ref);
    const progress=Number(value);
    if(!Number.isInteger(progress)||progress<0||progress>100)return {ok:false,code:'invalid_progress'};
    if(!entity || entity.trashed || !by.contactId || String(entity.assigneeContactId)!==by.contactId)return {ok:false,code:'forbidden'};
    if(entity.completed || ['approved','pending_approval'].includes(entity.completionState))return {ok:false,code:'locked'};
    const at=clock(),day=tehranTodayJalali(new Date(at));
    return mutate(projectId,ref,current=>{
      const updated={...current,progress,actualStart:progress>0?(current.actualStart||day):current.actualStart,
        workflowStatus:'in_progress',updatedAt:at,
        executionHistory:[...(current.executionHistory||[]),event('progress_updated',by,at,{day,progress})]};
      return progress===100?completeExecution(updated,ref,by,at,day):updated;
    },{completion:ref.kind==='task' && progress===100 ? saved=>saved.completed || undefined:undefined});
  },
  setDailyStatus(projectId,ref,status,reasonId,note,actor,clock=Date.now){
    const entity=todayRepository.get(projectId,ref);
    const by=actorValue(actor);
    if(!entity || entity.trashed || !by.contactId || String(entity.assigneeContactId)!==by.contactId)return {ok:false,code:'forbidden'};
    if(entity.completed || ['approved','pending_approval'].includes(entity.completionState))return {ok:false,code:'locked'};
    const at=clock(),day=tehranTodayJalali(new Date(at));
    if(interruptionReportOf(entity,day) || executionInterruption(entity,day))return {ok:false,code:'interruption_exists'};
    const change=dailyStatusChange(entity,status,reasonId,note,by,at,day);
    if(!change.ok)return change;
    if(!change.entry)return {ok:true,entity};
    return mutate(projectId,ref,current=>({
      ...current,executionHistory:[...(current.executionHistory||[]),change.entry],updatedAt:at,
    }));
  },

  saveReport(projectId, ref, description, actor, clock = Date.now, progress = null, {files, completeAt100=false, dailyStatus}={}){
    const text = String(description || '').trim();
    if(text.length < REPORT_MIN_LENGTH) return { ok:false, code:'report_too_short' };
    const at = clock(); const by = actorValue(actor); const reportDay = tehranTodayJalali(new Date(at));
    const entity = todayRepository.get(projectId, ref);
    if(completeAt100 || dailyStatus){
      if(!entity || entity.trashed || !entity.assigneeContactId || String(entity.assigneeContactId)!==by.contactId){
        return {ok:false,code:'forbidden'};
      }
      if(entity.completed || ['approved','pending_approval'].includes(entity.completionState)){
        return {ok:false,code:'locked'};
      }
    }
    const stopReport=interruptionReportOf(entity,reportDay);
    if((stopReport && stopReport.resumedOn!==reportDay) || executionInterruption(entity||{},reportDay))return {ok:false,code:'interruption_exists'};
    const change=dailyStatus?dailyStatusChange(entity,dailyStatus.status,dailyStatus.reasonId,text,by,at,reportDay):{ok:true};
    if(!change.ok)return change;
    const attachments = Array.isArray(files) ? { photos:[...files] } : {};
    return mutate(projectId, ref, entity => {
      const reports = [...(entity.executionReports || []).filter(report => report && !report.trashed)];
      const history = [...(entity.executionHistory || [])];
      if(change.entry)history.push(change.entry);
      const reportIndex = reports.findLastIndex(report => (
        executionReportDay(report) === reportDay
      ));
      const nextProgress = progress === null || progress === undefined
        ? Number(entity.progress) || 0
        : Math.min(100, Math.max(0, Number(progress) || 0));
      if(reportIndex >= 0){
        const current = reports[reportIndex];
        reports[reportIndex] = { ...current, ...attachments, description:text, progress:nextProgress, reportDay, updatedBy:by, updatedAt:at };
        history.push(event('report_edited', by, at, { reportId:current.id, day:reportDay }));
      }else{
        const report = { id:uid(), ...attachments, description:text, progress:nextProgress, reportDay, createdBy:by, createdAt:at, updatedAt:null, updatedBy:null };
        reports.push(report);
        history.push(event('report_created', by, at, { reportId:report.id, day:reportDay }));
      }
      const updated = { ...entity, progress:nextProgress, actualStart:entity.actualStart || reportDay, executionReports:reports, executionHistory:history, workflowStatus:'in_progress', updatedAt:at };
      return completeAt100 && nextProgress===100 ? completeExecution(updated,ref,by,at,reportDay) : updated;
    },{completion:completeAt100 ? saved=>saved.completed || undefined : undefined});
  },

  editComment(projectId,ref,id,text,actor,clock=Date.now){
    const entity=todayRepository.get(projectId,ref);
    const comment=entity?.executionComments?.find(item=>item.id===id && !item.trashed);
    const by=actorValue(actor);
    const value=String(text||'').trim();
    if(!comment || comment.type==='approval_rejected' || by.id==='guest' || comment.createdBy?.id!==by.id)return {ok:false,code:'forbidden'};
    if(value.length<COMMENT_MIN_LENGTH)return {ok:false,code:'comment_too_short'};
    if(value===comment.text)return {ok:true,entity};
    const at=clock();
    return mutate(projectId,ref,current=>({...current,
      executionComments:current.executionComments.map(item=>item.id===id?{...item,text:value,updatedAt:at}:item),
      executionHistory:[...(current.executionHistory||[]),event('comment_edited',by,at,{commentId:id})],updatedAt:at,
    }));
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
    if(result.ok && ref.kind === 'task') workTaskApi.setCompleted(projectId, ref.workId, ref.id, Boolean(result.entity.actualStart && !executionApproverIds(result.entity).length));
    return result;
  },

  approve(projectId, ref, actor, clock = Date.now){
    const at = clock(); const by = actorValue(actor);
    const entity=todayRepository.get(projectId,ref);
    if(ref.kind==='standalone' && entity?.oddJobType && (entity.expenseApprovalStatus!=='pending' || !by.contactId || entity.expenseApproverContactId!==by.contactId))return {ok:false,code:'forbidden'};
    if(executionApproverIds(entity).length>1 && (entity.completionState!=='pending_approval'
      || !pendingExecutionApproverIds(entity).includes(by.contactId)))return {ok:false,code:'forbidden'};
    return mutate(projectId,ref,entity=>approveExecutionEntity(entity,ref.kind,by,at),{completion:saved=>saved.completed||undefined});
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

