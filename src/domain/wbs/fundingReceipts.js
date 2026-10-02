import { jalaliDayNumber, tehranTodayJalali } from './todayDomain.js';

export function fundingReceiptsOf(project){
  return (project?.fundingReceipts || []).filter(row => row && !row.trashed);
}

export function openFundingStops(project, today = tehranTodayJalali()){
  const todayDay = jalaliDayNumber(today);
  return fundingReceiptsOf(project).filter(row => {
    if(row.depositDate) return false;
    const due = jalaliDayNumber(row.dueDate);
    return due !== null && todayDay !== null && due < todayDay && (row.affectedTaskIds || []).length;
  }).map(row => ({
    receipt: row,
    start: jalaliDayNumber(row.dueDate),
    end: todayDay,
    duration: todayDay - jalaliDayNumber(row.dueDate),
    affectedTaskIds: (row.affectedTaskIds || []).map(String),
  }));
}

export function stopIntervalForItem(project, item, today = tehranTodayJalali()){
  const id = String(item?.id || '');
  const hit = openFundingStops(project, today).find(stop => stop.affectedTaskIds.includes(id));
  return hit ? { start: hit.start, end: hit.end, duration: hit.duration } : null;
}
