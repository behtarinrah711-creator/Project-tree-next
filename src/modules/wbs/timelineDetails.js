import { projectContext } from '../../core/projectContext.js';
import { projectRepository } from '../../data/projectRepository.js';
import { isStage, isWork, scheduleEndOf, scheduleStartOf } from '../../domain/wbs/normalize.js';
import { isExpanded } from './wbsExpandState.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const BAR_HEIGHT = 8;
let observer = null;
let frame = 0;

function faNumber(value){
  return new Intl.NumberFormat('fa-IR', { useGrouping:false, maximumFractionDigits:0 }).format(value);
}

export function formatTimelineDate(value){
  const [, jm, jd] = String(value || '').split('/').map(Number);
  if(!jm || !jd) return '';
  return `${faNumber(jm)}/${faNumber(jd)}`;
}

function dateKey(value){
  const [jy, jm, jd] = String(value || '').split('/').map(Number);
  if(!jy || !jm || !jd) return null;
  return (jy * 372) + (jm * 31) + jd;
}

function scheduleRange(item){
  if(isWork(item)){
    const start = scheduleStartOf(item);
    const end = scheduleEndOf(item);
    const startKey = dateKey(start);
    const endKey = dateKey(end);
    return startKey !== null && endKey !== null && endKey >= startKey
      ? { start, end, startKey, endKey }
      : null;
  }
  const ranges = (item.subtasks || []).filter(child => !child.trashed).map(scheduleRange).filter(Boolean);
  if(!ranges.length) return null;
  return {
    start:ranges.reduce((best, range) => range.startKey < best.startKey ? range : best).start,
    end:ranges.reduce((best, range) => range.endKey > best.endKey ? range : best).end,
    startKey:Math.min(...ranges.map(range => range.startKey)),
    endKey:Math.max(...ranges.map(range => range.endKey)),
  };
}

function flattenVisible(items, projectId, depth = 0, out = []){
  (items || []).filter(item => !item.trashed).forEach(item => {
    out.push({ item, depth, range:scheduleRange(item) });
    if(isStage(item) && isExpanded(projectId, item.id)) flattenVisible(item.subtasks, projectId, depth + 1, out);
  });
  return out;
}

function activeProject(){
  const id = projectContext.getProjectId?.() || projectContext.getActiveProjectId?.() || null;
  return id ? projectRepository.getActiveProject(id) : null;
}

function svgElement(documentRef, name, attrs = {}){
  const element = documentRef.createElementNS(SVG_NS, name);
  Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, String(value)));
  return element;
}

function clamp(value, min, max){
  return Math.max(min, Math.min(max, value));
}

function detailForeignObject(documentRef, { className, x, y, width, height, text, dir = 'rtl' }){
  const foreign = svgElement(documentRef, 'foreignObject', {
    class:`wbs-gantt-detail ${className}`,
    x,
    y,
    width,
    height,
  });
  const label = documentRef.createElement('div');
  label.className = 'wbs-gantt-detail-label';
  label.dir = dir;
  label.textContent = text;
  foreign.appendChild(label);
  return foreign;
}

