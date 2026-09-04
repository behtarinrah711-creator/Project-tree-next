import assert from 'node:assert/strict';
import test from 'node:test';
import { formatTimelineDate, shouldShowProgressLabel } from './timelineDetails.js';

test('Timeline dates render as Jalali month/day in Persian digits', () => {
  assert.equal(formatTimelineDate('1405/6/12'), '۶/۱۲');
  assert.equal(formatTimelineDate('1405/7/4'), '۷/۴');
});

test('progress labels depend on available bar width rather than percentage threshold', () => {
  assert.equal(shouldShowProgressLabel(8, 50), false);
  assert.equal(shouldShowProgressLabel(27, 10), false);
  assert.equal(shouldShowProgressLabel(28, 10), true);
  assert.equal(shouldShowProgressLabel(33, 100), false);
  assert.equal(shouldShowProgressLabel(34, 100), true);
  assert.equal(shouldShowProgressLabel(80, 0), false);
});
