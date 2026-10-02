import test from 'node:test';
import assert from 'node:assert/strict';
import { openFundingStops, stopIntervalForItem } from './fundingReceipts.js';

test('open funding stop uses due date through today and does not invent finish impact', () => {
  const project = { fundingReceipts: [
    { id: 'r1', dueDate: '1405/01/01', depositDate: '', affectedTaskIds: ['t1'] },
    { id: 'paid', dueDate: '1405/01/01', depositDate: '1405/01/02', affectedTaskIds: ['t2'] },
    { id: 'future', dueDate: '1405/01/20', depositDate: '', affectedTaskIds: ['t3'] },
  ] };
  const stops = openFundingStops(project, '1405/01/11');
  assert.equal(stops.length, 1);
  assert.equal(stops[0].duration, 10);
  assert.equal(stops[0].finishEffect, undefined);
  assert.deepEqual(stopIntervalForItem(project, { id: 't1' }, '1405/01/11')?.duration, 10);
  assert.equal(stopIntervalForItem(project, { id: 't2' }, '1405/01/11'), null);
});
