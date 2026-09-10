import { projectContext } from '../../core/projectContext.js';
import { projectRepository } from '../../data/projectRepository.js';
import { isStage, isWork, progressOf, scheduleEndOf, scheduleStartOf } from '../../domain/wbs/normalize.js';
import { rollupProgress } from '../../domain/wbs/estimate.js';
import { gregorianToJalali, jalaliToGregorian } from '../../ui/jalali.js';
import { isExpanded } from './wbsExpandState.js';
import { applyTimelineDetails } from './timelineDetails.js';
import { applyTimelineStickyHeader } from './timelineStickyHeader.js';
import { ensureViewToolbar } from './viewToolbar.js';
import { activeWorkTasks } from '../../domain/wbs/workTaskModel.js';
import { actualProgress, plannedProgressOf, scheduleRangeOf } from '../../domain/wbs/scheduling.js';

const MONTHS = ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
const SEASONS = ['بهار','تابستان','پاییز','زمستان'];
const TIMESCALE_ICON = 'M120-240q-33 0-56.5-23.5T40-320q0-33 23.5-56.5T120-400h10.5q4.5 0 9.5 2l182-182q-2-5-2-9.5V-600q0-33 23.5-56.5T400-680q33 0 56.5 23.5T480-600q0 2-2 20l102 102q5-2 9.5-2h21q4.5 0 9.5 2l142-142q-2-5-2-9.5V-640q0-33 23.5-56.5T840-720q33 0 56.5 23.5T920-640q0 33-23.5 56.5T840-560h-10.5q-4.5 0-9.5-2L678-420q2 5 2 9.5v10.5q0 33-23.5 56.5T600-320q-33 0-56.5-23.5T520-400v-10.5q0-4.5 2-9.5L420-522q-5 2-9.5 2H400q-2 0-20-2L198-340q2 5 2 9.5v10.5q0 33-23.5 56.5T120-240Z';
const SVG_NS = 'http://www.w3.org/2000/svg';
const TIMESCALES = [
  { id:'day', label:'روزانه', dayWidth:32, minSpan:28, shade:.2 },
  { id:'week', label:'هفتگی', dayWidth:24, minSpan:28, shade:.4 },
  { id:'month', label:'ماهانه', dayWidth:6, minMonths:3, shade:.6 },
  { id:'quarter', label:'سه‌ماهه', dayWidth:1.8, minMonths:12, shade:.8 },
  { id:'year', label:'سالانه', dayWidth:.6, minYears:3, shade:1 },
];
let observer = null;
let enhanceQueued = false;
let resizeFrame = 0;
let observedRoot = null;
let resizeCallback = null;
let timescaleIndex = 1;

function dayNumber(value){
  const [jy, jm, jd] = String(value || '').split('/').map(Number);
  if(!jy || !jm || !jd) return null;
  return dayFromJalali(jy, jm, jd);
}

