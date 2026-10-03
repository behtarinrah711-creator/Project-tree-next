import test from 'node:test';
import assert from 'node:assert/strict';
import { allocatedForBucket, openFundingStops, placeCardFunding, poolAllocated, poolRemaining, receiptTotalAllowed, setBucketFunding } from './fundingReceipts.js';
import { jalaliDayNumber } from './costline.js';

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

test('a receipt cannot be reduced below the allocated total', () => {
  const project = {
    tasks:[{
      id:'s1', kind:'stage', text:'مرحله', subtasks:[
        { id:'w1', kind:'work', text:'اول', quantity:1, unitCost:70, scheduleStart:'1405/07/18', scheduleEnd:'1405/07/18', subtasks:[] },
        { id:'w2', kind:'work', text:'دوم', quantity:1, unitCost:60, scheduleStart:'1405/07/19', scheduleEnd:'1405/07/19', subtasks:[] },
      ],
    }],
    fundingReceipts:[{ id:'r1', amount:100 }, { id:'r2', amount:50 }],
    fundingAllocations:[
      { taskId:'w1', day:jalaliDayNumber('1405/07/18'), amount:70 },
      { taskId:'w2', day:jalaliDayNumber('1405/07/19'), amount:60 },
    ],
  };
  assert.equal(poolAllocated(project), 130);
  assert.equal(receiptTotalAllowed(project, 120), false);
  assert.equal(receiptTotalAllowed(project, 130), true);
  assert.equal(poolRemaining(project), 20);
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

test('start funding stays on the start day and is invisible in other ranges', () => {
  const startDay = jalaliDayNumber('1405/07/18');
  const project = {
    tasks:mdfTasks('start'),
    fundingReceipts:[{ id:'r1', amount:200 }],
    fundingAllocations:[{ taskId:'w1', day:startDay, amount:80 }],
  };
  assert.equal(allocatedForBucket(project, 'w1', { startDay, endDay:startDay }), 80);
  assert.equal(allocatedForBucket(project, 'w1', { startDay:startDay + 1, endDay:startDay + 6 }), 0);
});

test('editing one range keeps the funded amount outside it and the exact total', () => {
  const startDay = jalaliDayNumber('1405/07/18');
  const project = {
    tasks:mdfTasks('spread'),
    fundingReceipts:[{ id:'r1', amount:200 }],
    fundingAllocations:[
      { taskId:'w1', startDay, endDay:startDay + 6, amount:20 },
      { taskId:'w1', startDay:startDay + 7, endDay:startDay + 13, amount:30 },
    ],
  };
  const saved = setBucketFunding(project, 'w1', { startDay, endDay:startDay + 6 }, 10);
  assert.equal(saved.ok, true);
  assert.equal(allocatedForBucket(saved.project, 'w1', { startDay, endDay:startDay + 6 }), 10);
  assert.equal(allocatedForBucket(saved.project, 'w1', { startDay:startDay + 7, endDay:startDay + 13 }), 30);
  assert.equal(poolAllocated(saved.project), 40);
});

test('moving dates puts start funding on the new start and respreads uniform funding', () => {
  const startDay = jalaliDayNumber('1405/07/18');
  const project = {
    tasks:mdfTasks('start'),
    fundingReceipts:[{ id:'r1', amount:200 }],
    fundingAllocations:[{ taskId:'w1', day:startDay, amount:80 }],
  };
  project.tasks[0].subtasks[0].scheduleStart = '1405/07/20';
  const moved = placeCardFunding(project, 'w1');
  assert.equal(allocatedForBucket(moved, 'w1', { startDay:jalaliDayNumber('1405/07/20'), endDay:jalaliDayNumber('1405/07/20') }), 80);
  assert.equal(allocatedForBucket(moved, 'w1', { startDay, endDay:startDay }), 0);

  const spread = {
    tasks:mdfTasks('spread'),
    fundingReceipts:[{ id:'r1', amount:200 }],
    fundingAllocations:[{ taskId:'w1', startDay, endDay:startDay + 1, amount:10 }],
  };
  spread.tasks[0].subtasks[0].scheduleStart = '1405/07/18';
  spread.tasks[0].subtasks[0].scheduleEnd = '1405/07/21';
  const respread = placeCardFunding(spread, 'w1');
  const days = [0, 1, 2, 3].map(offset => allocatedForBucket(respread, 'w1', { startDay:startDay + offset, endDay:startDay + offset }));
  assert.deepEqual(days, [2, 3, 2, 3]);
  assert.equal(days.reduce((sum, amount) => sum + amount, 0), 10);
});

test('lowering the estimate frees the extra funded amount', () => {
  const startDay = jalaliDayNumber('1405/07/18');
  const project = {
    tasks:mdfTasks('start'),
    fundingReceipts:[{ id:'r1', amount:200 }],
    fundingAllocations:[{ taskId:'w1', day:startDay, amount:80 }],
  };
  project.tasks[0].subtasks[0].unitCost = 50;
  const next = placeCardFunding(project, 'w1');
  assert.equal(poolAllocated(next), 50);
  assert.equal(poolRemaining(next), 150);
});
