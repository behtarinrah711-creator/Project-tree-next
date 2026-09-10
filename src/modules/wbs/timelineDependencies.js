import { effectiveDependencyLinks } from '../../domain/wbs/scheduling.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const BAR_HEIGHT = 8;
const RADIUS = 4;

function svgElement(documentRef, name, attrs = {}){
  const element = documentRef.createElementNS(SVG_NS, name);
  Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, String(value)));
  return element;
}

function roundedOrthogonalPath(sourceX, sourceY, targetX, targetY, radius = RADIUS){
  const direction = targetX >= sourceX ? 1 : -1;
  const usableGap = Math.abs(targetX - sourceX);
  const laneX = usableGap >= 24
    ? sourceX + ((targetX - sourceX) / 2)
    : sourceX + (direction * 12);
  const firstDirection = Math.sign(laneX - sourceX) || direction;
  const lastDirection = Math.sign(targetX - laneX) || direction;
  const verticalDirection = Math.sign(targetY - sourceY) || 1;
  const firstRadius = Math.min(radius, Math.abs(laneX - sourceX), Math.abs(targetY - sourceY) / 2);
  const lastRadius = Math.min(radius, Math.abs(targetX - laneX), Math.abs(targetY - sourceY) / 2);
  return [
    `M ${sourceX} ${sourceY}`,
    `H ${laneX - (firstDirection * firstRadius)}`,
    `Q ${laneX} ${sourceY} ${laneX} ${sourceY + (verticalDirection * firstRadius)}`,
    `V ${targetY - (verticalDirection * lastRadius)}`,
    `Q ${laneX} ${targetY} ${laneX + (lastDirection * lastRadius)} ${targetY}`,
    `H ${targetX}`,
  ].join(' ');
}

function rowGeometry(line, top){
  const canvas = line.querySelector('.wbs-gantt-scale-canvas');
  const foreign = canvas?.querySelector('.wbs-gantt-scale-foreign');
  const bar = foreign?.querySelector('.wbs-gantt-bar');
  if(!canvas || !foreign || !bar) return null;
  const x = Number(foreign.getAttribute('x')) || 0;
  const width = Number(foreign.getAttribute('width')) || 0;
  const height = Number(canvas.getAttribute('height')) || 36;
  return { start:x, finish:x + width, centerY:top + ((height - BAR_HEIGHT) / 2) + (BAR_HEIGHT / 2), height };
}

export function applyTimelineDependencies(gantt, entries, projectItems, documentRef = document){
  const timeline = gantt?.querySelector('.wbs-gantt-timeline');
  if(!timeline || !gantt.classList.contains('is-scale-enhanced')) return;
  timeline.querySelector('.wbs-gantt-dependency-layer')?.remove();

  const lines = [...gantt.querySelectorAll('.wbs-gantt-line')];
  const byId = new Map();
  let top = 42;
  lines.forEach((line, index) => {
    const geometry = rowGeometry(line, top);
    if(geometry && entries[index]) byId.set(String(entries[index].item.id), geometry);
    top += Number(line.querySelector('.wbs-gantt-scale-canvas')?.getAttribute('height')) || 36;
  });
  const width = Number(gantt.querySelector('.wbs-gantt-scale-header-canvas')?.getAttribute('width')) || 0;
  if(!width || top <= 42) return;

  const links = effectiveDependencyLinks(projectItems).filter(link => byId.has(link.sourceId) && byId.has(link.targetId));
  if(!links.length) return;
  const layer = svgElement(documentRef, 'svg', {
    class:'wbs-gantt-dependency-layer', width, height:top, viewBox:`0 0 ${width} ${top}`,
    preserveAspectRatio:'none', 'aria-hidden':'true',
  });
  const defs = svgElement(documentRef, 'defs');
  const marker = svgElement(documentRef, 'marker', {
    id:'wbs-gantt-fs-arrow', viewBox:'0 0 6 6', refX:5.5, refY:3,
    markerWidth:6, markerHeight:6, orient:'auto', markerUnits:'strokeWidth',
  });
  marker.appendChild(svgElement(documentRef, 'path', { d:'M 0 0 L 6 3 L 0 6 z', class:'wbs-gantt-dependency-arrow' }));
  defs.appendChild(marker); layer.appendChild(defs);
  links.forEach(link => {
    const source = byId.get(link.sourceId); const target = byId.get(link.targetId);
    const d = roundedOrthogonalPath(source.finish, source.centerY, target.start, target.centerY);
    layer.appendChild(svgElement(documentRef, 'path', { class:'wbs-gantt-dependency-halo', d }));
    layer.appendChild(svgElement(documentRef, 'path', {
      class:'wbs-gantt-dependency-link', d, 'marker-end':'url(#wbs-gantt-fs-arrow)',
      'data-source-id':link.sourceId, 'data-target-id':link.targetId,
    }));
  });
  timeline.appendChild(layer);
}

export { roundedOrthogonalPath };
