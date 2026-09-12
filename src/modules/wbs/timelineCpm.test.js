import test from 'node:test';
import assert from 'node:assert/strict';
import { criticalActivityIds, isDrivingCriticalLink } from './timelineCpm.js';

test('critical activities include zero and negative float but exclude open paths', () => {
  const ids = criticalActivityIds({ rows:new Map([
    ['zero',{ totalFloat:0 }], ['negative',{ totalFloat:-2 }], ['positive',{ totalFloat:3 }], ['open',{ totalFloat:null }],
  ]) });
  assert.deepEqual([...ids], ['zero','negative']);
});

test('critical dependency is highlighted only when it drives the successor early start', () => {
  const analysis = { rows:new Map([
    ['driving',{ earlyFinish:4, totalFloat:0 }],
    ['non-driving',{ earlyFinish:2, totalFloat:0 }],
    ['successor',{ earlyStart:4, totalFloat:0 }],
    ['positive',{ earlyFinish:4, totalFloat:2 }],
  ]) };
  assert.equal(isDrivingCriticalLink(analysis, 'driving', 'successor'), true);
  assert.equal(isDrivingCriticalLink(analysis, 'non-driving', 'successor'), false);
  assert.equal(isDrivingCriticalLink(analysis, 'positive', 'successor'), false);
});
