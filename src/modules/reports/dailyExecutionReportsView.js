import { renderTodayCard } from '../wbs/todayView.js';
import { appendReportPhotos } from '../wbs/dailyExecutionReport.js';
import { executionWorkKey, executionReportDay, jalaliDayNumber, tehranTodayJalali } from '../../domain/wbs/todayDomain.js';
import { formatJalaliDisplay, openJalaliPicker } from '../../ui/jalali.js';
import { toEnglishDigits, toPersianDigits } from '../../ui/digits.js';
import { openWbsSheet, closeWbsSheet } from '../wbs/wbsSheet.js';
import { openContractorPicker, openActivityPicker, openContractTemplatePicker } from '../contracts/contractPickers.js';

const clock = new Intl.DateTimeFormat('fa-IR', { timeZone:'Asia/Tehran', hour:'2-digit', minute:'2-digit' });
const kindLabel = { progress:'گزارش پیشرفت', start_delayed:'شروع نشد' };

export {executionWorkKey};

export function collectDailyExecutionReports(project){
  const rows = [];
  function add(entity, path, ref){
    if(!entity || entity.trashed || (entity.type==='خرید' && ref.kind!=='standalone')) return;
    const work = {
      key:executionWorkKey(ref),
      item:{...ref,entity,path},
      title:entity.title || entity.text || 'کار',
      path:path.join(' ← '),
      contractorContactId: entity.contractorContactId || '',
      activityIds: entity.activityIds || (entity.activityId ? [entity.activityId] : []),
      templateId: entity.templateId || '',
    };
    for(const report of entity.executionReports || []){
      if(!report || report.trashed) continue;
      const day = executionReportDay(report);
      if(jalaliDayNumber(day) === null) continue;
      rows.push({ work, kind:'progress', day, at:report.createdAt, author:report.createdBy?.name,
        description:report.description, progress:report.progress, photos:report.photos });
    }
    for(const entry of entity.executionHistory || []){
      if(entry?.type !== 'start_delayed') continue;
      if(jalaliDayNumber(entry.day) === null) continue;
      rows.push({ work, kind:'start_delayed', day:entry.day, at:entry.at, author:entry.actor?.name,
        description:[entry.reason,entry.description].filter(Boolean).join('\n') });
    }
  }
  function walk(nodes, path){
    for(const node of nodes || []){
      if(!node || node.trashed) continue;
      add(node, path, { kind:'work', workId:node.id, id:node.id });
      const next = [...path, node.text || node.title].filter(Boolean);
      for(const task of node.workTasks || []){
        if(task) add(task, next, { kind:'task', workId:node.id, id:task.id });
      }
      walk(node.subtasks, next);
    }
  }
  walk(project?.tasks, []);
  for(const work of project?.standaloneWorks||[]){
    if(work)add(work,[],{kind:'standalone',workId:work.id,id:work.id});
  }
  return rows.sort((a,b)=>b.day.localeCompare(a.day) || new Date(b.at) - new Date(a.at));
}

function searchable(value){
  return toEnglishDigits(String(value ?? '')).replaceAll('ي','ی').replaceAll('ك','ک').replace(/\s|\u200c/g,'').toLowerCase();
}

export function filterDailyExecutionReports(rows, filters = {}){
  const { query, selectedWorkKeys, contractorId, activityId, templateId, fromDay, toDay } = filters;
  const search = searchable(query);
  const keySet = selectedWorkKeys && selectedWorkKeys.size ? selectedWorkKeys : null;
  return rows.filter(row=>{
    const day = jalaliDayNumber(row.day);
    if(keySet && !keySet.has(row.work.key)) return false;
    if(contractorId && String(row.work.contractorContactId) !== String(contractorId)) return false;
    if(activityId && !(row.work.activityIds || []).map(String).includes(String(activityId))) return false;
    if(templateId && String(row.work.templateId) !== String(templateId)) return false;
    if(fromDay != null && day < fromDay) return false;
    if(toDay != null && day > toDay) return false;
    if(search && ![row.work.title, row.work.path, row.description].some(value=>searchable(value).includes(search))) return false;
    return true;
  });
}

function counts(rows){
  const delays = rows.filter(row=>row.kind==='start_delayed').length;
  return `${toPersianDigits(rows.length-delays)} گزارش پیشرفت · ${toPersianDigits(delays)} ثبت دلیل شروع نشدن`;
}

// ... (truncated for brevity in this example, but in real call include full)
