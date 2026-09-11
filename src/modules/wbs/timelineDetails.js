import { isStage } from '../../domain/wbs/normalize.js';
import { formatTimelineDate } from './timelineDetailsFormatting.js';
import { viewTitle } from './viewFrame.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const BAR_HEIGHT = 13;
function svgElement(documentRef, name, attrs = {}){
  const element = documentRef.createElementNS(SVG_NS, name);
  Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, String(value)));
  return element;
}
function clamp(value, min, max){ return Math.max(min, Math.min(max, value)); }
function detailForeignObject(documentRef, { className, x, y, width, height, text, dir = 'rtl' }){
  const foreign = svgElement(documentRef, 'foreignObject', { class:`wbs-gantt-detail ${className}`, x, y, width, height });
  const label = documentRef.createElement('div');
  label.className = 'wbs-gantt-detail-label'; label.dir = dir; label.textContent = text; foreign.appendChild(label); return foreign;
}
function paintProgressPresentation(bar){
  const progress = Math.max(0, Math.min(100, Number(bar.dataset.progress) || 0));
  bar.classList.toggle('is-complete', progress >= 100);
}
function paintRowDetails(documentRef, line, entry, domain, today){
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
  barForeign.setAttribute('height', String(BAR_HEIGHT)); barForeign.setAttribute('y', String(barY)); paintProgressPresentation(bar);
  const title = String(entry.item?.text || entry.item?.title || '').trim();
  if(title){
    const titleWidth = Math.min(canvasWidth, Math.max(84, Math.min(180, Math.max(barWidth, title.length * 7))));
    const titleX = clamp(barX + (barWidth - titleWidth) / 2, 0, Math.max(0, canvasWidth - titleWidth));
    canvas.appendChild(detailForeignObject(documentRef, { className:`wbs-gantt-detail-title${isStage(entry.item) ? ' is-stage' : ''}`, x:titleX, y:Math.max(0, barY - 13), width:titleWidth, height:12, text:title }));
  }
  const actual = Math.max(0, Math.min(100, Number(bar.dataset.progress) || 0));
  if(actual > 0){
    const actualEdgeX = clamp(barX + (barWidth * actual / 100), 0, canvasWidth);
    const actualLabelWidth = 42;
    const actualLabelX = clamp(actualEdgeX - actualLabelWidth, 0, Math.max(0, canvasWidth - actualLabelWidth));
    canvas.appendChild(detailForeignObject(documentRef, {
      className:'wbs-gantt-detail-actual',
      x:actualLabelX,
      y:barY,
      width:actualLabelWidth,
      height:BAR_HEIGHT,
      text:`٪${new Intl.NumberFormat('fa-IR', { useGrouping:false, maximumFractionDigits:1 }).format(actual)}`,
      dir:'rtl',
    }));
  }

  const dateWidth = 46; const dateY = Math.min(rowHeight - 11, barY + BAR_HEIGHT + 1);
  const startX = clamp(barX - dateWidth + 4, 0, Math.max(0, canvasWidth - dateWidth));
  const finishX = clamp(barX + barWidth - 4, 0, Math.max(0, canvasWidth - dateWidth));
  canvas.appendChild(detailForeignObject(documentRef, { className:'wbs-gantt-detail-date is-start', x:startX, y:dateY, width:dateWidth, height:10, text:formatTimelineDate(entry.range.startDate), dir:'ltr' }));
  canvas.appendChild(detailForeignObject(documentRef, { className:'wbs-gantt-detail-date is-finish', x:finishX, y:dateY, width:dateWidth, height:10, text:formatTimelineDate(entry.range.endDate), dir:'ltr' }));
  const planned = Number(bar.dataset.planned);
  if(bar.dataset.planned !== '' && Number.isFinite(planned)){
    const plannedX = clamp(barX + (barWidth * planned / 100), 4, Math.max(4, canvasWidth - 4));
    const markerRadius = 4;
    const markerY = Math.min(rowHeight - 9, barY + BAR_HEIGHT + markerRadius);
    canvas.appendChild(svgElement(documentRef, 'polygon', {
      class:'wbs-gantt-planned-marker',
      points:`${plannedX},${markerY - markerRadius} ${plannedX + markerRadius},${markerY} ${plannedX},${markerY + markerRadius} ${plannedX - markerRadius},${markerY}`,
    }));
    const labelWidth = 42; const labelHeight = 11;
    const todayPosition = todayX(canvas, domain, today);
    const overlapsToday = todayPosition !== null && Math.abs(plannedX - todayPosition) <= markerRadius + 1;
    const labelX = overlapsToday
      ? clamp(plannedX + markerRadius + 2, 0, Math.max(0, canvasWidth - labelWidth))
      : clamp(plannedX - labelWidth / 2, 0, Math.max(0, canvasWidth - labelWidth));
    const labelY = overlapsToday
      ? clamp(markerY - (labelHeight / 2), 0, Math.max(0, rowHeight - labelHeight))
      : Math.min(rowHeight - labelHeight, markerY + 4);
    canvas.appendChild(detailForeignObject(documentRef, {
      className:`wbs-gantt-detail-planned ${overlapsToday ? 'is-left-of-marker' : 'is-below-marker'}`,
      x:labelX,
      y:labelY,
      width:labelWidth,
      height:labelHeight,
      text:`٪${new Intl.NumberFormat('fa-IR', { useGrouping:false, maximumFractionDigits:1 }).format(planned)}`,
      dir:'rtl',
    }));
  }
}
function separatorRows(gantt, entries){
  const names = [...gantt.querySelectorAll('.wbs-gantt-name')]; const lines = [...gantt.querySelectorAll('.wbs-gantt-line')];
  entries.forEach((entry, index) => { const separatedRoot = entry.depth === 0 && index > 0; names[index]?.classList.toggle('wbs-gantt-package-separator', separatedRoot); lines[index]?.classList.toggle('wbs-gantt-package-separator', separatedRoot); });
}
function localTodayDayNumber(){
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Tehran', year:'numeric', month:'2-digit', day:'2-digit' })
    .formatToParts(new Date()).reduce((out, part) => ({ ...out, [part.type]:part.value }), {});
  return Math.floor(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)) / 86400000);
}
function timelineDomainFromSignature(signature){
  const parts = String(signature || '').split(':'); const start = Number(parts[1]); const endExclusive = Number(parts[2]);
  return Number.isFinite(start) && Number.isFinite(endExclusive) && endExclusive > start ? { start, endExclusive } : null;
}
function todayX(canvas, domain, today){
  const width = Number(canvas?.getAttribute('width')) || 0;
  if(!width || !domain || today < domain.start || today >= domain.endExclusive) return null;
  return ((today - domain.start) / (domain.endExclusive - domain.start)) * width;
}
function paintTodayIndicator(gantt, documentRef){
  gantt.querySelectorAll('.wbs-gantt-today-line,.wbs-gantt-today-label').forEach(node => node.remove());
  const domain = timelineDomainFromSignature(gantt.dataset.timescaleSignature); const today = localTodayDayNumber();
  if(!domain || today < domain.start || today >= domain.endExclusive) return;
  const headerCanvas = gantt.querySelector('.wbs-gantt-scale-header-canvas'); const headerX = todayX(headerCanvas, domain, today);
  if(headerCanvas && headerX !== null){
    headerCanvas.appendChild(svgElement(documentRef, 'line', { class:'wbs-gantt-today-line is-header', x1:headerX, x2:headerX, y1:16, y2:42 }));
    const labelWidth = 38; const width = Number(headerCanvas.getAttribute('width')) || labelWidth; const labelX = clamp(headerX - labelWidth / 2, 0, Math.max(0, width - labelWidth));
    const foreign = svgElement(documentRef, 'foreignObject', { class:'wbs-gantt-today-label', x:labelX, y:1, width:labelWidth, height:16 });
    const label = documentRef.createElement('div'); label.textContent = 'امروز'; foreign.appendChild(label); headerCanvas.appendChild(foreign);
  }
  gantt.querySelectorAll('.wbs-gantt-scale-canvas').forEach(canvas => {
    const x = todayX(canvas, domain, today); if(x === null) return;
    const height = Number(canvas.getAttribute('height')) || 36;
    canvas.appendChild(svgElement(documentRef, 'line', { class:'wbs-gantt-today-line', x1:x, x2:x, y1:0, y2:height }));
  });
}
export function applyTimelineDetails(gantt, entries, documentRef = document){
  if(!gantt?.classList.contains('is-scale-enhanced') || !gantt.dataset.timescaleSignature) return;
  const headerTitle = gantt.querySelector('.wbs-gantt-project-title'); if(headerTitle) headerTitle.textContent = viewTitle('timeline');
  const lines = [...gantt.querySelectorAll('.wbs-gantt-line')];
  if(!lines.length || !lines.every(line => line.querySelector('.wbs-gantt-scale-canvas'))) return;
  const detailState = lines.map((line, index) => {
    const entry = entries[index];
    const bar = line.querySelector('.wbs-gantt-bar');
    return `${entry?.item?.id || ''}:${entry?.item?.text || entry?.item?.title || ''}:${bar?.dataset.progress || ''}:${bar?.dataset.planned || ''}`;
  }).join('|');
  const signature = `${gantt.dataset.timescaleSignature}|${detailState}`;
  const expectedDetails = lines.reduce((sum, line, index) => {
    const entry = entries[index];
    if(!entry?.range) return sum;
    const bar = line.querySelector('.wbs-gantt-bar');
    if(!bar) return sum;
    const titleCount = String(entry.item?.text || entry.item?.title || '').trim() ? 1 : 0;
    const plannedCount = bar.dataset.planned !== '' && Number.isFinite(Number(bar.dataset.planned)) ? 1 : 0;
    const actualCount = Number(bar.dataset.progress) > 0 ? 1 : 0;
    return sum + titleCount + 2 + plannedCount + actualCount;
  }, 0);
  const domain = timelineDomainFromSignature(gantt.dataset.timescaleSignature); const today = localTodayDayNumber(); const shouldShowToday = domain && today >= domain.start && today < domain.endExclusive;
  const todayReady = shouldShowToday ? Boolean(gantt.querySelector('.wbs-gantt-today-line')) : !gantt.querySelector('.wbs-gantt-today-line');
  if(gantt.dataset.timelineDetailsSignature === signature && gantt.querySelectorAll('.wbs-gantt-detail').length === expectedDetails && todayReady) return;
  separatorRows(gantt, entries);
  lines.forEach((line, index) => paintRowDetails(documentRef, line, entries[index], domain, today));
  paintTodayIndicator(gantt, documentRef);
  gantt.dataset.timelineDetailsSignature = signature;
}
