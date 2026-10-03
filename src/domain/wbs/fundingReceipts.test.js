import test from 'node:test';
import assert from 'node:assert/strict';
import { allocatedForBucket, openFundingStops, poolAllocated, setAllocationsForBucketTotal, trimFundingAllocationsToReceipts } from './fundingReceipts.js';
import { collectPlannedWorks, jalaliDayNumber, sliceShare } from './costline.js';

const mdfTasks = accrual => [{
  id:'s1', kind:'stage', text:'دکور MDF', subtasks:[{
    id:'w1', kind:'work', text:'اجرای MDF', quantity:1, unitCost:140,
    scheduleStart:'1405/07/18', scheduleEnd:'1405/08/10', fundingAccrual:accrual, subtasks:[],
  }],
}];

test('uncovered month slice is a funding stop without picking tasks on the receipt', () => {
  const project = {
    tasks: [{
      id: 'w1', kind: 'work', text: 'گچکاری', quantity: 1, unitCost: 300,
      scheduleStart: '1405/01/01', scheduleEnd: '1405/03/30', fundingAccrual: 'spread', subtasks: [],
    }],
    fundingReceipts: [{ id: 'r1', amount: 100, depositDate: '1405/01/05', allocations: [{ taskId: 'w1', bucketId: 'm-1405-1', amount: 100 }] }],
  };
  const stops = openFundingStops(project, '1405/04/01');
  assert.ok(stops.some(stop => stop.taskId === 'w1' && !stop.bucketLabel.includes('فروردین')));
  assert.equal(stops.find(stop => stop.bucketLabel.includes('فروردین')), undefined);
});

test('a weekly allocation remains funded inside a two-week view', () => {
  const project = {
    fundingReceipts: [{ id:'r1', amount:20 }],
    fundingAllocations: [{ taskId:'w1', startDay:100, endDay:106, amount:20, kind:'manual' }],
  };
  assert.equal(allocatedForBucket(project, 'w1', { id:'week2-100', startDay:100, endDay:113 }), 20);
});

test('an allocation is apportioned when a narrower view overlaps part of it', () => {
  const project = {
    fundingReceipts: [{ id:'r1', amount:40 }],
    fundingAllocations: [{ taskId:'w1', startDay:100, endDay:113, amount:40, kind:'slice' }],
  };
  assert.equal(allocatedForBucket(project, 'w1', { id:'week-100', startDay:100, endDay:106 }), 20);
});

test('deleting every receipt removes every pool allocation', () => {
  const project = {
    fundingReceipts: [{ id:'r1', amount:100, trashed:true }],
    fundingAllocations: [{ taskId:'w1', startDay:100, endDay:106, amount:80, kind:'manual' }],
  };
  assert.deepEqual(trimFundingAllocationsToReceipts(project), []);
  assert.equal(allocatedForBucket(project, 'w1', { startDay:100, endDay:106 }), 0);
});

test('deleting a receipt trims pool allocations to the remaining received budget', () => {
  const project = {
    fundingAllocations: [
      { taskId:'w1', amount:70, kind:'manual' },
      { taskId:'w2', amount:60, kind:'manual' },
    ],
  };
  assert.deepEqual(trimFundingAllocationsToReceipts(project, [{ id:'r1', amount:100 }]).map(item => item.amount), [70, 30]);
});

test('task allocation follows the single start accrual mode in every chart scale', () => {
  const project = {
    tasks:mdfTasks('start'),
    fundingReceipts:[{ id:'r1', amount:150 }],
    fundingAllocations:[
      { taskId:'w1', amount:100, kind:'manual' },
      { taskId:'w1', amount:20, kind:'manual' },
    ],
  };
  const startDay = jalaliDayNumber('1405/07/18');
  assert.equal(allocatedForBucket(project, 'w1', { startDay:startDay - 3, endDay:startDay + 10 }), 120);
  assert.equal(allocatedForBucket(project, 'w1', { startDay:startDay - 17, endDay:startDay - 4 }), 0);
});

test('spread allocation never exceeds the planned slice and conserves the task total', () => {
  const project = {
    tasks:mdfTasks('spread'),
    fundingReceipts:[{ id:'r1', amount:150 }],
    fundingAllocations:[{ taskId:'w1', amount:120, kind:'manual' }],
  };
  const startDay = jalaliDayNumber('1405/07/18');
  const endDay = jalaliDayNumber('1405/08/10');
  const buckets = [{ startDay, endDay:startDay + 10 }, { startDay:startDay + 11, endDay }];
  const funded = buckets.map(bucket => allocatedForBucket(project, 'w1', bucket));
  assert.equal(funded.reduce((sum, amount) => sum + amount, 0), 120);
  assert.ok(funded[0] <= 65);
  assert.ok(funded[1] <= 76);
});