function dayFromJalali(jy, jm, jd){
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

function formatProgress(value){
  return `٪${faNumber(value)}`;
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
  return scheduleRangeOf(item);
}

function maxStageDepth(items, depth = 0){
  let max = -1;
  (items || []).filter(x => !x.trashed).forEach(item => {
    if(!isStage(item)) return;
    max = Math.max(max, depth);
    max = Math.max(max, maxStageDepth(item.subtasks || [], depth + 1));
  });
  return max;
}

function flattenVisible(items, projectId, maxDepth, depth = 0, out = []){
  (items || []).filter(x => !x.trashed).forEach(item => {
    const shadeLevel = isStage(item) ? Math.max(1, maxDepth - depth + 1) : 0;
    out.push({ item, depth, range:scheduleRange(item), shadeLevel });
    if(isExpanded(projectId, item.id)){
      if(isStage(item)) flattenVisible(item.subtasks, projectId, maxDepth, depth + 1, out);
      else activeWorkTasks(item).forEach(task => out.push({ item:{ ...task, kind:'workTask', text:task.title, parentWork:item }, depth:depth + 1, range:scheduleRange(task), shadeLevel:0 }));
    }
  });
  return out;
}

function activeProject(){
  const id = projectContext.getProjectId?.() || projectContext.getActiveProjectId?.() || null;
  return id ? projectRepository.getActiveProject(id) : null;
}

function projectLabel(project){
  return String(project?.name || project?.title || project?.text || project?.label || 'پروژه');
}

function displayedProgress(item){
  const value = actualProgress(item);
  return Math.max(0, Math.min(100, Number(value) || 0));
}

function materialIcon(path, className = ''){
  return `<svg${className ? ` class="${className}"` : ''} viewBox="0 -960 960 960" aria-hidden="true" focusable="false"><path d="${path}"/></svg>`;
}

function currentTimescale(){
  return TIMESCALES[timescaleIndex] || TIMESCALES[1];
}

function paintCorner(gantt, project, windowRef, documentRef){
  const corner = gantt.querySelector('.wbs-gantt-corner');
  if(!corner) return;
  let title = corner.querySelector('.wbs-gantt-project-title');
  let toggle = corner.querySelector('.wbs-timescale-toggle');
  if(!title || !toggle){
    corner.textContent = '';
    title = documentRef.createElement('span');
    title.className = 'wbs-gantt-project-title';
    toggle = documentRef.createElement('button');
    toggle.type = 'button';
    toggle.className = 'wbs-timescale-toggle';
    toggle.innerHTML = `<svg class="wbs-timescale-shade" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true" focusable="false"><rect width="1" height="1" fill="currentColor"/></svg>${materialIcon(TIMESCALE_ICON, 'wbs-timescale-icon')}<span class="wbs-timescale-label"></span>`;
    toggle.addEventListener('click', () => {
      timescaleIndex = (timescaleIndex + 1) % TIMESCALES.length;
      scheduleEnhance(windowRef, documentRef);
    });
    corner.append(title, toggle);
  }
  title.textContent = projectLabel(project);
  const scale = currentTimescale();
  toggle.classList.toggle('is-past-midpoint', scale.shade >= .6);
  toggle.setAttribute('aria-label', `نمای ${scale.label}`);
  toggle.setAttribute('title', scale.label);
  toggle.querySelector('.wbs-timescale-shade rect')?.setAttribute('opacity', String(scale.shade));
  const label = toggle.querySelector('.wbs-timescale-label');
  if(label) label.textContent = scale.label;
}

function monthStart(day){
  const j = jalaliFromDay(day);
  return dayFromJalali(j.jy, j.jm, 1);
}

function addJalaliMonths(day, count){
  const j = jalaliFromDay(day);
  const absolute = (j.jy * 12) + (j.jm - 1) + count;
  const jy = Math.floor(absolute / 12);
  const jm = (absolute % 12) + 1;
  return dayFromJalali(jy, jm, 1);
}

function quarterStart(day){
  const j = jalaliFromDay(day);
  const jm = (Math.floor((j.jm - 1) / 3) * 3) + 1;
  return dayFromJalali(j.jy, jm, 1);
}

function yearStart(day){
  const j = jalaliFromDay(day);
  return dayFromJalali(j.jy, 1, 1);
}

function rawTimelineRange(entries){
  const scheduled = entries.filter(entry => entry.range);
  if(scheduled.length){
    return {
      start:Math.min(...scheduled.map(entry => entry.range.start)),
      end:Math.max(...scheduled.map(entry => entry.range.end)),
    };
  }
  const today = Math.floor(Date.now() / 86400000);
  return { start:today, end:today + 27 };
}

function timelineDomain(entries, scale){
  const raw = rawTimelineRange(entries);
  if(scale.id === 'day' || scale.id === 'week'){
    return { start:raw.start, endExclusive:Math.max(raw.end + 1, raw.start + scale.minSpan) };
  }
  if(scale.id === 'month'){
    const start = monthStart(raw.start);
    const rawEndBoundary = addJalaliMonths(monthStart(raw.end), 1);
    return { start, endExclusive:Math.max(rawEndBoundary, addJalaliMonths(start, scale.minMonths)) };
  }
  if(scale.id === 'quarter'){
    const start = quarterStart(raw.start);
    const rawEndBoundary = addJalaliMonths(quarterStart(raw.end), 3);
    return { start, endExclusive:Math.max(rawEndBoundary, addJalaliMonths(start, scale.minMonths)) };
  }
  const start = yearStart(raw.start);
  const endJ = jalaliFromDay(raw.end);
  const rawEndBoundary = dayFromJalali(endJ.jy + 1, 1, 1);
  const startJ = jalaliFromDay(start);
  return { start, endExclusive:Math.max(rawEndBoundary, dayFromJalali(startJ.jy + scale.minYears, 1, 1)) };
}

function bucketLabel(scale, start, endExclusive){
  const j = jalaliFromDay(start);
  if(scale.id === 'day') return j.jd === 1 ? `${faNumber(j.jd)} ${MONTHS[j.jm - 1]}` : faNumber(j.jd);
  if(scale.id === 'week') return rangeLabel(start, endExclusive);
  if(scale.id === 'month') return `${MONTHS[j.jm - 1]} ${faNumber(j.jy)}`;
  if(scale.id === 'quarter') return `${SEASONS[Math.floor((j.jm - 1) / 3)]} ${faNumber(j.jy)}`;
  return faNumber(j.jy);
}

function timelineBuckets(domain, scale){
  const buckets = [];
  let cursor = domain.start;
  while(cursor < domain.endExclusive){
    let next;
    if(scale.id === 'day') next = cursor + 1;
    else if(scale.id === 'week') next = Math.min(domain.endExclusive, cursor + 7);
    else if(scale.id === 'month') next = addJalaliMonths(cursor, 1);
    else if(scale.id === 'quarter') next = addJalaliMonths(cursor, 3);
    else {
      const j = jalaliFromDay(cursor);
      next = dayFromJalali(j.jy + 1, 1, 1);
    }
    next = Math.min(next, domain.endExclusive);
    buckets.push({ start:cursor, endExclusive:next, label:bucketLabel(scale, cursor, next) });
    cursor = next;
  }
  return buckets;
}

function svgElement(documentRef, name, attrs = {}){
  const element = documentRef.createElementNS(SVG_NS, name);
  Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, String(value)));
  return element;
}

