import { projectContext } from '../../core/projectContext.js';
import { projectRepository } from '../../data/projectRepository.js';
import { isStage, isWork, progressOf, scheduleEndOf, scheduleStartOf } from '../../domain/wbs/normalize.js';
import { rollupProgress } from '../../domain/wbs/estimate.js';
import { gregorianToJalali, jalaliToGregorian } from '../../ui/jalali.js';
import { isExpanded } from './wbsExpandState.js';

const STYLE_ID = 'wbs-timeline-enhancements';
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
  gantt.querySelectorAll('.wbs-gantt-header span').forEach((span, index) => {
    const start = min + (index * 7);
    const widthDays = Math.max(1, Math.round((parseFloat(span.style.width) || 168) / 24));
    const end = start + widthDays;
    span.textContent = rangeLabel(start, end);
  });
}

function paintProgress(gantt, entries){
  const lines = [...gantt.querySelectorAll('.wbs-gantt-line')];
  lines.forEach((line, index) => {
    const entry = entries[index];
    const bar = line.querySelector('.wbs-gantt-bar');
    if(!entry || !bar) return;
    bar.querySelector('.wbs-gantt-progress-fill')?.remove();
    const progress = displayedProgress(entry.item);
    bar.dataset.progress = String(progress);
    bar.setAttribute('aria-label', `${entry.item.text || ''}، پیشرفت ${faNumber(progress)} درصد`);
    if(progress <= 0) return;
    const fill = document.createElement('span');
    fill.className = 'wbs-gantt-progress-fill';
    fill.style.width = `${progress}%`;
    const label = document.createElement('span');
    label.className = 'wbs-gantt-progress-label';
    label.textContent = `${faNumber(progress)}٪`;
    fill.appendChild(label);
    bar.appendChild(fill);
  });
}

function syncRowHeights(gantt){
  const names = [...gantt.querySelectorAll('.wbs-gantt-name')];
  const lines = [...gantt.querySelectorAll('.wbs-gantt-line')];
  names.forEach((name, index) => {
    const line = lines[index];
    if(!line) return;
    name.style.height = '';
    line.style.height = '';
    const height = Math.max(46, name.scrollHeight);
    name.style.height = `${height}px`;
    line.style.height = `${height}px`;
  });
}

function enhance(){
  const gantt = document.querySelector('.wbs-gantt');
  if(!gantt) return;
  const project = activeProject();
  if(!project) return;
  const entries = flattenVisible(project.tasks || [], project.id);
  paintHeader(gantt, entries);
  paintProgress(gantt, entries);
  syncRowHeights(gantt);
}

function scheduleEnhance(){
  if(frame) cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    frame = 0;
    enhance();
  });
}

function installStyles(documentRef){
  if(documentRef.getElementById(STYLE_ID)) return;
  const style = documentRef.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .wbs-gantt-timeline{transform:scaleX(-1);transform-origin:center;}
    .wbs-gantt-header span,.wbs-gantt-bar,.wbs-gantt-unscheduled{transform:scaleX(-1);}
    .wbs-gantt-bar{overflow:hidden;color:#fff;}
    .wbs-gantt-progress-fill{position:absolute;z-index:1;inset-block:0;right:0;background:rgba(0,0,0,.28);display:flex;align-items:center;justify-content:center;overflow:hidden;border-radius:inherit;pointer-events:none;}
    .wbs-gantt-progress-label{position:relative;z-index:2;color:#fff;font-size:9px;font-weight:700;line-height:1;white-space:nowrap;text-shadow:0 1px 1px rgba(0,0,0,.35);direction:rtl;}
    .wbs-gantt-bar.is-stage .wbs-gantt-progress-label{font-size:8px;}
    @media (max-width:719px){
      .is-timeline-view .wbs-tree{overflow:visible;padding-inline:10px;}
      .wbs-gantt{display:grid;grid-template-columns:minmax(300px,82vw) max-content;overflow-x:auto;overflow-y:hidden;direction:rtl;overscroll-behavior-inline:contain;-webkit-overflow-scrolling:touch;touch-action:pan-x pan-y;}
      .wbs-gantt-names{min-width:300px;box-shadow:none;}
      .wbs-gantt-scroll{width:max-content;min-width:max-content;overflow:visible;scrollbar-gutter:auto;}
      .wbs-gantt-name{height:auto;min-height:46px;align-items:center;}
      .wbs-gantt-name>span:last-child{white-space:normal;overflow:visible;text-overflow:clip;line-height:1.55;}
    }
    @media (min-width:720px){
      .wbs-gantt{overflow:hidden;}
      .wbs-gantt-names{position:relative;z-index:2;}
      .wbs-gantt-scroll{overflow-x:auto;overflow-y:hidden;}
    }
  `;
  documentRef.head.appendChild(style);
}

export function installTimelineEnhancements({ windowRef = window, documentRef = document } = {}){
  installStyles(documentRef);
  if(observer) observer.disconnect();
  observer = new MutationObserver(scheduleEnhance);
  observer.observe(documentRef.getElementById('content') || documentRef.body, { childList:true, subtree:true });
  windowRef.addEventListener('resize', scheduleEnhance, { passive:true });
  scheduleEnhance();
  return () => observer?.disconnect();
}
