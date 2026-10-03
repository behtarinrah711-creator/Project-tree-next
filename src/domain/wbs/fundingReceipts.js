import { jalaliDayNumber, tehranTodayJalali } from './todayDomain.js';
import { buildBuckets, collectPlannedWorks, hiddenFundingCarriers, sliceShare } from './costline.js';

export function fundingReceiptsOf(project){
  return (project?.fundingReceipts || []).filter(row => row && !row.trashed);
}

function distribute(total, weights){
  const amount = Math.max(0, Math.round(Number(total) || 0));
  const safe = weights.map(weight => Math.max(0, Number(weight) || 0));
  const sum = safe.reduce((acc, weight) => acc + weight, 0);
  if(!amount || !sum) return safe.map(() => 0);
  const floors = safe.map(weight => Math.floor(amount * weight / sum));
  let left = amount - floors.reduce((acc, value) => acc + value, 0);
  const rank = safe.map((weight, index) => ({
    index,
    remainder: amount * weight / sum - floors[index],
  })).sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for(let step = 0; step < left; step += 1) floors[rank[step].index] += 1;
  return floors;
}

function expandToCarriers(project, items){
  const hidden = hiddenFundingCarriers(project?.tasks || []);
  if(!hidden.size) return items || [];
  return (items || []).flatMap(item => {
    const carriers = hidden.get(String(item?.taskId));
    if(!carriers?.length) return [item];
    const shares = distribute(item?.amount, carriers.map(carrier => carrier.amount));
    return carriers.flatMap((carrier, index) => shares[index] > 0
      ? [{ ...item, taskId:carrier.id, amount:shares[index] }]
      : []);
  });
}

export function trimFundingAllocationsToReceipts(project, receipts = fundingReceiptsOf(project)){
  const receiptBudget = receipts.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const embeddedUsed = receipts.flatMap(row => row.allocations || [])
    .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  let available = Math.max(0, receiptBudget - embeddedUsed);
  return expandToCarriers(project, project?.fundingAllocations || []).flatMap(item => {
    const amount = Math.min(Math.max(0, Number(item.amount) || 0), available);
    available -= amount;
    return amount > 0 ? [{ ...item, amount }] : [];
  });
}

export function allocationsOf(project){
  const receipts = fundingReceiptsOf(project);
  return [
    ...expandToCarriers(project, receipts.flatMap(row => (row.allocations || []).map(item => ({ ...item, receiptId: row.id })))),
    ...trimFundingAllocationsToReceipts(project, receipts),
  ];
}

export function allocatedFor(project, taskId, bucketId){
  return allocationsOf(project)
    .filter(item => String(item.taskId) === String(taskId) && String(item.bucketId) === String(bucketId))
    .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
}

function inclusiveShare(total, duration, startIndex, endIndex){
  if(endIndex < startIndex || duration <= 0) return 0;
  const amount = Number(total) || 0;
  return Math.floor((endIndex + 1) * amount / duration) - Math.floor(startIndex * amount / duration);
}

function overlapAmount(item, bucket){
  const start = Number(item?.startDay);
  const end = Number(item?.endDay);
  if(!Number.isFinite(start) || !Number.isFinite(end) || !bucket) return null;
  const duration = end - start + 1;
  if(duration <= 0) return null;
  const overlapStart = Math.max(start, Number(bucket.startDay));
  const overlapEnd = Math.min(end, Number(bucket.endDay));
  if(overlapEnd < overlapStart) return 0;
  return inclusiveShare(item.amount, duration, overlapStart - start, overlapEnd - start);
}

function allocationInterval(item, work){
  const start = Number(item?.startDay);
  const end = Number(item?.endDay);
  if(Number.isFinite(start) && Number.isFinite(end)) return { start, end };
  if(!work) return null;
  const workStart = jalaliDayNumber(work.start);
  const workEnd = jalaliDayNumber(work.end) ?? workStart;
  if(workStart == null || workEnd == null) return null;
  if(work.accrual === 'start') return { start:workStart, end:workStart };
  if(work.accrual === 'end') return { start:workEnd, end:workEnd };
  return { start:workStart, end:workEnd };
}