function headerCanvas(documentRef, domain, scale, buckets, canvasWidth){
  const days = domain.endExclusive - domain.start;
  const dayWidth = canvasWidth / days;
  const svg = svgElement(documentRef, 'svg', {
    class:'wbs-gantt-scale-header-canvas',
    width:canvasWidth,
    height:42,
    viewBox:`0 0 ${canvasWidth} 42`,
    preserveAspectRatio:'none',
    'aria-hidden':'true',
  });
  buckets.forEach(bucket => {
    const x = (bucket.start - domain.start) * dayWidth;
    const width = Math.max(1, (bucket.endExclusive - bucket.start) * dayWidth);
    const foreign = svgElement(documentRef, 'foreignObject', { x, y:0, width, height:42 });
    const label = documentRef.createElement('div');
    label.className = 'wbs-gantt-scale-label';
    label.textContent = bucket.label;
    foreign.appendChild(label);
    svg.appendChild(foreign);
  });
  return svg;
}

function colorClass(item){
  if(isStage(item)) return 'wbs-gantt-color-stage';
  return ({
    'اجرا':'wbs-gantt-color-1',
    'خرید':'wbs-gantt-color-2',
    'نیروی کار':'wbs-gantt-color-3',
    'پیمانکار':'wbs-gantt-color-4',
    'کرایه':'wbs-gantt-color-5',
    'خدمات':'wbs-gantt-color-6',
    'پیگیری':'wbs-gantt-color-7',
  })[item.type] || 'wbs-gantt-color-default';
}

function restoreRowAction(line){
  const action = line.querySelector('.wbs-gantt-bar,.wbs-gantt-unscheduled');
  if(action && action.parentElement !== line) line.appendChild(action);
  line.querySelector('.wbs-gantt-scale-canvas')?.remove();
  return action;
}

