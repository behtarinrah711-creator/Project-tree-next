import test from 'node:test';
import assert from 'node:assert/strict';
import { openFundingStops } from './fundingReceipts.js';

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
