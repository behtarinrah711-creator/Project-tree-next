import { effectiveDependencyLinks } from '../../domain/wbs/scheduling.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const BAR_HEIGHT = 8;
const RADIUS = 4;

function svgElement(documentRef, name, attrs = {}){
  const element = documentRef.createElementNS(SVG_NS, name);
  Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, String(value)));
  return element;
}

function roundedOrthogonalPath(sourceX, sourceY, targetX, targetY, radius = RADIUS, laneXOverride = null){
  const direction = targetX >= sourceX ? 1 : -1;
  const usableGap = Math.abs(targetX - sourceX);
  const laneX = Number.isFinite(laneXOverride) ? laneXOverride : (usableGap >= 24
    ? sourceX + ((targetX - sourceX) / 2)
    : sourceX + (direction * 12));
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

function connectorLane(source, target, geometries, width){
  const between = geometries.filter(row => row !== source && row !== target &&
    row.centerY > Math.min(source.centerY, target.centerY) && row.centerY < Math.max(source.centerY, target.centerY));
  const clear = x => x >= 4 && x <= width - 4 && !between.some(row => x >= row.start - 6 && x <= row.finish + 6);
  const gap = target.start - source.finish;
  const candidates = gap >= 20
    ? [source.finish + gap / 2, source.finish + 8, target.start - 8]
    : [Math.max(source.finish, target.finish) + 12, Math.min(source.start, target.start) - 12];
  return candidates.find(clear) ?? candidates.find(x => x >= 4 && x <= width - 4) ?? Math.max(4, Math.min(width - 4, source.finish + 12));
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

let dependenciesVisible = false;

export function areTimelineDependenciesVisible(){
  return dependenciesVisible;
}

export function setTimelineDependenciesVisible(value){
  dependenciesVisible = Boolean(value);
}

export function applyTimelineDependencies(gantt, entries, projectItems, documentRef = document){
  const timeline = gantt?.querySelector('.wbs-gantt-timeline');
  if(!timeline || !gantt.classList.contains('is-scale-enhanced')) return;
  gantt.classList.toggle('show-dependencies', dependenciesVisible);
  timeline.querySelectorAll('.wbs-gantt-dependency-layer,.wbs-gantt-dependency-arrow-layer').forEach(node => node.remove());

  const lines = [...gantt.querySelectorAll('.wbs-gantt-line')];
  const names = [...gantt.querySelectorAll('.wbs-gantt-name')];
  const byId = new Map();
  // The sticky-header layout moves the 42px header out of .wbs-gantt-timeline.
  // Dependency coordinates therefore start at the first body row, not below a
  // header that is no longer in this coordinate space.
  let top = timeline.querySelector(':scope > .wbs-gantt-header') ? 42 : 0;
  lines.forEach((line, index) => {
    const id = entries[index] ? String(entries[index].item.id) : '';
    line.dataset.dependencyEntryId = id;
    if(names[index]) names[index].dataset.dependencyEntryId = id;
    const geometry = rowGeometry(line, top);
    if(geometry && id) byId.set(id, geometry);
    top += Number(line.querySelector('.wbs-gantt-scale-canvas')?.getAttribute('height')) || 36;
  });
  const width = Number(gantt.querySelector('.wbs-gantt-scale-header-canvas')?.getAttribute('width')) || 0;
  if(!width || top <= 0) return;

  const links = effectiveDependencyLinks(projectItems).filter(link => byId.has(link.sourceId) && byId.has(link.targetId));
  if(!links.length) return;
  const layer = svgElement(documentRef, 'svg', {
    class:'wbs-gantt-dependency-layer', width, height:top, viewBox:`0 0 ${width} ${top}`,
    preserveAspectRatio:'none', 'aria-hidden':'true',
  });
  const arrowLayer = svgElement(documentRef, 'svg', {
    class:'wbs-gantt-dependency-arrow-layer', width, height:top, viewBox:`0 0 ${width} ${top}`,
    preserveAspectRatio:'none', 'aria-hidden':'true',
  });
  const defs = svgElement(documentRef, 'defs');
  const marker = svgElement(documentRef, 'marker', {
    id:'wbs-gantt-fs-arrow', viewBox:'0 0 6 6', refX:5.5, refY:3,
    markerWidth:6, markerHeight:6, orient:'auto', markerUnits:'strokeWidth',
  });
  marker.appendChild(svgElement(documentRef, 'path', { d:'M 0 0 L 6 3 L 0 6 z', class:'wbs-gantt-dependency-arrow' }));
  defs.appendChild(marker); arrowLayer.appendChild(defs);
  const geometries = [...byId.values()];
  links.forEach(link => {
    const source = byId.get(link.sourceId); const target = byId.get(link.targetId);
    const laneX = connectorLane(source, target, geometries, width);
    const d = roundedOrthogonalPath(source.finish, source.centerY, target.start, target.centerY, RADIUS, laneX);
    layer.appendChild(svgElement(documentRef, 'path', {
      class:'wbs-gantt-dependency-halo', d,
      'data-source-id':link.sourceId, 'data-target-id':link.targetId,
    }));
    layer.appendChild(svgElement(documentRef, 'path', {
      class:'wbs-gantt-dependency-link', d,
      'data-source-id':link.sourceId, 'data-target-id':link.targetId,
    }));
    const approachDirection = Math.sign(target.start - laneX) || 1;
    // Keep the connector itself behind the task bar. Only a tiny terminal
    // segment is promoted above the bars so the marker remains readable.
    // Starting the foreground segment at the target edge (instead of 8px
    // inside the bar) prevents the visible connector from crossing the bar.
    const arrowTailX = target.start - (approachDirection * 0.75);
    arrowLayer.appendChild(svgElement(documentRef, 'path', {
      class:'wbs-gantt-dependency-arrow-segment',
      d:`M ${arrowTailX} ${target.centerY} H ${target.start}`,
      'marker-end':'url(#wbs-gantt-fs-arrow)',
      'data-source-id':link.sourceId, 'data-target-id':link.targetId,
    }));
  });
  timeline.append(layer, arrowLayer);
}

export { roundedOrthogonalPath };
