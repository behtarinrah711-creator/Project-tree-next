import { projectContext } from '../../core/projectContext.js';
import { projectRepository } from '../../data/projectRepository.js';
import { wbsApi } from '../../domain/wbs/wbsApi.js';
import { isStage, isWork, progressOf, scheduleEndOf, scheduleStartOf } from '../../domain/wbs/normalize.js';
import { rollupProgress } from '../../domain/wbs/estimate.js';
import { gregorianToJalali, jalaliToGregorian } from '../../ui/jalali.js';
import {
  advanceExpansionLevel,
  getExpansionProgress,
  getExpandedIds,
  isExpanded,
} from './wbsExpandState.js';
import { fieldRow, openWbsSheet, textInput } from './wbsSheet.js';
import { render } from './homeView.js';

const MONTHS = ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
const EXPAND_ICON = 'M200-200v-240h80v160h160v80H200Zm480-320v-160H520v-80h240v240h-80Z';
const ADD_WORK_PACKAGE_ICON = 'M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h640q33 0 56.5 23.5T880-720v480q0 33-23.5 56.5T800-160H160Zm0-80h640v-480H160v480Zm0 0v-480 480Zm280-80h80v-120h120v-80H520v-120h-80v120H320v80h120v120Z';
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
  if(isWork(item)){
    const start = dayNumber(scheduleStartOf(item));
    const end = dayNumber(scheduleEndOf(item));
    return start !== null && end !== null && end >= start ? { start, end } : null;
  }
  const ranges = (item.subtasks || []).filter(x => !x.trashed).map(scheduleRange).filter(Boolean);
  return ranges.length ? { start:Math.min(...ranges.map(x => x.start)), end:Math.max(...ranges.map(x => x.end)) } : null;
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
    if(isStage(item) && isExpanded(projectId, item.id)) flattenVisible(item.subtasks, projectId, maxDepth, depth + 1, out);
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
  const value = isStage(item) ? rollupProgress([item]) : progressOf(item);
  return Math.max(0, Math.min(100, Number(value) || 0));
}

function materialIcon(path){
  return `<svg viewBox="0 -960 960 960" aria-hidden="true" focusable="false"><path d="${path}"/></svg>`;
}

function openCreateRootSheet(project){
  openWbsSheet({
    title:'افزودن بسته کار',
    saveLabel:'ذخیره',
    body(root){
      root.appendChild(fieldRow('نام مرحله', textInput('', { name:'title', placeholder:'نام مرحله' })));
      root.appendChild(fieldRow('وزن پیشرفت', textInput('1', { name:'progressWeight', type:'number', min:'0.01', step:'0.01', required:true })));
      const note = root.ownerDocument.createElement('div');
      note.className = 'wbs-note';
      note.textContent = 'وزن نسبی است؛ لازم نیست مجموع وزن‌ها ۱۰۰ شود.';
      root.appendChild(note);
    },
    onSave(root){
      const title = root.querySelector('[name="title"]')?.value.trim();
      const progressWeight = Number(root.querySelector('[name="progressWeight"]')?.value);
      if(!title || !Number.isFinite(progressWeight) || progressWeight <= 0) return false;
      wbsApi.createStage(project.id, title, null, { progressWeight });
      render();
      return true;
    },
  });
}

function ensureTimelineToolbar(documentRef, project){
  const root = documentRef.querySelector('.wbs-home-root.is-timeline-view');
  if(!root || root.querySelector(':scope > .wbs-toolbar')) return;
  const tabs = root.querySelector(':scope > .wbs-tabs');
  if(!tabs) return;

  const toolbar = documentRef.createElement('div');
  toolbar.className = 'wbs-toolbar';

  const addRoot = documentRef.createElement('button');
  addRoot.type = 'button';
  addRoot.className = 'wbs-root-add';
  addRoot.setAttribute('aria-label', 'افزودن بسته کار');
  addRoot.innerHTML = `${materialIcon(ADD_WORK_PACKAGE_ICON)}<span>بسته کار</span>`;
  addRoot.addEventListener('click', () => openCreateRootSheet(project));

  const treeToggle = documentRef.createElement('button');
  const isTreeOpen = getExpandedIds(project.id).size > 0;
  const expansionProgress = getExpansionProgress(project.id, project.tasks || []);
  treeToggle.type = 'button';
  treeToggle.className = 'wbs-tree-toggle' + (isTreeOpen ? ' is-active' : '') + (expansionProgress.ratio >= .5 ? ' is-past-midpoint' : '');
  treeToggle.setAttribute('aria-label', 'تغییر سطح نمایش نمودار');
  treeToggle.setAttribute('aria-pressed', isTreeOpen ? 'true' : 'false');
  treeToggle.dataset.expandedLevels = String(expansionProgress.expandedLevels);
  treeToggle.dataset.totalLevels = String(expansionProgress.totalLevels);
  treeToggle.innerHTML = `<svg class="wbs-expand-shade" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true" focusable="false"><rect width="1" height="1" fill="currentColor" opacity="${expansionProgress.ratio}"/></svg>${materialIcon(EXPAND_ICON)}`;
  treeToggle.addEventListener('click', () => {
    advanceExpansionLevel(project.id, project.tasks || []);
    render();
  });

  toolbar.append(addRoot, treeToggle);
  tabs.insertAdjacentElement('afterend', toolbar);
}

function paintProjectTitle(gantt, project){
  const corner = gantt.querySelector('.wbs-gantt-corner');
  if(corner && corner.textContent !== projectLabel(project)) corner.textContent = projectLabel(project);
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
    span.dir = 'rtl';
    if(span.textContent !== label) span.textContent = label;
  });
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
        label.dir = 'rtl';
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
  const maxDepth = maxStageDepth(project.tasks || []);
  const entries = flattenVisible(project.tasks || [], project.id, maxDepth);
  ensureTimelineToolbar(documentRef, project);
  paintProjectTitle(gantt, project);
  paintHeader(gantt, entries);
  paintHierarchy(gantt, entries);
  syncRowHeights(gantt);
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
