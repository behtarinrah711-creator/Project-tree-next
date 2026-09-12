import { projectScheduleAnalysis } from '../../domain/wbs/scheduling.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgElement(documentRef, name, attrs = {}){
  const element = documentRef.createElementNS(SVG_NS, name);
  Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, String(value)));
  return element;
}

export function criticalActivityIds(analysis){
  return new Set([...analysis.rows.entries()]
    .filter(([, row]) => Number.isFinite(row.totalFloat) && row.totalFloat <= 0)
    .map(([id]) => String(id)));
}

export function isDrivingCriticalLink(analysis, sourceId, targetId){
  const source = analysis.rows.get(String(sourceId));
  const target = analysis.rows.get(String(targetId));
  return Boolean(source && target &&
    Number.isFinite(source.totalFloat) && source.totalFloat <= 0 &&
    Number.isFinite(target.totalFloat) && target.totalFloat <= 0 &&
    source.earlyFinish === target.earlyStart);
}

function floatLabel(documentRef, x, y, value, canvasWidth){
  const width = 54;
  const foreign = svgElement(documentRef, 'foreignObject', {
    class:'wbs-gantt-float-label', x:Math.max(0, Math.min(canvasWidth - width, x)), y, width, height:14,
  });
  const label = documentRef.createElement('span');
  label.textContent = `${new Intl.NumberFormat('fa-IR').format(value)} روز`;
  foreign.appendChild(label);
  return foreign;
}

export function applyTimelineCpm(gantt, entries, project, config, documentRef = document){
  if(!gantt?.classList.contains('is-scale-enhanced')) return;
  const analysis = projectScheduleAnalysis(project);
  const unresolved = new Set((analysis.network?.unresolved || []).map(row => String(row.consumerId)));
  const criticalIds = criticalActivityIds(analysis);
  const lines = [...gantt.querySelectorAll('.wbs-gantt-line')];
  gantt.classList.toggle('show-float', Boolean(config.float));
  gantt.classList.toggle('show-critical-path', Boolean(config.criticalPath));

  lines.forEach((line, index) => {
    const entry = entries[index];
    const id = String(entry?.item?.id || '');
    const canvas = line.querySelector('.wbs-gantt-scale-canvas');
    const bar = canvas?.querySelector('.wbs-gantt-bar');
    canvas?.querySelectorAll('.wbs-gantt-float-line,.wbs-gantt-float-cap,.wbs-gantt-float-label').forEach(node => node.remove());
    bar?.classList.remove('is-cpm-critical','has-negative-float');
    if(bar) delete bar.dataset.totalFloat;
    if(!bar || !entry?.range || unresolved.has(id)) return;
    const row = analysis.rows.get(id);
    if(!row || !Number.isFinite(row.totalFloat)) return;
    bar.dataset.totalFloat = String(row.totalFloat);
    bar.classList.toggle('is-cpm-critical', Boolean(config.criticalPath) && criticalIds.has(id));
    bar.classList.toggle('has-negative-float', row.totalFloat < 0);
    if(!config.float || row.totalFloat === 0) return;

    const barForeign = bar.closest('.wbs-gantt-scale-foreign');
    const canvasWidth = Number(canvas.getAttribute('width')) || 0;
    const domain = String(gantt.dataset.timescaleSignature || '').split(':');
    const dayCount = Number(domain[2]) - Number(domain[1]);
    if(!barForeign || !canvasWidth || !dayCount) return;
    const dayWidth = canvasWidth / dayCount;
    const finishX = Number(barForeign.getAttribute('x')) + Number(barForeign.getAttribute('width'));
    const floatX = Math.max(0, Math.min(canvasWidth, finishX + row.totalFloat * dayWidth));
    const y = Number(barForeign.getAttribute('y')) + Number(barForeign.getAttribute('height')) / 2;
    const className = `wbs-gantt-float-line${row.totalFloat < 0 ? ' is-negative' : ''}`;
    canvas.appendChild(svgElement(documentRef, 'line', { class:className, x1:finishX, x2:floatX, y1:y, y2:y }));
    canvas.appendChild(svgElement(documentRef, 'line', { class:`wbs-gantt-float-cap${row.totalFloat < 0 ? ' is-negative' : ''}`, x1:floatX, x2:floatX, y1:y-4, y2:y+4 }));
    canvas.appendChild(floatLabel(documentRef, Math.min(finishX, floatX) + Math.abs(floatX-finishX)/2 - 27, Math.max(0, y-17), row.totalFloat, canvasWidth));
  });

  gantt.querySelectorAll('.wbs-gantt-dependency-link,.wbs-gantt-dependency-arrow-segment').forEach(path => {
    const critical = isDrivingCriticalLink(analysis, path.dataset.sourceId, path.dataset.targetId);
    path.classList.toggle('is-critical', Boolean(config.criticalPath) && critical);
    if(path.classList.contains('wbs-gantt-dependency-arrow-segment')){
      path.setAttribute('marker-end', Boolean(config.criticalPath) && critical
        ? 'url(#wbs-gantt-critical-arrow)'
        : 'url(#wbs-gantt-fs-arrow)');
    }
  });
}
