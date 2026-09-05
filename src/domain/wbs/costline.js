import { gregorianToJalali, jalaliMonthLength, jalaliToGregorian } from '../../ui/jalali.js';
import { isWork, lineTotal, scheduleEndOf, scheduleStartOf, walkTree } from './normalize.js';

export const COSTLINE_RANGES = [
  { id: 'day', label: 'روزانه', days: 1 },
  { id: 'week', label: 'هفتگی', days: 7 },
  { id: 'week2', label: '۲ هفته', days: 14 },
  { id: 'week3', label: '۳ هفته', days: 21 },
  { id: 'week4', label: '۴ هفته', days: 28 },
  { id: 'month', label: 'ماهانه', days: null },
];

export const WEEKDAYS = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];

export function jalaliDayNumber(value){
  if(!value) return null;
  const [jy, jm, jd] = String(value).split('/').map(Number);
  if(!jy || !jm || !jd) return null;
  const g = jalaliToGregorian(jy, jm, jd);
  return Math.floor(Date.UTC(g.gy, g.gm - 1, g.gd) / 86400000);
}

export function jalaliFromDay(day){
  const date = new Date(day * 86400000);
  const j = gregorianToJalali(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  return `${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}`;
}

export function weekdayIndex(jalaliDate){
  const day = jalaliDayNumber(jalaliDate);
  if(day == null) return 0;
  return (new Date(day * 86400000).getUTCDay() + 1) % 7;
}

export function durationDays(start, end){
  const a = jalaliDayNumber(start);
  const b = jalaliDayNumber(end);
  return a != null && b != null && b >= a ? b - a + 1 : 0;
}

export function workPath(tasks, itemId){
  let found = '';
  const search = (nodes, trail) => {
    (nodes || []).forEach(node => {
      if(!node || node.trashed) return;
      const next = trail.concat(node.text || '');
      if(String(node.id) === String(itemId)) found = next.filter(Boolean).join(' ← ');
      search(node.subtasks, next);
    });
  };
  search(tasks, []);
  return found;
}

export function collectPlannedWorks(tasks){
  const works = [];
  walkTree(tasks, item => {
    if(!isWork(item) || item.trashed) return;
    const start = scheduleStartOf(item);
    const amount = lineTotal(item);
    if(!start || !amount) return;
    works.push({
      id: item.id,
      text: item.text || '',
      type: item.type || '',
      amount,
      start,
      end: scheduleEndOf(item),
      duration: durationDays(start, scheduleEndOf(item)),
      path: workPath(tasks, item.id),
      series: 'planned',
    });
  });
  return works;
}

function alignToWeekday(dayNumber, weekday){
  const current = (new Date(dayNumber * 86400000).getUTCDay() + 1) % 7;
  return dayNumber - ((current - weekday + 7) % 7);
}

export function buildBuckets({ rangeId = 'week', originWeekday = 4, works = [] } = {}){
  const range = COSTLINE_RANGES.find(item => item.id === rangeId) || COSTLINE_RANGES[1];
  const dated = works.filter(work => jalaliDayNumber(work.start) != null);
  if(!dated.length) return [];
  const days = dated.map(work => jalaliDayNumber(work.start));
  const minDay = Math.min(...days);
  const maxDay = Math.max(...days);
  const buckets = [];
  if(range.id === 'month'){
    let cursor = minDay;
    while(cursor <= maxDay && buckets.length < 36){
      const start = jalaliFromDay(cursor);
      const [jy, jm] = start.split('/').map(Number);
      const monthStart = `${jy}/${String(jm).padStart(2, '0')}/01`;
      const startDay = jalaliDayNumber(monthStart);
      const length = jalaliMonthLength(jy, jm);
      buckets.push({
        id: `m-${jy}-${jm}`,
        label: `${jy}/${String(jm).padStart(2, '0')}`,
        start: monthStart,
        startDay,
        endDay: startDay + length - 1,
        total: 0,
        works: [],
      });
      cursor = startDay + length;
    }
    return buckets;
  }
  const size = range.days || 7;
  for(let startDay = alignToWeekday(minDay, originWeekday); startDay <= maxDay; startDay += size){
    buckets.push({
      id: `${range.id}-${startDay}`,
      label: jalaliFromDay(startDay),
      start: jalaliFromDay(startDay),
      startDay,
      endDay: startDay + size - 1,
      total: 0,
      works: [],
    });
  }
  return buckets;
}

export function assignWorksToBuckets(buckets, works){
  buckets.forEach(bucket => {
    bucket.works = [];
    bucket.total = 0;
  });
  works.forEach(work => {
    const day = jalaliDayNumber(work.start);
    if(day == null) return;
    const bucket = buckets.find(item => day >= item.startDay && day <= item.endDay);
    if(!bucket) return;
    bucket.works.push(work);
    bucket.total += Number(work.amount) || 0;
  });
  return buckets;
}

export function plannedCostline(tasks, options = {}){
  const works = collectPlannedWorks(tasks);
  const buckets = assignWorksToBuckets(buildBuckets({
    rangeId: options.rangeId,
    originWeekday: options.originWeekday ?? 4,
    works,
  }), works);
  return { series: 'planned', works, buckets };
}
