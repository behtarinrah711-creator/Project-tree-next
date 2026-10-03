import { jalaliMonthLength } from '../../ui/jalali.js';
import { tehranTodayJalali } from './todayDomain.js';
import { buildBuckets, collectPlannedWorks, jalaliDayNumber, sliceShare } from './costline.js';

export function fundingReceiptsOf(project){
  return (project?.fundingReceipts || []).filter(row => row && !row.trashed);
}

/** Drop allocations saved by the old model once, and keep the receipt totals. */
export function resetLegacyFunding(project){
  if(!project || Number(project.fundingLedgerVersion) >= 1) return false;
  project.fundingAllocations = [];
  (project.fundingReceipts || []).forEach(row => {
    if(row) row.allocations = [];
  });
  project.fundingLedgerVersion = 1;
  return true;
}

function splitExact(total, count){
  const amount = Math.max(0, Math.round(Number(total) || 0));
  const days = Math.max(0, Math.floor(count) || 0);
  if(!amount || !days) return Array.from({ length:days }, () => 0);
  const shares = [];
  for(let index = 0; index < days; index += 1){
    shares.push(Math.floor((index + 1) * amount / days) - Math.floor(index * amount / days));
  }
  return shares;
}

function fundingSpan(work){
  const start = jalaliDayNumber(work?.start);
  const end = jalaliDayNumber(work?.end) ?? start;
  if(start == null || end == null || end < start) return null;
  if(work.accrual === 'start') return { start, end:start };
  if(work.accrual === 'end') return { start:end, end };
  return { start, end };
}

function plannedWorkOf(project, taskId){
  return collectPlannedWorks(project?.tasks || [])
    .find(work => String(work.id) === String(taskId));
}

function legacyBucket(bucketId){
  const id = String(bucketId || '');
  const month = /^m-(\d+)-(\d+)$/.exec(id);
  if(month){
    const jy = Number(month[1]);
    const jm = Number(month[2]);
    const startDay = jalaliDayNumber(`${jy}/${String(jm).padStart(2, '0')}/01`);
    if(startDay == null) return null;
    return { startDay, endDay:startDay + jalaliMonthLength(jy, jm) - 1 };
  }
  const quarter = /^q-(\d+)-(\d+)$/.exec(id);
  if(quarter){
    const jy = Number(quarter[1]);
    const index = Number(quarter[2]) - 1;
    const jm = index * 3 + 1;
    const startDay = jalaliDayNumber(`${jy}/${String(jm).padStart(2, '0')}/01`);
    if(startDay == null) return null;
    const nextAbsolute = (jy * 12) + (jm - 1) + 3;
    const nextJy = Math.floor(nextAbsolute / 12);
    const nextJm = (nextAbsolute % 12) + 1;
    const endDay = jalaliDayNumber(`${nextJy}/${String(nextJm).padStart(2, '0')}/01`) - 1;
    return { startDay, endDay };
  }
  const ranged = /^(day|week|week2)-(-?\d+)$/.exec(id);
  if(!ranged) return null;
  const size = ranged[1] === 'day' ? 1 : (ranged[1] === 'week' ? 7 : 14);
  const startDay = Number(ranged[2]);
  return { startDay, endDay:startDay + size - 1 };
}

function addDay(map, taskId, day, amount){
  const value = Math.round(Number(amount) || 0);
  if(!Number.isFinite(day) || value === 0) return;
  const key = String(taskId);
  if(!map.has(key)) map.set(key, new Map());
  const days = map.get(key);
  days.set(day, (days.get(day) || 0) + value);
  if((days.get(day) || 0) <= 0) days.delete(day);
}

function placeOnDays(map, taskId, start, end, amount){
  if(!Number.isFinite(start) || !Number.isFinite(end) || end < start) return;
  splitExact(amount, end - start + 1).forEach((share, index) => addDay(map, taskId, start + index, share));
}

function absorbItem(map, item, work){
  const amount = Math.round(Number(item?.amount) || 0);
  if(!amount) return;
  const day = Number(item.day);
  if(Number.isFinite(day)){
    addDay(map, item.taskId, day, amount);
    return;
  }
  const start = Number(item.startDay);
  const end = Number(item.endDay);
  if(Number.isFinite(start) && Number.isFinite(end) && end >= start){
    placeOnDays(map, item.taskId, start, end, amount);
    return;
  }
  const span = fundingSpan(work);
  const legacy = legacyBucket(item.bucketId);
  if(legacy && span){
    const from = Math.max(span.start, legacy.startDay);
    const to = Math.min(span.end, legacy.endDay);
    if(to >= from){
      placeOnDays(map, item.taskId, from, to, amount);
      return;
    }
  }
  if(span) placeOnDays(map, item.taskId, span.start, span.end, amount);
}

function sourceRows(project){
  return [
    ...(project?.fundingAllocations || []),
    ...fundingReceiptsOf(project).flatMap(row => row.allocations || []),
  ];
}

function absorbAll(project){
  const works = new Map(collectPlannedWorks(project?.tasks || []).map(work => [String(work.id), work]));
  const map = new Map();
  sourceRows(project).forEach(item => {
    if(!item) return;
    absorbItem(map, item, works.get(String(item.taskId)));
  });
  return map;
}

function sumTask(map, taskId){
  let total = 0;
  (map.get(String(taskId)) || new Map()).forEach(amount => { total += amount; });
  return total;
}

function clearTask(map, taskId){
  map.delete(String(taskId));
}

function rowsFromMap(map){
  const rows = [];
  map.forEach((days, taskId) => {
    [...days.keys()].sort((a, b) => a - b).forEach(day => {
      const amount = days.get(day) || 0;
      if(amount > 0) rows.push({ taskId, day, amount });
    });
  });
  return rows;
}