test('manual interval amount is not expanded to the full task or slice', () => {
  const startDay = jalaliDayNumber('1405/07/18');
  const bucket = { startDay, endDay:startDay + 10 };
  const project = {
    tasks:mdfTasks('spread'),
    fundingReceipts:[{ id:'r1', amount:200 }],
    fundingAllocations:[{
      taskId:'w1', bucketId:'week2-1', startDay, endDay:startDay + 10,
      amount:50, kind:'manual',
    }],
  };
  assert.equal(allocatedForBucket(project, 'w1', bucket), 50);
});

test('interval allocations aggregate consistently when switching chart scales', () => {
  const startDay = jalaliDayNumber('1405/07/18');
  const project = {
    tasks:mdfTasks('spread'),
    fundingReceipts:[{ id:'r1', amount:200 }],
    fundingAllocations:[
      { taskId:'w1', startDay, endDay:startDay + 6, amount:20, kind:'manual' },
      { taskId:'w1', startDay:startDay + 7, endDay:startDay + 13, amount:30, kind:'manual' },
    ],
  };
  assert.equal(allocatedForBucket(project, 'w1', { startDay, endDay:startDay + 13 }), 50);
  assert.equal(allocatedForBucket(project, 'w1', { startDay, endDay:startDay + 6 }), 20);
  assert.equal(allocatedForBucket(project, 'w1', { startDay:startDay + 7, endDay:startDay + 13 }), 30);
});


test('adding tasks before, between, or after funded work does not move its allocation', () => {
  const startDay = jalaliDayNumber('1405/07/18');
  const fundedBucket = { id:'week2-funded', startDay, endDay:startDay + 10 };
  const fundedTask = mdfTasks('spread')[0].subtasks[0];
  const project = {
    tasks:[{
      id:'s1', kind:'stage', text:'دکور MDF', subtasks:[fundedTask],
    }],
    fundingReceipts:[{ id:'r1', amount:200 }],
    fundingAllocations:[{
      taskId:'w1', bucketId:fundedBucket.id, startDay, endDay:startDay + 10,
      amount:50, kind:'manual',
    }],
  };
  assert.equal(allocatedForBucket(project, 'w1', fundedBucket), 50);

  project.tasks[0].subtasks = [
    { id:'before', kind:'work', text:'کار گذشته', quantity:1, unitCost:25, scheduleStart:'1405/06/01', scheduleEnd:'1405/06/05', subtasks:[] },
    fundedTask,
    { id:'middle', kind:'work', text:'کار میانی', quantity:1, unitCost:30, scheduleStart:'1405/07/20', scheduleEnd:'1405/07/22', subtasks:[] },
    { id:'after', kind:'work', text:'کار آینده', quantity:1, unitCost:40, scheduleStart:'1405/09/01', scheduleEnd:'1405/09/05', subtasks:[] },
  ];

  assert.equal(allocatedForBucket(project, 'w1', fundedBucket), 50);
  assert.equal(allocatedForBucket(project, 'before', fundedBucket), 0);
  assert.equal(allocatedForBucket(project, 'middle', fundedBucket), 0);
  assert.equal(allocatedForBucket(project, 'after', fundedBucket), 0);
});


test('editing a wider bucket redistributes smaller allocations to the requested total', () => {
  const startDay = jalaliDayNumber('1405/07/18');
  const bucket = { id:'month-1', startDay, endDay:startDay + 13 };
  const project = {
    tasks:mdfTasks('spread'),
    fundingReceipts:[{ id:'r1', amount:200 }],
    fundingAllocations:[
      { taskId:'w1', startDay, endDay:startDay + 6, amount:20, kind:'manual' },
      { taskId:'w1', startDay:startDay + 7, endDay:startDay + 13, amount:30, kind:'manual' },
    ],
  };
  project.fundingAllocations = setAllocationsForBucketTotal(project, 'w1', bucket, 10);
  assert.equal(allocatedForBucket(project, 'w1', bucket), 10);
  project.fundingAllocations = setAllocationsForBucketTotal(project, 'w1', bucket, 0);
  assert.equal(allocatedForBucket(project, 'w1', bucket), 0);
});

test('editing one bucket preserves the funded amount outside that bucket', () => {
  const startDay = jalaliDayNumber('1405/07/18');
  const project = {
    tasks:mdfTasks('spread'),
    fundingReceipts:[{ id:'r1', amount:200 }],
    fundingAllocations:[{
      taskId:'w1', startDay, endDay:startDay + 13, amount:140, kind:'manual',
    }],
  };
  project.fundingAllocations = setAllocationsForBucketTotal(
    project,
    'w1',
    { id:'week-1', startDay, endDay:startDay + 6 },
    20,
  );
  assert.equal(allocatedForBucket(project, 'w1', { startDay, endDay:startDay + 6 }), 20);
  assert.equal(allocatedForBucket(project, 'w1', { startDay:startDay + 7, endDay:startDay + 13 }), 70);
});

