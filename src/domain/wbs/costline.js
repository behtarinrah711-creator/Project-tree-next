import { gregorianToJalali, jalaliMonthLength, jalaliToGregorian } from '../../ui/jalali.js';
import { isWork, lineTotal, scheduleEndOf, scheduleStartOf, walkTree } from './normalize.js';

const MONTHS = ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
const SEASONS = ['بهار','تابستان','پاییز','زمستان'];

export const COSTLINE_RANGES = [
  { id: 'day', label: 'روزانه', days: 1, shade: .2 },
  { id: 'week', label: 'هفتگی', days: 7, shade: .4 },
  { id: 'week2', label: '۲ هفته', days: 14, shade: .6 },
  { id: 'month', label: 'ماهانه', days: null, shade: .8 },
  { id: 'quarter', label: '۳ ماهه', days: null, shade: 1 },
];

export const WEEKDAYS = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];

const faNumber = value => new Intl.NumberFormat('fa-IR', { useGrouping:false, maximumFractionDigits:2 }).format(value);

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

function jalaliPartsFromDay(day){
  const date = new Date(day * 86400000);
  return gregorianToJalali(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
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

function rangeLabel(startDay, endDay){
  const a = jalaliPartsFromDay(startDay);
  const b = jalaliPartsFromDay(endDay);
  if(a.jy === b.jy && a.jm === b.jm){
    return `${faNumber(a.jd)} تا ${faNumber(b.jd)} ${MONTHS[a.jm - 1]}`;
  }
  return `${faNumber(a.jd)} ${MONTHS[a.jm - 1]} تا ${faNumber(b.jd)} ${MONTHS[b.jm - 1]}`;
}

function monthBucket(jy, jm){
  const start = `${jy}/${String(jm).padStart(2, '0')}/01`;
  const startDay = jalaliDayNumber(start);
  const length = jalaliMonthLength(jy, jm);
  return {
    id: `m-${jy}-${jm}`,
    label: `${MONTHS[jm - 1]} ${faNumber(jy)}`,
    start,
    startDay,
    endDay: startDay + length - 1,
    total: 0,
    works: [],
  };
}

function quarterBucket(jy, quarterIndex){
  const jm = (quarterIndex * 3) + 1;
  const start = `${jy}/${String(jm).padStart(2, '0')}/01`;
  const startDay = jalaliDayNumber(start);
  const nextAbsolute = (jy * 12) + (jm - 1) + 3;
  const nextJy = Math.floor(nextAbsolute / 12);
  const nextJm = (nextAbsolute % 12) + 1;
  const endDay = jalaliDayNumber(`${nextJy}/${String(nextJm).padStart(2, '0')}/01`) - 1;
  return {
    id: `q-${jy}-${quarterIndex + 1}`,
    label: `${SEASONS[quarterIndex]} ${faNumber(jy)}`,
    start,
    startDay,
    endDay,
    total: 0,
    works: [],
  };
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
    while(cursor <= maxDay && buckets.length < 120){
      const j = jalaliPartsFromDay(cursor);
      const bucket = monthBucket(j.jy, j.jm);
      buckets.push(bucket);
      cursor = bucket.endDay + 1;
    }
    return buckets;
  }

  if(range.id === 'quarter'){
    let j = jalaliPartsFromDay(minDay);
    let jy = j.jy;
    let quarter = Math.floor((j.jm - 1) / 3);
    while(buckets.length < 80){
      const bucket = quarterBucket(jy, quarter);
      buckets.push(bucket);
      if(bucket.endDay >= maxDay) break;
      quarter += 1;
      if(quarter > 3){ quarter = 0; jy += 1; }
    }
    return buckets;
  }

  const size = range.days || 7;
  const first = range.id === 'day' ? minDay : alignToWeekday(minDay, originWeekday);
  for(let startDay = first; startDay <= maxDay; startDay += size){
    const endDay = startDay + size - 1;
    const start = jalaliFromDay(startDay);
    const dayParts = jalaliPartsFromDay(startDay);
    const label = range.id === 'day'
      ? (dayParts.jd === 1 ? `${faNumber(dayParts.jd)} ${MONTHS[dayParts.jm - 1]}` : faNumber(dayParts.jd))
      : rangeLabel(startDay, endDay);
    buckets.push({
      id: `${range.id}-${startDay}`,
      label,
      start,
      startDay,
      endDay,
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