function writeMap(project, map){
  return {
    ...project,
    fundingReceipts:(project?.fundingReceipts || []).map(row => row ? { ...row, allocations:[] } : row),
    fundingAllocations:rowsFromMap(map),
  };
}

function plannedIdSet(project){
  return new Set(collectPlannedWorks(project?.tasks || []).map(work => String(work.id)));
}

export function cardFundingKey(project, taskId){
  const work = plannedWorkOf(project, taskId);
  if(!work) return 'gone';
  return [work.start, work.end, work.accrual, work.amount].join('|');
}

export function poolReceived(project){
  return fundingReceiptsOf(project).reduce((sum, row) => sum + (Math.round(Number(row.amount) || 0)), 0);
}

export function poolAllocated(project){
  const ids = plannedIdSet(project);
  const map = absorbAll(project);
  let total = 0;
  map.forEach((days, taskId) => {
    if(!ids.has(taskId)) return;
    days.forEach(amount => { total += amount; });
  });
  return total;
}

export function poolRemaining(project){
  return Math.max(0, poolReceived(project) - poolAllocated(project));
}

export function receiptTotalAllowed(project, nextReceived){
  return Math.round(Number(nextReceived) || 0) >= poolAllocated(project);
}

export function trimFundingAllocationsToReceipts(project){
  return project?.fundingAllocations || [];
}

export function allocationsOf(project){
  return rowsFromMap(absorbAll(project));
}

export function allocatedForBucket(project, taskId, bucket){
  if(!bucket || !Number.isFinite(Number(bucket.startDay)) || !Number.isFinite(Number(bucket.endDay))) return 0;
  const days = absorbAll(project).get(String(taskId));
  if(!days) return 0;
  let total = 0;
  days.forEach((amount, day) => {
    if(day >= Number(bucket.startDay) && day <= Number(bucket.endDay)) total += amount;
  });
  return total;
}

export function allocatedFor(project, taskId, bucketId){
  const bucket = legacyBucket(bucketId);
  return bucket ? allocatedForBucket(project, taskId, bucket) : 0;
}

export function allocationForInterval(){
  return undefined;
}

export function allocatedForTask(project, taskId){
  return sumTask(absorbAll(project), taskId);
}

export function taskAllocationTotalForSlice(project, taskId, bucket, desiredAmount){
  const work = plannedWorkOf(project, taskId);
  const desired = Math.max(0, Math.round(Number(desiredAmount) || 0));
  if(!work) return desired;
  return Math.min(Math.max(0, Math.round(work.amount) || 0), desired, sliceShare(work, bucket) || desired);
}

export function setBucketFunding(project, taskId, bucket, targetAmount){
  const work = plannedWorkOf(project, taskId);
  const span = fundingSpan(work);
  if(!work || !span || !bucket) return { ok:false, reason:'range' };
  const from = Math.max(span.start, Number(bucket.startDay));
  const to = Math.min(span.end, Number(bucket.endDay));
  if(to < from) return { ok:false, reason:'range' };
  const target = Math.max(0, Math.round(Number(targetAmount) || 0));
  const slice = sliceShare(work, bucket);
  if(target > slice) return { ok:false, reason:'slice' };
  const map = absorbAll(project);
  let current = 0;
  for(let day = from; day <= to; day += 1) current += (map.get(String(taskId)) || new Map()).get(day) || 0;
  if(target === current) return { ok:true, project };
  const nextAllocated = poolAllocated(project) - current + target;
  if(nextAllocated > poolReceived(project)) return { ok:false, reason:'budget' };
  clearTask(map, taskId);
  (absorbAll(project).get(String(taskId)) || new Map()).forEach((amount, day) => {
    if(day < from || day > to) addDay(map, taskId, day, amount);
  });
  splitExact(target, to - from + 1).forEach((share, index) => addDay(map, taskId, from + index, share));
  return { ok:true, project:writeMap(project, map) };
}

export function placeCardFunding(project, taskId){
  const map = absorbAll(project);
  const total = sumTask(map, taskId);
  clearTask(map, taskId);
  const work = plannedWorkOf(project, taskId);
  const span = fundingSpan(work);
  if(work && span){
    const capped = Math.min(total, Math.max(0, Math.round(Number(work.amount) || 0)));
    splitExact(capped, span.end - span.start + 1).forEach((share, index) => addDay(map, taskId, span.start + index, share));
  }
  return writeMap(project, map);
}

export function fundingSlices(project, rangeId = 'month'){
  const works = collectPlannedWorks(project?.tasks || []);
  const buckets = buildBuckets({ rangeId, works });
  return buckets.flatMap(bucket => works.map(work => {
    const amount = sliceShare(work, bucket);
    if(amount <= 0) return null;
    const covered = allocatedForBucket(project, work.id, bucket);
    return { work, bucket, amount, covered, gap:Math.max(0, amount - covered) };
  }).filter(Boolean));
}

export function openFundingStops(project, today = tehranTodayJalali()){
  const todayDay = jalaliDayNumber(today);
  return fundingSlices(project, 'month').filter(slice => slice.gap > 1 && slice.bucket.endDay < todayDay).map(slice => ({
    taskId:String(slice.work.id),
    title:slice.work.text,
    bucketLabel:slice.bucket.label,
    start:slice.bucket.startDay,
    end:todayDay,
    duration:todayDay - slice.bucket.endDay,
    gap:slice.amount - slice.covered,
    finishEffect:null,
  }));
}

export function stopIntervalForItem(project, item, today = tehranTodayJalali()){
  const id = String(item?.id || '');
  const hit = openFundingStops(project, today).find(stop => stop.taskId === id);
  return hit ? { start:hit.start, end:hit.end, duration:hit.duration } : null;
}