function workInterval(work){
  const start = jalaliDayNumber(work?.start);
  const end = jalaliDayNumber(work?.end) ?? start;
  if(start == null || end == null) return null;
  if(work.accrual === 'start') return { start, end:start };
  if(work.accrual === 'end') return { start:end, end };
  return { start, end };
}

function placedInterval(work, bucket){
  if(!bucket || !Number.isFinite(Number(bucket.startDay)) || !Number.isFinite(Number(bucket.endDay))) return null;
  const span = workInterval(work);
  const bucketStart = Number(bucket.startDay);
  const bucketEnd = Number(bucket.endDay);
  if(!span) return { start:bucketStart, end:bucketEnd };
  const start = Math.max(span.start, bucketStart);
  const end = Math.min(span.end, bucketEnd);
  return end < start ? null : { start, end };
}

function outsidePieces(item, interval, bucket){
  const { start, end } = interval;
  const duration = end - start + 1;
  const amount = Number(item.amount) || 0;
  const overlapStart = Math.max(start, Number(bucket.startDay));
  const overlapEnd = Math.min(end, Number(bucket.endDay));
  if(overlapEnd < overlapStart) return [{ ...item, startDay:start, endDay:end }];
  const pieces = [];
  if(start < overlapStart){
    const left = inclusiveShare(amount, duration, 0, overlapStart - start - 1);
    if(left > 0) pieces.push({
      ...item,
      bucketId:`${item.bucketId || 'allocation'}:before:${start}-${overlapStart - 1}`,
      startDay:start,
      endDay:overlapStart - 1,
      amount:left,
    });
  }
  if(end > overlapEnd){
    const right = inclusiveShare(amount, duration, overlapEnd - start + 1, duration - 1);
    if(right > 0) pieces.push({
      ...item,
      bucketId:`${item.bucketId || 'allocation'}:after:${overlapEnd + 1}-${end}`,
      startDay:overlapEnd + 1,
      endDay:end,
      amount:right,
    });
  }
  return pieces;
}

export function setAllocationsForBucketTotal(project, taskId, bucket, targetAmount){
  const work = plannedWorkOf(project, taskId);
  const place = placedInterval(work, bucket);
  if(!place || !bucket) return expandToCarriers(project, project?.fundingAllocations || []);
  const kept = [];
  expandToCarriers(project, project?.fundingAllocations || []).forEach(item => {
    if(String(item?.taskId) !== String(taskId)){
      kept.push(item);
      return;
    }
    const interval = allocationInterval(item, work);
    if(!interval) return;
    kept.push(...outsidePieces(item, interval, bucket));
  });
  const target = Math.max(0, Number(targetAmount) || 0);
  if(target > 0){
    kept.push({
      taskId,
      bucketId:bucket.id,
      startDay:place.start,
      endDay:place.end,
      amount:target,
      kind:'manual',
    });
  }
  return kept.filter(item => (Number(item.amount) || 0) > 0);
}

function plannedWorkOf(project, taskId){
  return collectPlannedWorks(project?.tasks || [])
    .find(work => String(work.id) === String(taskId));
}

function spreadAmountForBucket(total, work, bucket){
  const start = jalaliDayNumber(work?.start);
  const end = jalaliDayNumber(work?.end) ?? start;
  if(start == null || end == null || !bucket) return 0;
  const overlapStart = Math.max(start, Number(bucket.startDay));
  const overlapEnd = Math.min(end, Number(bucket.endDay));
  if(overlapEnd < overlapStart) return 0;
  const duration = Math.max(1, end - start + 1);
  const before = overlapStart - start;
  const through = overlapEnd - start + 1;
  return Math.floor(total * through / duration) - Math.floor(total * before / duration);
}

/** Date-bound allocations keep their real interval when the chart scale changes.
 * Older task-level allocations still follow the task accrual mode for compatibility. */
