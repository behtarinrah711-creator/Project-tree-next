import test from 'node:test';
import assert from 'node:assert/strict';
import { openFundingStops } from './fundingReceipts.js';

test('uncovered month slice is a funding stop without picking tasks on the receipt', () => {
  const project = {
    tasks: [{
      id: 'stage', text: 'نازک‌کاری', kind: 'work',
      workTasks: [{ id: 't1', title: 'گچکاری', amount: 300, scheduleStart: '1405/01/01', scheduleEnd: '1405/03/30', fundingAccrual: 'spread' }],
    }],
    fundingReceipts: [{ id: 'r1', amount: 100, depositDate: '1405/01/05', allocations: [{ taskId: 't1', bucketId: 'm-1405-1', amount: 100 }] }],
  };
  const stops = openFundingStops(project, '1405/04/01');
  assert.ok(stops.some(stop => stop.taskId === 't1' && stop.bucketLabel.includes('اردیبهشت')));
  assert.equal(stops.find(stop => stop.bucketLabel.includes('فروردین')), undefined);
});