function paintRowDetails(documentRef, line, entry){
  const canvas = line.querySelector('.wbs-gantt-scale-canvas');
  const bar = canvas?.querySelector('.wbs-gantt-bar');
  const barForeign = bar?.closest('.wbs-gantt-scale-foreign');
  if(!canvas || !bar || !barForeign || !entry?.range) return;

  canvas.querySelectorAll('.wbs-gantt-detail').forEach(node => node.remove());

  const rowHeight = Number(canvas.getAttribute('height')) || (line.classList.contains('is-two-line') ? 46 : 36);
  const canvasWidth = Number(canvas.getAttribute('width')) || 1;
  const barX = Number(barForeign.getAttribute('x')) || 0;
  const barWidth = Math.max(1, Number(barForeign.getAttribute('width')) || 1);
  const barY = (rowHeight - BAR_HEIGHT) / 2;
  barForeign.setAttribute('height', String(BAR_HEIGHT));
  barForeign.setAttribute('y', String(barY));

  const title = String(entry.item?.text || entry.item?.title || '').trim();
  if(title){
    const titleWidth = Math.min(canvasWidth, Math.max(84, Math.min(180, Math.max(barWidth, title.length * 7))));
    const titleX = clamp(barX + (barWidth - titleWidth) / 2, 0, Math.max(0, canvasWidth - titleWidth));
    canvas.appendChild(detailForeignObject(documentRef, {
      className:`wbs-gantt-detail-title${isStage(entry.item) ? ' is-stage' : ''}`,
      x:titleX,
      y:Math.max(0, barY - 13),
      width:titleWidth,
      height:12,
      text:title,
    }));
  }

  const dateWidth = 46;
  const dateY = Math.min(rowHeight - 11, barY + BAR_HEIGHT + 1);
  const startX = clamp(barX - dateWidth + 4, 0, Math.max(0, canvasWidth - dateWidth));
  const finishX = clamp(barX + barWidth - 4, 0, Math.max(0, canvasWidth - dateWidth));
  canvas.appendChild(detailForeignObject(documentRef, {
    className:'wbs-gantt-detail-date is-start',
    x:startX,
    y:dateY,
    width:dateWidth,
    height:10,
    text:formatTimelineDate(entry.range.start),
    dir:'ltr',
  }));
  canvas.appendChild(detailForeignObject(documentRef, {
    className:'wbs-gantt-detail-date is-finish',
    x:finishX,
    y:dateY,
    width:dateWidth,
    height:10,
    text:formatTimelineDate(entry.range.end),
    dir:'ltr',
  }));
}

function separatorRows(gantt, entries){
  const names = [...gantt.querySelectorAll('.wbs-gantt-name')];
  const lines = [...gantt.querySelectorAll('.wbs-gantt-line')];
  entries.forEach((entry, index) => {
    const separatedRoot = entry.depth === 0 && index > 0;
    names[index]?.classList.toggle('wbs-gantt-package-separator', separatedRoot);
    lines[index]?.classList.toggle('wbs-gantt-package-separator', separatedRoot);
  });
}

function detailSignature(gantt, entries){
  return `${gantt.dataset.timescaleSignature || ''}|${entries.map(entry => `${entry.item.id}:${entry.range?.start || 'x'}-${entry.range?.end || 'x'}:${entry.item.text || entry.item.title || ''}`).join('|')}`;
}

function enhanceDetails(documentRef){
  const gantt = documentRef.querySelector('.wbs-gantt');
  if(!gantt?.classList.contains('is-scale-enhanced') || !gantt.dataset.timescaleSignature) return;
  const project = activeProject();
  if(!project) return;
  const entries = flattenVisible(project.tasks || [], project.id);
  const lines = [...gantt.querySelectorAll('.wbs-gantt-line')];
  if(!lines.length || !lines.every(line => line.querySelector('.wbs-gantt-scale-canvas'))) return;

  const signature = detailSignature(gantt, entries);
  if(gantt.dataset.timelineDetailsSignature === signature) return;

  separatorRows(gantt, entries);
  lines.forEach((line, index) => paintRowDetails(documentRef, line, entries[index]));
  gantt.dataset.timelineDetailsSignature = signature;
}

function scheduleEnhance(documentRef){
  if(frame) cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    frame = 0;
    enhanceDetails(documentRef);
  });
}

export function installTimelineDetails({ windowRef = window, documentRef = document } = {}){
  observer?.disconnect();
  const callback = () => scheduleEnhance(documentRef);
  observer = new MutationObserver(callback);
  observer.observe(documentRef.getElementById('content') || documentRef.body, {
    childList:true,
    subtree:true,
    attributes:true,
    attributeFilter:['data-timescale-signature'],
  });
  windowRef.addEventListener('resize', callback, { passive:true });
  scheduleEnhance(documentRef);
  return () => {
    observer?.disconnect();
    windowRef.removeEventListener('resize', callback);
  };
}
