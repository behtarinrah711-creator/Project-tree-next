import { jalaliToGregorian } from '../../ui/jalali.js';
import { isStage, isWork, progressOf, progressWeightOf, scheduleEndOf, scheduleStartOf } from './normalize.js';
import { activeWorkTasks, taskProgressOf, taskWeightOf } from './workTaskModel.js';

export function jalaliDayNumber(value){
  const [jy, jm, jd] = String(value || '').split('/').map(Number);
  if(!jy || !jm || !jd) return null;
  const g = jalaliToGregorian(jy, jm, jd);
  return Math.floor(Date.UTC(g.gy, g.gm - 1, g.gd) / 86400000);
}

export function tehranTodayDayNumber(now = new Date()){
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone:'Asia/Tehran', year:'numeric', month:'2-digit', day:'2-digit',
  }).formatToParts(now).reduce((out, part) => ({ ...out, [part.type]:part.value }), {});
  return Math.floor(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)) / 86400000);
}

export function plannedProgress(startDate, endDate, today = tehranTodayDayNumber()){
  const start = jalaliDayNumber(startDate); const end = jalaliDayNumber(endDate);
  if(start === null || end === null || end < start) return null;
  if(today < start) return 0;
  if(today >= end) return 100;
  return ((today - start) / (end - start)) * 100;
}

export function effectiveWorkUnits(work){
  const tasks = activeWorkTasks(work);
  return tasks.length ? tasks.map(task => ({ ...task, kind:'workTask', text:task.title })) : [work];
}

function weighted(items, valueOf, weightOf){
  const valid = items.map(item => ({ value:valueOf(item), weight:weightOf(item) }))
    .filter(row => row.value !== null && Number.isFinite(row.value) && row.weight > 0);
  const total = valid.reduce((sum, row) => sum + row.weight, 0);
  return total ? valid.reduce((sum, row) => sum + row.value * row.weight, 0) / total : null;
}

export function actualProgress(item){
  if(item?.kind === 'workTask') return taskProgressOf(item);
  if(isWork(item)){
    const tasks = activeWorkTasks(item);
    return tasks.length ? weighted(tasks, taskProgressOf, taskWeightOf) : progressOf(item);
  }
  const children = (item?.subtasks || []).filter(child => child && !child.trashed);
  return weighted(children, actualProgress, progressWeightOf) ?? 0;
}

export function plannedProgressOf(item, today = tehranTodayDayNumber()){
  if(item?.kind === 'workTask') return plannedProgress(item.scheduleStart, item.scheduleEnd, today);
  if(isWork(item)){
    const units = effectiveWorkUnits(item);
    return weighted(units, unit => plannedProgress(unit.scheduleStart, unit.scheduleEnd, today), unit => unit.kind === 'workTask' ? taskWeightOf(unit) : 1);
  }
  const children = (item?.subtasks || []).filter(child => child && !child.trashed);
  return weighted(children, child => plannedProgressOf(child, today), progressWeightOf);
}

export function progressVariance(item, today = tehranTodayDayNumber()){
  const planned = plannedProgressOf(item, today);
  return planned === null ? null : actualProgress(item) - planned;
}

export function scheduleRangeOf(item){
  if(item?.kind === 'workTask'){
    const start = jalaliDayNumber(item.scheduleStart); const end = jalaliDayNumber(item.scheduleEnd);
    return start !== null && end !== null && end >= start ? { start, end, startDate:item.scheduleStart, endDate:item.scheduleEnd } : null;
  }
  if(isWork(item)){
    const tasks = activeWorkTasks(item);
    if(!tasks.length){
      const startDate = scheduleStartOf(item); const endDate = scheduleEndOf(item);
      const start = jalaliDayNumber(startDate); const end = jalaliDayNumber(endDate);
      return start !== null && end !== null && end >= start ? { start, end, startDate, endDate } : null;
    }
    return aggregateRange(tasks);
  }
  return aggregateRange((item?.subtasks || []).filter(child => child && !child.trashed));
}

function aggregateRange(items){
  const ranges = items.map(scheduleRangeOf).filter(Boolean);
  if(!ranges.length) return null;
  const first = ranges.reduce((a, b) => b.start < a.start ? b : a);
  const last = ranges.reduce((a, b) => b.end > a.end ? b : a);
  return { start:first.start, end:last.end, startDate:first.startDate, endDate:last.endDate };
}

export function temporalDelay(item, today = tehranTodayDayNumber()){
  const range = scheduleRangeOf(item);
  if(!range) return null;
  if(actualProgress(item) >= 100){
    const explicit = Number(item?.actualFinishDay);
    const completedAt = Number(item?.completedAt);
    const finished = Number.isFinite(explicit) ? explicit : (Number.isFinite(completedAt) ? tehranTodayDayNumber(new Date(completedAt)) : null);
    return Number.isFinite(finished) ? Math.max(0, finished - range.end) : 0;
  }
  return Math.max(0, today - range.end);
}

