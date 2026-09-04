import { isStage } from '../../domain/wbs/normalize.js';
import { formatTimelineDate, shouldShowProgressLabel } from './timelineDetailsFormatting.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const BAR_HEIGHT = 8;
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

function paintProgressPresentation(bar, barWidth){
  const progress = Math.max(0, Math.min(100, Number(bar.dataset.progress) || 0));
  bar.classList.toggle('is-complete', progress >= 100);
  const label = bar.querySelector('.wbs-gantt-progress-label');
  if(label) label.classList.toggle('is-space-limited', !shouldShowProgressLabel(barWidth, progress));
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
  paintProgressPresentation(bar, barWidth);

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
    text:formatTimelineDate(entry.range.startDate),
    dir:'ltr',
  }));
  canvas.appendChild(detailForeignObject(documentRef, {
    className:'wbs-gantt-detail-date is-finish',
    x:finishX,
    y:dateY,
    width:dateWidth,
    height:10,
    text:formatTimelineDate(entry.range.endDate),
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

export function applyTimelineDetails(gantt, entries, documentRef = document){
  if(!gantt?.classList.contains('is-scale-enhanced') || !gantt.dataset.timescaleSignature) return;
  const lines = [...gantt.querySelectorAll('.wbs-gantt-line')];
  if(!lines.length || !lines.every(line => line.querySelector('.wbs-gantt-scale-canvas'))) return;
  const signature = `${gantt.dataset.timescaleSignature}|${entries.map(entry => `${entry.item.id}:${entry.item.text || entry.item.title || ''}`).join('|')}`;
  const expectedDetails = entries.filter(entry => entry.range).length * 3;
  if(gantt.dataset.timelineDetailsSignature === signature && gantt.querySelectorAll('.wbs-gantt-detail').length === expectedDetails) return;

  separatorRows(gantt, entries);
  lines.forEach((line, index) => paintRowDetails(documentRef, line, entries[index]));
  gantt.dataset.timelineDetailsSignature = signature;
}