test('saving a wider chart bucket keeps the funded total on the work days only', () => {
  const startDay = jalaliDayNumber('1405/07/18');
  const endDay = jalaliDayNumber('1405/07/24');
  const project = {
    tasks:[{ id:'s1', kind:'stage', text:'مرحله', subtasks:[{
      id:'w1', kind:'work', text:'کارت', quantity:1, unitCost:70,
      scheduleStart:'1405/07/18', scheduleEnd:'1405/07/24', subtasks:[],
    }] }],
    fundingReceipts:[{ id:'r1', amount:200 }],
    fundingAllocations:[{ taskId:'w1', startDay, endDay, amount:70, kind:'manual' }],
  };
  const wider = { id:'wide', startDay:startDay - 3, endDay:endDay + 4 };
  const shown = allocatedForBucket(project, 'w1', wider);
  project.fundingAllocations = setAllocationsForBucketTotal(project, 'w1', wider, shown);
  let workDays = 0;
  for(let day = startDay; day <= endDay; day += 1){
    workDays += allocatedForBucket(project, 'w1', { startDay:day, endDay:day });
  }
  assert.equal(shown, 70);
  assert.equal(workDays, 70);
  assert.equal(poolAllocated(project), 70);
  assert.equal(allocatedForBucket(project, 'w1', { startDay:endDay + 1, endDay:wider.endDay }), 0);
});

test('funding a slice does not leave money on days the work does not occupy', () => {
  const startDay = jalaliDayNumber('1405/07/18');
  const endDay = jalaliDayNumber('1405/07/20');
  const project = {
    tasks:[{ id:'s1', kind:'stage', text:'مرحله', subtasks:[{
      id:'w1', kind:'work', text:'کوتاه', quantity:1, unitCost:30,
      scheduleStart:'1405/07/18', scheduleEnd:'1405/07/20', subtasks:[],
    }] }],
    fundingReceipts:[{ id:'r1', amount:200 }],
    fundingAllocations:[],
  };
  const week = { id:'week', startDay, endDay:startDay + 6 };
  const work = collectPlannedWorks(project.tasks)[0];
  const slice = sliceShare(work, week);
  project.fundingAllocations = setAllocationsForBucketTotal(project, 'w1', week, slice);
  let workDays = 0;
  for(let day = startDay; day <= endDay; day += 1){
    workDays += allocatedForBucket(project, 'w1', { startDay:day, endDay:day });
  }
  assert.equal(allocatedForBucket(project, 'w1', week), slice);
  assert.equal(workDays, slice);
  assert.equal(poolAllocated(project), slice);
  assert.equal(allocatedForBucket(project, 'w1', { startDay:endDay + 1, endDay:week.endDay }), 0);
});

test('bucket shares of one allocation sum to the allocated total and saving the shown amount keeps it', () => {
  const startDay = jalaliDayNumber('1405/07/18');
  const project = {
    tasks:mdfTasks('spread'),
    fundingReceipts:[{ id:'r1', amount:200 }],
    fundingAllocations:[
      { taskId:'w1', startDay, endDay:startDay + 6, amount:20, kind:'manual' },
      { taskId:'w1', startDay:startDay + 7, endDay:startDay + 13, amount:30, kind:'manual' },
    ],
  };
  const month = { id:'mehr', startDay:jalaliDayNumber('1405/07/01'), endDay:jalaliDayNumber('1405/07/30') };
  const nextDay = { startDay:startDay + 13, endDay:startDay + 13 };
  const shown = allocatedForBucket(project, 'w1', month);
  assert.equal(shown + allocatedForBucket(project, 'w1', nextDay), 50);
  project.fundingAllocations = setAllocationsForBucketTotal(project, 'w1', month, shown);
  assert.equal(poolAllocated(project), 50);
  assert.equal(allocatedForBucket(project, 'w1', month), shown);
});

test('a task added under a funded work keeps that funding without changing the allocated total', () => {
  const startDay = jalaliDayNumber('1405/07/18');
  const endDay = jalaliDayNumber('1405/08/10');
  const project = {
    tasks:mdfTasks('spread'),
    fundingReceipts:[{ id:'r1', amount:200 }],
    fundingAllocations:[{ taskId:'w1', startDay, endDay, amount:70, kind:'manual' }],
  };
  const span = { startDay, endDay };
  assert.equal(allocatedForBucket(project, 'w1', span), 70);
  project.tasks[0].subtasks[0].workTasks = [
    { id:'t1', workId:'w1', title:'تسک جدید', amount:90, scheduleStart:'1405/07/18', scheduleEnd:'1405/08/10' },
  ];
  assert.equal(collectPlannedWorks(project.tasks).map(work => work.id).join(','), 't1');
  assert.equal(allocatedForBucket(project, 't1', span), 70);
  assert.equal(allocatedForBucket(project, 'w1', span), 0);
  assert.equal(poolAllocated(project), 70);
  project.tasks[0].subtasks[0].workTasks.push(
    { id:'t2', workId:'w1', title:'تسک دوم', amount:30, scheduleStart:'1405/07/18', scheduleEnd:'1405/08/10' },
  );
  const first = allocatedForBucket(project, 't1', span);
  const second = allocatedForBucket(project, 't2', span);
  assert.equal(first + second, 70);
  assert.equal(first > second, true);
});