export function allocatedForBucket(project, taskId, bucket){
  const work = plannedWorkOf(project, taskId);
  if(work){
    const poolRows = trimFundingAllocationsToReceipts(project)
      .filter(item => String(item.taskId) === String(taskId));
    const intervalTotal = poolRows.reduce((sum, item) => {
      const overlap = overlapAmount(item, bucket);
      return sum + (overlap == null ? 0 : overlap);
    }, 0);
    const taskLevelTotal = poolRows
      .filter(item => overlapAmount(item, bucket) == null)
      .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const embedded = expandToCarriers(project, fundingReceiptsOf(project).flatMap(row => row.allocations || []))
      .filter(item => String(item.taskId) === String(taskId))
      .reduce((sum, item) => {
        const overlap = overlapAmount(item, bucket);
        if(overlap != null) return sum + overlap;
        return sum + (String(item.bucketId) === String(bucket?.id) ? (Number(item.amount) || 0) : 0);
      }, 0);
    const total = Math.min(Number(work.amount) || 0, taskLevelTotal);
    let distributed = 0;
    if(total > 0){
      const start = jalaliDayNumber(work.start);
      const end = jalaliDayNumber(work.end) ?? start;
      if(work.accrual === 'start') distributed = start >= bucket.startDay && start <= bucket.endDay ? total : 0;
      else if(work.accrual === 'end') distributed = end >= bucket.startDay && end <= bucket.endDay ? total : 0;
      else distributed = spreadAmountForBucket(total, work, bucket);
    }
    return Math.round(embedded + intervalTotal + distributed);
  }
  return Math.round(allocationsOf(project)
    .filter(item => String(item.taskId) === String(taskId))
    .reduce((sum, item) => {
      const overlap = overlapAmount(item, bucket);
      if(overlap != null) return sum + overlap;
      return sum + (String(item.bucketId) === String(bucket?.id) ? (Number(item.amount) || 0) : 0);
    }, 0));
}

export function allocationForInterval(project, taskId, bucket){
  return (project?.fundingAllocations || []).find(item =>
    String(item.taskId) === String(taskId)
    && Number(item.startDay) === Number(bucket?.startDay)
    && Number(item.endDay) === Number(bucket?.endDay));
}

export function allocatedForTask(project, taskId){
  return allocationsOf(project)
    .filter(item => String(item.taskId) === String(taskId))
    .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
}

export function taskAllocationTotalForSlice(project, taskId, bucket, desiredAmount){
  const work = plannedWorkOf(project, taskId);
  const desired = Math.max(0, Number(desiredAmount) || 0);
  if(!work) return desired;
  const estimate = Math.max(0, Number(work.amount) || 0);
  if(work.accrual === 'start' || work.accrual === 'end') return Math.min(estimate, desired);
  const slice = sliceShare(work, bucket);
  if(slice <= 0 || estimate <= 0) return 0;
  return Math.min(estimate, Math.round(desired * estimate / slice));
}

export function fundingSlices(project, rangeId = 'month'){
  const works = collectPlannedWorks(project?.tasks || []);
  const buckets = buildBuckets({ rangeId, works });
  return buckets.flatMap(bucket => works.map(work => {
    const amount = sliceShare(work, bucket);
    if(amount <= 0) return null;
    const covered = allocatedForBucket(project, work.id, bucket);
    return { work, bucket, amount, covered, gap: Math.max(0, amount - covered) };
  }).filter(Boolean));
}

export function openFundingStops(project, today = tehranTodayJalali()){
  const todayDay = jalaliDayNumber(today);
  return fundingSlices(project, 'month').filter(slice => slice.gap > 1 && slice.bucket.endDay < todayDay).map(slice => ({
    taskId: String(slice.work.id),
    title: slice.work.text,
    bucketLabel: slice.bucket.label,
    start: slice.bucket.startDay,
    end: todayDay,
    duration: todayDay - slice.bucket.endDay,
    gap: slice.amount - slice.covered,
    finishEffect: null,
  }));
}

export function stopIntervalForItem(project, item, today = tehranTodayJalali()){
  const id = String(item?.id || '');
  const hit = openFundingStops(project, today).find(stop => stop.taskId === id);
  return hit ? { start: hit.start, end: hit.end, duration: hit.duration } : null;
}

export function poolReceived(project){
  return fundingReceiptsOf(project).reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
}
export function poolAllocated(project){
  return allocationsOf(project).reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
}
export function poolRemaining(project){
  return Math.max(0, poolReceived(project) - poolAllocated(project));
}
