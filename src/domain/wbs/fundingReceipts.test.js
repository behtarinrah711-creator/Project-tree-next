import test from 'node:test';
import assert from 'node:assert/strict';
import { allocatedForBucket, openFundingStops } from './fundingReceipts.js';

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
    fundingAllocations: [{ taskId:'w1', startDay:100, endDay:106, amount:20, kind:'manual' }],
  };
  assert.equal(allocatedForBucket(project, 'w1', { id:'week2-100', startDay:100, endDay:113 }), 20);
});

test('an allocation is apportioned when a narrower view overlaps part of it', () => {
  const project = {
    fundingAllocations: [{ taskId:'w1', startDay:100, endDay:113, amount:40, kind:'slice' }],
  };
  assert.equal(allocatedForBucket(project, 'w1', { id:'week-100', startDay:100, endDay:106 }), 20);
});
