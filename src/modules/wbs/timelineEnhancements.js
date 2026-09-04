import { projectContext } from '../../core/projectContext.js';
import { projectRepository } from '../../data/projectRepository.js';
import { isStage, isWork, progressOf, scheduleEndOf, scheduleStartOf } from '../../domain/wbs/normalize.js';
import { rollupProgress } from '../../domain/wbs/estimate.js';
import { gregorianToJalali, jalaliToGregorian } from '../../ui/jalali.js';
import { isExpanded } from './wbsExpandState.js';

const MONTHS = ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
let observer = null;
let frame = 0;

function dayNumber(value){
  const [jy, jm, jd] = String(value || '').split('/').map(Number);
  if(!jy || !jm || !jd) return null;
  const g = jalaliToGregorian(jy, jm, jd);
  return Math.floor(Date.UTC(g.gy, g.gm - 1, g.gd) / 86400000);
}

function jalaliFromDay(day){
  const date = new Date(day * 86400000);
  return gregorianToJalali(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function faNumber(value){
  return new Intl.NumberFormat('fa-IR', { useGrouping:false, maximumFractionDigits:2 }).format(value);
}

function rangeLabel(startDay, endDay){
  const a = jalaliFromDay(startDay);
  const b = jalaliFromDay(endDay);
  if(a.jy === b.jy && a.jm === b.jm){
    return `${faNumber(a.jd)} تا ${faNumber(b.jd)} ${MONTHS[a.jm - 1]}`;
  }
  return `${faNumber(a.jd)} ${MONTHS[a.jm - 1]} تا ${faNumber(b.jd)} ${MONTHS[b.jm - 1]}`;
}

function scheduleRange(item){
  if(isWork(item)){
    const start = dayNumber(scheduleStartOf(item));
    const end = dayNumber(scheduleEndOf(item));
    return start !== null && end !== null && end >= start ? { start, end } : null;
  }
  const ranges = (item.subtasks || []).filter(x => !x.trashed).map(scheduleRange).filter(Boolean);
  return ranges.length ? { start:Math.min(...ranges.map(x => x.start)), end:Math.max(...ranges.map(x => x.end)) } : null;
}

function flattenVisible(items, projectId, depth = 0, out = []){
  (items || []).filter(x => !x.trashed).forEach(item => {
    out.push({ item, depth, range:scheduleRange(item) });
    if(isStage(item) && isExpanded(projectId, item.id)) flattenVisible(item.subtasks, projectId, depth + 1, out);
  });
  return out;
}

function activeProject(){
  const id = projectContext.getProjectId?.() || projectContext.getActiveProjectId?.() || null;
  return id ? projectRepository.getActiveProject(id) : null;
}

function displayedProgress(item){
  const value = isStage(item) ? rollupProgress([item]) : progressOf(item);
  return Math.max(0, Math.min(100, Number(value) || 0));
}

function paintHeader(gantt, entries){
  const scheduled = entries.filter(entry => entry.range);
  if(!scheduled.length) return;
  const min = Math.min(...scheduled.map(entry => entry.range.start));
  const max = Math.max(...scheduled.map(entry => entry.range.end));
  const days = Math.max(28, max - min + 1);
  gantt.querySelectorAll('.wbs-gantt-header span').forEach((span, index) => {
    const start = min + (index * 7);
    const widthDays = Math.min(7, Math.max(1, days - (index * 7)));
    const label = rangeLabel(start, start + widthDays);
    if(span.textContent !== label) span.textContent = label;
  });
}

function paintProgress(gantt, entries){
  const lines = [...gantt.querySelectorAll('.wbs-gantt-line')];
  lines.forEach((line, index) => {
    const entry = entries[index];
    const bar = line.querySelector('.wbs-gantt-bar');
    if(!entry || !bar) return;

    const progress = displayedProgress(entry.item);
    const progressText = `${faNumber(progress)}٪`;
    bar.dataset.progress = String(progress);
    bar.setAttribute('aria-label', `${entry.item.text || ''}، پیشرفت ${faNumber(progress)} درصد`);

    let meter = bar.querySelector('.wbs-gantt-progress-meter');
    let label = bar.querySelector('.wbs-gantt-progress-label');

    if(progress <= 0){
      meter?.remove();
      label?.remove();
      return;
    }

    if(!meter){
      meter = bar.ownerDocument.createElement('progress');
      meter.className = 'wbs-gantt-progress-meter';
      meter.max = 100;
      meter.setAttribute('aria-hidden', 'true');
      bar.appendChild(meter);
    }
    meter.value = progress;

    if(progress >= 20){
      if(!label){
        label = bar.ownerDocument.createElement('span');
        label.className = 'wbs-gantt-progress-label';
        bar.appendChild(label);
      }
      if(label.textContent !== progressText) label.textContent = progressText;
    }else{
      label?.remove();
    }
  });
}

function enhance(documentRef){
  const gantt = documentRef.querySelector('.wbs-gantt');
  if(!gantt) return;
  const project = activeProject();
  if(!project) return;
  const entries = flattenVisible(project.tasks || [], project.id);
  paintHeader(gantt, entries);
  paintProgress(gantt, entries);
}

function scheduleEnhance(documentRef){
  if(frame) cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    frame = 0;
    enhance(documentRef);
  });
}

export function installTimelineEnhancements({ windowRef = window, documentRef = document } = {}){
  if(observer) observer.disconnect();
  const callback = () => scheduleEnhance(documentRef);
  observer = new MutationObserver(callback);
  observer.observe(documentRef.getElementById('content') || documentRef.body, { childList:true, subtree:true });
  windowRef.addEventListener('resize', callback, { passive:true });
  scheduleEnhance(documentRef);
  return () => {
    observer?.disconnect();
    windowRef.removeEventListener('resize', callback);
  };
}