function rowCanvas(documentRef, line, entry, domain, scale, buckets, canvasWidth){
  const days = domain.endExclusive - domain.start;
  const dayWidth = canvasWidth / days;
  const rowHeight = line.classList.contains('is-two-line') ? 46 : 36;
  const svg = svgElement(documentRef, 'svg', {
    class:'wbs-gantt-scale-canvas',
    width:canvasWidth,
    height:rowHeight,
    viewBox:`0 0 ${canvasWidth} ${rowHeight}`,
    preserveAspectRatio:'none',
    'aria-hidden':'true',
  });
  buckets.slice(1).forEach(bucket => {
    const x = (bucket.start - domain.start) * dayWidth;
    svg.appendChild(svgElement(documentRef, 'line', { class:'wbs-gantt-scale-gridline', x1:x, x2:x, y1:0, y2:rowHeight }));
  });
  const action = restoreRowAction(line);
  if(!action) return svg;
  if(entry.range && action.classList.contains('wbs-gantt-bar')){
    action.classList.remove('wbs-gantt-color-stage','wbs-gantt-color-1','wbs-gantt-color-2','wbs-gantt-color-3','wbs-gantt-color-4','wbs-gantt-color-5','wbs-gantt-color-6','wbs-gantt-color-7','wbs-gantt-color-default');
    action.classList.add(colorClass(entry.item));
    const x = Math.max(0, (entry.range.start - domain.start) * dayWidth);
    const naturalWidth = (entry.range.end - entry.range.start + 1) * dayWidth;
    const width = Math.max(8, Math.min(canvasWidth - x, naturalWidth));
    const stage = isStage(entry.item);
    const height = stage ? 10 : 20;
    const y = (rowHeight - height) / 2;
    const foreign = svgElement(documentRef, 'foreignObject', { x, y, width, height });
    foreign.setAttribute('class', 'wbs-gantt-scale-foreign');
    foreign.appendChild(action);
    svg.appendChild(foreign);
  }else if(action.classList.contains('wbs-gantt-unscheduled')){
    const width = 78;
    const height = 26;
    const foreign = svgElement(documentRef, 'foreignObject', { x:8, y:(rowHeight - height) / 2, width, height });
    foreign.setAttribute('class', 'wbs-gantt-scale-foreign is-unscheduled');
    foreign.appendChild(action);
    svg.appendChild(foreign);
  }
  return svg;
}

function scaleSignature(entries, domain, scale, lines){
  const rowShape = lines.map(line => line.classList.contains('is-two-line') ? '2' : '1').join('');
  const ranges = entries.map(entry => entry.range ? `${entry.item.id}:${entry.range.start}-${entry.range.end}` : `${entry.item.id}:x`).join('|');
  return `${scale.id}:${domain.start}:${domain.endExclusive}:${rowShape}:${ranges}`;
}

function paintScaleGeometry(gantt, entries, documentRef){
  const scale = currentTimescale();
  const domain = timelineDomain(entries, scale);
  const buckets = timelineBuckets(domain, scale);
  const canvasWidth = Math.max(1, Math.round((domain.endExclusive - domain.start) * scale.dayWidth));
  const lines = [...gantt.querySelectorAll('.wbs-gantt-line')];
  const signature = scaleSignature(entries, domain, scale, lines);
  gantt.classList.add('is-scale-enhanced');
  TIMESCALES.forEach(item => gantt.classList.remove(`wbs-scale-${item.id}`));
  gantt.classList.add(`wbs-scale-${scale.id}`);
  if(gantt.dataset.timescaleSignature === signature) return;

  const header = gantt.querySelector('.wbs-gantt-header');
  if(header){
    header.textContent = '';
    header.appendChild(headerCanvas(documentRef, domain, scale, buckets, canvasWidth));
  }
  lines.forEach((line, index) => {
    const entry = entries[index];
    if(!entry) return;
    const canvas = rowCanvas(documentRef, line, entry, domain, scale, buckets, canvasWidth);
    line.appendChild(canvas);
  });
  gantt.dataset.timescaleSignature = signature;
}

function paintHierarchy(gantt, entries){
  const names = [...gantt.querySelectorAll('.wbs-gantt-name')];
  names.forEach((row, index) => {
    const entry = entries[index];
    for(let level = 1; level <= 6; level += 1) row.classList.remove(`wbs-gantt-stage-level-${level}`);
    if(entry?.shadeLevel){
      row.classList.add(`wbs-gantt-stage-level-${Math.min(6, entry.shadeLevel)}`);
    }
  });
}

