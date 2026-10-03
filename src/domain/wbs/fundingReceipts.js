import { jalaliDayNumber, tehranTodayJalali } from './todayDomain.js';
import { buildBuckets, collectPlannedWorks, sliceShare } from './costline.js';

export function fundingReceiptsOf(project){
  return (project?.fundingReceipts || []).filter(row => row && !row.trashed);
}

export function allocationsOf(project){
  return [
    ...fundingReceiptsOf(project).flatMap(row => (row.allocations || []).map(item => ({ ...item, receiptId: row.id }))),
    ...(project?.fundingAllocations || []),
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

/** Allocations are stored against their real date interval, so changing chart scale
 * does not make a previously funded slice disappear. Legacy bucket-only rows still
 * match their original view. */
export function allocatedForBucket(project, taskId, bucket){
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
  const fromReceipts = fundingReceiptsOf(project).flatMap(row => row.allocations || []).reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const fromPool = (project?.fundingAllocations || []).reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  return fromReceipts + fromPool;
}
export function poolRemaining(project){
  return Math.max(0, poolReceived(project) - poolAllocated(project));
}
