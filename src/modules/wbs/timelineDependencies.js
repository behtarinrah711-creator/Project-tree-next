import { PROJECT_FINISH_MILESTONE_ID, effectiveDependencyLinks, projectScheduleAnalysis } from '../../domain/wbs/scheduling.js';

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

export function dependencyGeometry(source, target, relationType, _geometries, width){
  const type = ['FS','SS','FF'].includes(relationType) ? relationType : 'FS';
  const sourceX = source.start;
  const targetX = target.start;
  // Every relation uses the same calm visual grammar: Start -> Start. Keep the
  // trunk just inside the timeline so a bar on the boundary cannot push it
  // into the sticky WBS/name column.
  const laneX = Math.max(0.75, Math.min(width - 0.75, sourceX + 0.75));
  return {
    type, sourceX, targetX, sourceAnchor:'start', targetAnchor:'start',
    laneX, routeKind:'start-trunk',
  };
}

export function dependencyPath(route, sourceY, targetY, radius = RADIUS){
  return roundedOrthogonalPath(route.sourceX, sourceY, route.targetX, targetY, radius, route.laneX);
}

export function dependencyRelationClass(relationType){
  return `is-relation-${String(relationType || 'FS').toLowerCase()}`;
}

export function dependencyMarkerId(relationType){
  return `wbs-gantt-${String(relationType || 'FS').toLowerCase()}-arrow`;
}

function syncMobileDependencyVisibility(gantt, documentRef){
  const mobile = documentRef.defaultView?.matchMedia?.('(max-width: 719px)').matches;
  const activeId = gantt.dataset.activeDependencyEntryId || '';
  gantt.querySelectorAll('.wbs-gantt-dependency-halo,.wbs-gantt-dependency-link,.wbs-gantt-dependency-arrow-segment').forEach(path => {
    const connected = activeId && (path.dataset.sourceId === activeId || path.dataset.targetId === activeId);
    path.classList.toggle('is-mobile-filtered-out', Boolean(mobile && !connected));
  });
}

function installMobileDependencySelection(gantt, rows, documentRef){
  rows.forEach(row => {
    if(row.dataset.dependencySelectionInstalled) return;
    row.dataset.dependencySelectionInstalled = 'true';
    row.addEventListener('click', () => {
      if(!documentRef.defaultView?.matchMedia?.('(max-width: 719px)').matches) return;
      const id = row.dataset.dependencyEntryId || '';
      gantt.dataset.activeDependencyEntryId = gantt.dataset.activeDependencyEntryId === id ? '' : id;
      syncMobileDependencyVisibility(gantt, documentRef);
    });
  });
}

function timelineDomainFromSignature(signature){
  const parts = String(signature || '').split(':');
  const start = Number(parts[1]);
  const endExclusive = Number(parts[2]);
  return Number.isFinite(start) && Number.isFinite(endExclusive) && endExclusive > start
    ? { start, endExclusive }
    : null;
}

function rowGeometry(line, top, entry, domain, canvasWidth){
  const canvas = line.querySelector('.wbs-gantt-scale-canvas');
  const foreign = canvas?.querySelector('.wbs-gantt-scale-foreign');
  const bar = foreign?.querySelector('.wbs-gantt-bar');
  if(!canvas || !foreign || !bar || !entry?.range || !domain || !canvasWidth) return null;
  const dayWidth = canvasWidth / (domain.endExclusive - domain.start);
  const start = (entry.range.start - domain.start) * dayWidth;
  const finish = (entry.range.end + 1 - domain.start) * dayWidth;
  const height = Number(canvas.getAttribute('height')) || 36;
  return {
    start,
    finish,
    startDay:entry.range.start,
    endDay:entry.range.end,
    centerY:top + ((height - BAR_HEIGHT) / 2) + (BAR_HEIGHT / 2),
    height,
  };
}

let dependenciesVisible = false;

export function areTimelineDependenciesVisible(){
  return dependenciesVisible;
}

export function setTimelineDependenciesVisible(value){
  dependenciesVisible = Boolean(value);
}

