import { gregorianToJalali } from '../../ui/jalali.js';
import { projectScheduleAnalysis } from './scheduling.js';

function jalaliFromDay(day){
  const date = new Date(day * 86400000);
  const j = gregorianToJalali(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  const pad = value => String(value).padStart(2, '0');
  return `${j.jy}/${pad(j.jm)}/${pad(j.jd)}`;
}

function stampItem(item){
  if(!item || item.trashed) return item;
  const next = { ...item };
  if(item.scheduleStart && item.scheduleEnd){
    next.baselineStart = item.scheduleStart;
    next.baselineEnd = item.scheduleEnd;
  }
  if(Array.isArray(item.workTasks)){
    next.workTasks = item.workTasks.map(task => (
      task && !task.trashed && task.scheduleStart && task.scheduleEnd
        ? { ...task, baselineStart:task.scheduleStart, baselineEnd:task.scheduleEnd }
        : task
    ));
  }
  if(Array.isArray(item.subtasks)) next.subtasks = item.subtasks.map(stampItem);
  return next;
}

/** Copy the live schedule into baseline fields. New tasks added later stay unmarked. */
export function captureBaseline(project){
  const analysis = projectScheduleAnalysis(project);
  if(!Number.isFinite(analysis.calculatedFinish)) return { ok:false, code:'empty' };
  return {
    ok:true,
    project:{
      ...project,
      tasks:(project.tasks || []).map(stampItem),
      baselineFinish:jalaliFromDay(analysis.calculatedFinish),
      baselineSetAt:Date.now(),
    },
  };
}
