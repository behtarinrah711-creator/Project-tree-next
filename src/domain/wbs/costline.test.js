import test from 'node:test';
import assert from 'node:assert/strict';
import { assignWorksToBuckets, buildBuckets, collectPlannedWorks, plannedCostline } from './costline.js';

const tasks = [
  {
    id: 's1', kind: 'stage', text: 'فونداسیون', subtasks: [
      { id: 'w1', kind: 'work', text: 'بتن مگر', type: 'اجرا', quantity: 2, unitCost: 10, scheduleStart: '1404/06/12', scheduleEnd: '1404/06/14', subtasks: [] },
      { id: 'w2', kind: 'work', text: 'میلگرد', type: 'خرید', quantity: 1, unitCost: 30, scheduleStart: '1404/06/12', scheduleEnd: '1404/06/13', subtasks: [] },
    ],
  },
  {
    id: 's2', kind: 'stage', text: 'اسکلت', subtasks: [
      { id: 'w3', kind: 'work', text: 'قالب', type: 'پیمانکار', quantity: 1, unitCost: 50, scheduleStart: '1404/07/01', scheduleEnd: '1404/07/10', subtasks: [] },
    ],
  },
];

test('only works with start date and estimate enter planned costline', () => {
  const works = collectPlannedWorks([
    ...tasks,
    { id: 'stage-only', kind: 'stage', text: 'مرحله', subtasks: [] },
    { id: 'no-date', kind: 'work', text: 'بدون تاریخ', quantity: 1, unitCost: 9, subtasks: [] },
  ]);
  assert.equal(works.length, 3);
  assert.equal(works.find(item => item.id === 'w1').amount, 20);
  assert.equal(works.find(item => item.id === 'w1').type, 'اجرا');
  assert.match(works.find(item => item.id === 'w1').path, /فونداسیون/);
});

test('daily buckets place the full work amount on start date', () => {
  const model = plannedCostline(tasks, { rangeId: 'day' });
  const first = model.buckets.find(bucket => bucket.works.some(work => work.id === 'w1'));
  assert.ok(first);
  assert.equal(first.total, 50);
  assert.deepEqual(first.works.map(work => work.id).sort(), ['w1', 'w2']);
});

test('weekly buckets honor weekday origin without mixing later month work', () => {
  const model = plannedCostline(tasks, { rangeId: 'week', originWeekday: 4 });
  const later = model.buckets.find(bucket => bucket.works.some(work => work.id === 'w3'));
  assert.ok(later);
  assert.equal(later.works.some(work => work.id === 'w1'), false);
  assert.equal(later.total, 50);
});

test('month buckets keep planned series only', () => {
  const works = collectPlannedWorks(tasks);
  const buckets = assignWorksToBuckets(buildBuckets({ rangeId: 'month', works }), works);
  assert.ok(buckets.length >= 2);
  assert.equal(buckets.every(bucket => Array.isArray(bucket.works)), true);
});
