import { jalaliToGregorian } from '../../ui/jalali.js';
import { activeWorkTasks } from './workTaskModel.js';
import { isWork } from './normalize.js';

export const TODAY_MODES = Object.freeze(['overdue','today','future','pending','unscheduled']);

export function tehranTodayJalali(now = new Date()){
  const parts = new Intl.DateTimeFormat('en-US-u-ca-persian', {
    timeZone:'Asia/Tehran', year:'numeric', month:'2-digit', day:'2-digit',
  }).formatToParts(now);
  const value = type => parts.find(part => part.type === type)?.value || '';
  return `${value('year')}/${value('month')}/${value('day')}`;
}

export function jalaliDayNumber(value){
  const match = String(value || '').match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if(!match) return null;
  const date = jalaliToGregorian(Number(match[1]), Number(match[2]), Number(match[3]));
  return Math.floor(Date.UTC(date.gy, date.gm - 1, date.gd) / 86400000);
}

export function executionStatus(entity){
  if(entity?.completionState === 'pending_approval') return 'pending_approval';
  if(entity?.completionState === 'approved' || entity?.completed) return 'approved';
  if((entity?.executionReports || []).some(report => report && !report.trashed)) return 'in_progress';
  if(Number(entity?.progress) > 0) return 'in_progress';
  return 'not_started';
}

export function timeState(entity, today){
  if(executionStatus(entity) === 'pending_approval') return 'pending';
  if(entity?.returnedToTodayOn === today) return 'today';
  const start = entity?.scheduleStart || '';
  const end = entity?.scheduleEnd || '';
  if(!start || !end) return 'unscheduled';
  if(end < today) return 'overdue';
  if(start > today) return 'future';
  return 'today';
}

export function remainingLabel(entity, today){
  const end = entity?.scheduleEnd || '';
  if(!end) return '';
  const endDay = jalaliDayNumber(end); const todayDay = jalaliDayNumber(today);
  if(endDay === null || todayDay === null) return '';
  const difference = endDay - todayDay;
  if(difference === 0) return 'امروز';
  return difference > 0
    ? `${difference} روز زمان باقی مانده است`
    : `${Math.abs(difference)} روز از موعد گذشته است`;
}

export function collectTodayItems(project, today = tehranTodayJalali()){
  const result = [];
  const walk = (nodes, ancestors = []) => (nodes || []).forEach(node => {
    if(!node || node.trashed) return;
    const title = node.text || node.title || '';
    if(isWork(node)){
      const tasks = activeWorkTasks(node);
      if(tasks.length){
        tasks.forEach(task => {
          if(executionStatus(task) === 'approved') return;
          result.push({
            id:task.id, kind:'task', entity:task, work:node, workId:node.id,
            path:[...ancestors, title].filter(Boolean), mode:timeState(task, today),
          });
        });
      }else if(executionStatus(node) !== 'approved'){
        result.push({
          id:node.id, kind:'work', entity:node, work:node, workId:node.id,
          path:[...ancestors].filter(Boolean), mode:timeState(node, today),
        });
      }
      return;
    }
    walk(node.subtasks, [...ancestors, title]);
  });
  walk(project?.tasks || []);
  return result;
}

export function itemsForMode(project, mode, today = tehranTodayJalali()){
  return collectTodayItems(project, today).filter(item => item.mode === mode);
}

export function contractorForItem(project, item){
  const contract = (project?.contracts || []).find(candidate => (
    candidate && !candidate.trashed && String(candidate.projectItemId || '') === String(item.workId)
  ));
  const contactId = contract?.contractorId || contract?.contactId || item.entity?.contractorContactId || '';
  const contact = (project?.contacts || []).find(candidate => candidate && !candidate.trashed && String(candidate.id) === String(contactId));
  return { contract:contract || null, contact:contact || null };
}

export function statusLabel(status){
  return ({ not_started:'شروع نشده', in_progress:'در حال انجام', pending_approval:'در انتظار تأیید', approved:'تأیید شده' })[status] || 'شروع نشده';
}