export function transferredDelay(delay, totalFloat){
  if(!Number.isFinite(delay)) return null;
  return Number.isFinite(totalFloat) ? Math.max(0, delay - totalFloat) : null;
}

export function parentTemporalDelay(item, today = tehranTodayDayNumber()){
  if(item?.kind === 'workTask' || isWork(item)){
    const units = item?.kind === 'workTask' ? [item] : effectiveWorkUnits(item);
    const values = units.map(unit => temporalDelay(unit, today)).filter(Number.isFinite);
    return values.length ? Math.max(...values) : null;
  }
  const values = (item?.subtasks || []).filter(child => child && !child.trashed)
    .map(child => parentTemporalDelay(child, today)).filter(Number.isFinite);
  return values.length ? Math.max(...values) : null;
}

function dependencyRows(item){
  if(Array.isArray(item?.dependencies) && item.dependencies.length){
    return item.dependencies.map(row => ({
      predecessorId:String(row?.predecessorId || row?.id || ''),
      type:['FS','SS','FF'].includes(row?.type) ? row.type : 'FS',
      lagDays:Number.isFinite(Number(row?.lagDays)) ? Number(row.lagDays) : 0,
    })).filter(row => row.predecessorId);
  }
  return (item?.predecessorIds || []).map(id => ({ predecessorId:String(id), type:'FS', lagDays:0 }));
}

export function flattenDependencyCandidates(items){
  const out = [];
  const visit = nodes => (nodes || []).filter(node => node && !node.trashed).forEach(node => {
    out.push({ id:String(node.id), kind:isStage(node) ? 'stage' : 'work', title:node.text || '', item:node });
    if(isWork(node)) activeWorkTasks(node).forEach(task => out.push({ id:String(task.id), kind:'workTask', title:task.title || '', workId:String(node.id), item:task }));
    visit(node.subtasks);
  });
  visit(items); return out;
}

export function buildEffectiveNetwork(items){
  const candidates = flattenDependencyCandidates(items); const byId = new Map(candidates.map(row => [row.id, row]));
  const effectiveIds = row => {
    if(!row) return [];
    if(row.kind === 'workTask') return [row.id];
    if(row.kind === 'work'){
      const tasks = activeWorkTasks(row.item);
      return tasks.length ? tasks.map(task => String(task.id)) : [row.id];
    }
    const ids = [];
    const walk = nodes => (nodes || []).filter(node => node && !node.trashed).forEach(node => {
      if(isStage(node)) walk(node.subtasks);
      else ids.push(...effectiveIds(byId.get(String(node.id))));
    });
    walk(row.item.subtasks); return [...new Set(ids)];
  };
  const effective = candidates.filter(row => row.kind === 'workTask' || (row.kind === 'work' && activeWorkTasks(row.item).length === 0));
  const unresolved = [];
  const activities = effective.map(row => {
    const range = scheduleRangeOf(row.kind === 'workTask' ? { ...row.item, kind:'workTask' } : row.item);
    const dependencies = [];
    (row.item.predecessorIds || []).map(String).forEach(id => {
      const source = byId.get(id); const expanded = effectiveIds(source);
      if(!source || !expanded.length) unresolved.push({ consumerId:row.id, predecessorId:id });
      dependencies.push(...expanded);
    });
    return {
      id:row.id, title:row.title,
      predecessorIds:[...new Set(dependencies)].filter(id => id !== row.id),
      duration:range ? range.end - range.start + 1 : 1,
      scheduled:Boolean(range), range,
    };
  });
  return { activities, unresolved };
}

/** Resolve each persisted dependency to the visible scheduling units that own it.
 * Aggregate Work/package predecessors are represented by their latest finishing
 * scheduled leaf; aggregate bars never become dependency endpoints.
 */