export function applyTimelineDependencies(gantt, entries, projectOrItems, documentRef = document){
  const timeline = gantt?.querySelector('.wbs-gantt-timeline');
  if(!timeline || !gantt.classList.contains('is-scale-enhanced')) return;
  gantt.classList.toggle('show-dependencies', dependenciesVisible);
  timeline.querySelectorAll('.wbs-gantt-dependency-layer,.wbs-gantt-dependency-arrow-layer').forEach(node => node.remove());

  const lines = [...gantt.querySelectorAll('.wbs-gantt-line')];
  const names = [...gantt.querySelectorAll('.wbs-gantt-name')];
  const width = Number(gantt.querySelector('.wbs-gantt-scale-header-canvas')?.getAttribute('width')) || 0;
  const domain = timelineDomainFromSignature(gantt.dataset.timescaleSignature);
  if(!width || !domain) return;
  const byId = new Map();
  // The sticky-header layout moves the 42px header out of .wbs-gantt-timeline.
  // Dependency coordinates therefore start at the first body row, not below a
  // header that is no longer in this coordinate space.
  let top = timeline.querySelector(':scope > .wbs-gantt-header') ? 42 : 0;
  lines.forEach((line, index) => {
    const id = entries[index] ? String(entries[index].item.id) : '';
    line.dataset.dependencyEntryId = id;
    if(names[index]) names[index].dataset.dependencyEntryId = id;
    const geometry = rowGeometry(line, top, entries[index], domain, width);
    if(geometry && id) byId.set(id, geometry);
    top += Number(line.querySelector('.wbs-gantt-scale-canvas')?.getAttribute('height')) || 36;
  });
  installMobileDependencySelection(gantt, [...lines, ...names], documentRef);
  if(top <= 0) return;

  const project = Array.isArray(projectOrItems) ? { tasks:projectOrItems } : projectOrItems;
  const finishLinks = projectScheduleAnalysis(project).milestone?.predecessorIds.map(sourceId => ({
    sourceId, targetId:PROJECT_FINISH_MILESTONE_ID, predecessorId:sourceId, type:'FS', lagDays:0,
  })) || [];
  const links = [...effectiveDependencyLinks(project?.tasks || []), ...finishLinks]
    .filter(link => byId.has(link.sourceId) && byId.has(link.targetId));
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
  const markers = ['FS','SS','FF'].map(type => {
    const marker = svgElement(documentRef, 'marker', {
      id:dependencyMarkerId(type), viewBox:'0 0 6 6', refX:5.5, refY:3,
      markerWidth:6, markerHeight:6, orient:'auto', markerUnits:'strokeWidth',
    });
    marker.appendChild(svgElement(documentRef, 'path', {
      d:'M 0 0 L 6 3 L 0 6 z',
      class:`wbs-gantt-dependency-arrow ${dependencyRelationClass(type)}`,
    }));
    return marker;
  });
  const criticalMarker = svgElement(documentRef, 'marker', {
    id:'wbs-gantt-critical-arrow', viewBox:'0 0 6 6', refX:5.5, refY:3,
    markerWidth:6, markerHeight:6, orient:'auto', markerUnits:'strokeWidth',
  });
  criticalMarker.appendChild(svgElement(documentRef, 'path', { d:'M 0 0 L 6 3 L 0 6 z', class:'wbs-gantt-dependency-arrow is-critical' }));
  defs.append(...markers, criticalMarker); arrowLayer.appendChild(defs);
  const geometries = [...byId.values()];
  links.forEach(link => {
    const source = byId.get(link.sourceId); const target = byId.get(link.targetId);
    const route = dependencyGeometry(source, target, link.type, geometries, width);
    const {type:relationType, targetX} = route;
    const relationClass = dependencyRelationClass(relationType);
    const d = dependencyPath(route, source.centerY, target.centerY);
    layer.appendChild(svgElement(documentRef, 'path', {
      class:'wbs-gantt-dependency-halo', d,
      'data-source-id':link.sourceId, 'data-target-id':link.targetId,
      'data-relation-type':relationType, 'data-lag-days':link.lagDays || 0,
    }));
    layer.appendChild(svgElement(documentRef, 'path', {
      class:`wbs-gantt-dependency-link ${relationClass}`, d,
      'data-source-id':link.sourceId, 'data-target-id':link.targetId,
      'data-relation-type':relationType, 'data-lag-days':link.lagDays || 0,
    }));
    // Persist the resolved endpoint pair in the DOM so FS/SS/FF are inspectable
    // and testable independently of RTL layout.
    layer.lastElementChild?.setAttribute('data-source-anchor', route.sourceAnchor);
    layer.lastElementChild?.setAttribute('data-target-anchor', route.targetAnchor);
    // Keep the connector itself behind the task bar. Only a tiny terminal
    // segment is promoted above the bars so the marker remains readable.
    // Starting the foreground segment at the target edge (instead of 8px
    // inside the bar) prevents the visible connector from crossing the bar.
    const arrowTailX = targetX - 0.75;
    arrowLayer.appendChild(svgElement(documentRef, 'path', {
      class:`wbs-gantt-dependency-arrow-segment ${relationClass}`,
      d:`M ${arrowTailX} ${target.centerY} H ${targetX}`,
      'marker-end':`url(#${dependencyMarkerId(relationType)})`,
      'data-source-id':link.sourceId, 'data-target-id':link.targetId,
      'data-relation-type':relationType, 'data-lag-days':link.lagDays || 0,
    }));
  });
  timeline.append(layer, arrowLayer);
  syncMobileDependencyVisibility(gantt, documentRef);
}

export { roundedOrthogonalPath };
