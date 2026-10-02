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

export function fundingSlices(project, rangeId = 'month'){
  const works = collectPlannedWorks(project?.tasks || []);
  const buckets = buildBuckets({ rangeId, works });
  return buckets.flatMap(bucket => works.map(work => {
    const amount = sliceShare(work, bucket);
    if(amount <= 0) return null;
    const covered = allocatedFor(project, work.id, bucket.id);
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