function syncRowHeights(gantt){
  const names = [...gantt.querySelectorAll('.wbs-gantt-name')];
  const lines = [...gantt.querySelectorAll('.wbs-gantt-line')];
  names.forEach((name, index) => {
    const title = name.querySelector(':scope > span:last-child');
    const line = lines[index];
    if(!title || !line) return;
    const twoLine = title.scrollHeight > 22;
    name.classList.toggle('is-two-line', twoLine);
    line.classList.toggle('is-two-line', twoLine);
  });
}

function paintProgress(gantt, entries){
  const lines = [...gantt.querySelectorAll('.wbs-gantt-line')];
  lines.forEach((line, index) => {
    const entry = entries[index];
    const bar = line.querySelector('.wbs-gantt-bar');
    if(!entry || !bar) return;

    const progress = displayedProgress(entry.item);
    const progressText = formatProgress(progress);
    bar.dataset.progress = String(progress);
    const planned = plannedProgressOf(entry.item);
    bar.dataset.planned = planned === null ? '' : String(planned);
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

    if(!label){
      label = bar.ownerDocument.createElement('span');
      label.className = 'wbs-gantt-progress-label';
      label.dir = 'rtl';
      bar.appendChild(label);
    }
    if(label.textContent !== progressText) label.textContent = progressText;
  });
}

function enhance(windowRef, documentRef){
  const gantt = documentRef.querySelector('.wbs-gantt');
  if(!gantt) return;
  const project = activeProject();
  if(!project) return;
  const maxDepth = maxStageDepth(project.tasks || []);
  const entries = flattenVisible(project.tasks || [], project.id, maxDepth);

  paintCorner(gantt, project, windowRef, documentRef);
  const root = gantt.closest('.wbs-home-root');
  if(root) ensureViewToolbar(root, 'timeline');

  paintHierarchy(gantt, entries);
  syncRowHeights(gantt);
  paintScaleGeometry(gantt, entries, documentRef);
  paintProgress(gantt, entries);
  applyTimelineDetails(gantt, entries, documentRef);
  applyTimelineStickyHeader(gantt, windowRef, documentRef);
}

function resumeObservation(){
  if(observer && observedRoot){
    observer.observe(observedRoot, { childList:true, subtree:true });
  }
}

function runEnhance(windowRef, documentRef){
  observer?.disconnect();
  try{
    enhance(windowRef, documentRef);
  }finally{
    resumeObservation();
  }
}

function scheduleEnhance(windowRef, documentRef){
  if(enhanceQueued) return;
  enhanceQueued = true;
  queueMicrotask(() => {
    enhanceQueued = false;
    runEnhance(windowRef, documentRef);
  });
}

export function installTimelineEnhancements({ windowRef = window, documentRef = document } = {}){
  observer?.disconnect();
  if(resizeCallback) windowRef.removeEventListener('resize', resizeCallback);
  if(resizeFrame) cancelAnimationFrame(resizeFrame);

  observedRoot = documentRef.getElementById('content') || documentRef.body;
  const callback = () => scheduleEnhance(windowRef, documentRef);
  observer = new MutationObserver(callback);
  resumeObservation();

  resizeCallback = () => {
    if(resizeFrame) cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      scheduleEnhance(windowRef, documentRef);
    });
  };
  windowRef.addEventListener('resize', resizeCallback, { passive:true });

  // DOM-driven Timeline renders are enhanced in a microtask, before the browser's
  // next paint. This avoids displaying the base Gantt and then repainting a second
  // layout one frame later when entering Timeline or expanding the deepest level.
  scheduleEnhance(windowRef, documentRef);
  return () => {
    observer?.disconnect();
    if(resizeCallback) windowRef.removeEventListener('resize', resizeCallback);
    if(resizeFrame) cancelAnimationFrame(resizeFrame);
    observedRoot = null;
    resizeCallback = null;
    resizeFrame = 0;
  };
}
