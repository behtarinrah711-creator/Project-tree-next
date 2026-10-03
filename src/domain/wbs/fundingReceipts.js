import { jalaliDayNumber, tehranTodayJalali } from './todayDomain.js';
import { buildBuckets, collectPlannedWorks, sliceShare } from './costline.js';

export function fundingReceiptsOf(project){
  return (project?.fundingReceipts || []).filter(row => row && !row.trashed);
}

export function trimFundingAllocationsToReceipts(project, receipts = fundingReceiptsOf(project)){
  const receiptBudget = receipts.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const embeddedUsed = receipts.flatMap(row => row.allocations || [])
    .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  let available = Math.max(0, receiptBudget - embeddedUsed);
  return (project?.fundingAllocations || []).flatMap(item => {
    const amount = Math.min(Math.max(0, Number(item.amount) || 0), available);
    available -= amount;
    return amount > 0 ? [{ ...item, amount }] : [];
  });
}

export function allocationsOf(project){
  const receipts = fundingReceiptsOf(project);
  return [
    ...receipts.flatMap(row => (row.allocations || []).map(item => ({ ...item, receiptId: row.id }))),
    ...trimFundingAllocationsToReceipts(project, receipts),
  ];
}

export function allocatedFor(project, taskId, bucketId){
  return allocationsOf(project)
    .filter(item => String(item.taskId) === String(taskId) && String(item.bucketId) === String(bucketId))
    .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
}

function overlapAmount(item, bucket){
  const start = Number(item?.startDay);
  const end = Number(item?.endDay);
  if(!Number.isFinite(start) || !Number.isFinite(end) || !bucket) return null;
  const overlap = Math.max(0, Math.min(end, bucket.endDay) - Math.max(start, bucket.startDay) + 1);
  if(!overlap) return 0;
  return (Number(item.amount) || 0) * overlap / Math.max(1, end - start + 1);
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
    const embedded = fundingReceiptsOf(project).flatMap(row => row.allocations || [])
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