export function effectiveDependencyLinks(items){
  const candidates = flattenDependencyCandidates(items);
  const byId = new Map(candidates.map(row => [row.id, row]));
  const leafIds = row => {
    if(!row) return [];
    if(row.kind === 'workTask') return [row.id];
    if(row.kind === 'work'){
      const tasks = activeWorkTasks(row.item);
      return tasks.length ? tasks.map(task => String(task.id)) : [row.id];
    }
    const ids = [];
    const walk = nodes => (nodes || []).filter(node => node && !node.trashed).forEach(node => {
      if(isStage(node)) walk(node.subtasks);
      else ids.push(...leafIds(byId.get(String(node.id))));
    });
    walk(row.item.subtasks);
    return [...new Set(ids)];
  };
  const rangeFor = row => row && scheduleRangeOf(row.kind === 'workTask' ? { ...row.item, kind:'workTask' } : row.item);
  const latestScheduledLeaf = predecessorId => leafIds(byId.get(String(predecessorId)))
    .map(id => ({ id, range:rangeFor(byId.get(id)) }))
    .filter(row => row.range)
    .sort((a, b) => b.range.end - a.range.end || a.id.localeCompare(b.id))[0] || null;

  const links = [];
  candidates.forEach(consumer => {
    if(consumer.kind === 'stage') return;
    if(consumer.kind === 'work' && activeWorkTasks(consumer.item).length) return;
    if(!rangeFor(consumer)) return;
    dependencyRows(consumer.item).forEach(dependency => {
      const predecessorId = dependency.predecessorId;
      const source = latestScheduledLeaf(predecessorId);
      if(source && source.id !== consumer.id) links.push({
        sourceId:source.id,
        targetId:consumer.id,
        predecessorId,
        type:dependency.type,
        lagDays:dependency.lagDays,
      });
    });
  });
  return links;
}

export function validatePredecessors(items, consumerId, selectedIds){
  const candidates = flattenDependencyCandidates(items); const byId = new Map(candidates.map(row => [row.id, row]));
  const selected = [...new Set((selectedIds || []).map(String).filter(Boolean))];
  if(selected.includes(String(consumerId))) return { ok:false, code:'self' };
  if(selected.some(id => !byId.has(id))) return { ok:false, code:'missing' };
  const descendants = new Map();
  const collect = node => {
    const ids = new Set();
    const walk = current => {
      (current?.subtasks || []).forEach(child => { ids.add(String(child.id)); if(isWork(child)) activeWorkTasks(child).forEach(task => ids.add(String(task.id))); walk(child); });
      if(isWork(current)) activeWorkTasks(current).forEach(task => ids.add(String(task.id)));
    };
    walk(node); return ids;
  };
  candidates.filter(row => row.kind === 'stage').forEach(row => descendants.set(row.id, collect(row.item)));
  if(selected.some(id => selected.some(other => id !== other && descendants.get(id)?.has(other)))) return { ok:false, code:'duplicate_scope' };
  const edges = new Map(candidates.map(row => [row.id, [...(row.item.predecessorIds || [])].map(String)]));
  edges.set(String(consumerId), selected);
  const visiting = new Set(); const visited = new Set();
  const cycle = id => {
    if(visiting.has(id)) return true; if(visited.has(id)) return false;
    visiting.add(id); for(const next of edges.get(id) || []) if(cycle(next)) return true;
    visiting.delete(id); visited.add(id); return false;
  };
  return [...edges.keys()].some(cycle) ? { ok:false, code:'cycle' } : { ok:true, value:selected };
}

export function calculateCpm(activities, { projectFinish = null } = {}){
  const rows = (activities || []).map(row => ({ ...row, id:String(row.id), predecessorIds:(row.predecessorIds || []).map(String), duration:Math.max(1, Number(row.duration) || 1) }));
  const byId = new Map(rows.map(row => [row.id, row])); const successors = new Map(rows.map(row => [row.id, []]));
  rows.forEach(row => row.predecessorIds.forEach(id => { if(byId.has(id)) successors.get(id).push(row.id); }));
  const result = new Map(); const pending = new Set(rows.map(row => row.id)); const order = [];
  while(pending.size){
    let moved = false;
    [...pending].forEach(id => { const row = byId.get(id); if(row.predecessorIds.filter(p => byId.has(p)).every(p => result.has(p))){ const es = Math.max(0, ...row.predecessorIds.map(p => result.get(p)?.earlyFinish || 0)); result.set(id, { earlyStart:es, earlyFinish:es + row.duration }); pending.delete(id); order.push(id); moved = true; } });
    if(!moved) return { ok:false, code:'cycle', rows:result };
  }
  const anchored = Number.isFinite(projectFinish) || rows.some(row => successors.get(row.id).length === 0 && Number.isFinite(row.deadline));
  [...order].reverse().forEach(id => { const row = byId.get(id);
    const current = result.get(row.id); const next = successors.get(row.id);
    const boundary = next.length ? Math.min(...next.map(id => result.get(id).lateStart)) : (Number.isFinite(row.deadline) ? row.deadline : projectFinish);
    if(!anchored || !Number.isFinite(boundary)){ Object.assign(current, { lateStart:null, lateFinish:null, totalFloat:null }); return; }
    current.lateFinish = boundary; current.lateStart = boundary - row.duration; current.totalFloat = current.lateStart - current.earlyStart;
  });
  return { ok:true, rows:result };
}
