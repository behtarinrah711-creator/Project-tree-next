import test from 'node:test';
import assert from 'node:assert/strict';
import { canAcceptChild, itemKind, isStage, isWork, lineTotal, normalizeItem, progressWeightOf } from './normalize.js';
import { projectEstimateTotal, rollupEstimate, rollupProgress } from './estimate.js';
import { stampCreate, stampUpdate } from './timestamps.js';
import { validateWbsExport, WBS_EXPORT_SCHEMA } from './exportSchema.js';

test('old tasks without kind read as work items', () => {
  assert.equal(itemKind({ id:'a', text:'بتن' }), 'work');
  assert.equal(isWork({ id:'a', text:'بتن' }), true);
  assert.equal(isStage({ id:'a', text:'بتن' }), false);
});

test('stage may hold stage or work; work is always a terminal leaf', () => {
  assert.equal(canAcceptChild({ kind:'stage' }, 'stage'), true);
  assert.equal(canAcceptChild({ kind:'stage' }, 'work'), true);
  assert.equal(canAcceptChild({ kind:'work' }, 'work'), false);
  assert.equal(canAcceptChild({ kind:'work' }, 'stage'), false);
});

test('a stage cannot mix stage children with work children', () => {
  assert.equal(canAcceptChild({ kind:'stage', subtasks:[{ kind:'stage' }] }, 'stage'), true);
  assert.equal(canAcceptChild({ kind:'stage', subtasks:[{ kind:'stage' }] }, 'work'), false);
  assert.equal(canAcceptChild({ kind:'stage', subtasks:[{ kind:'work' }] }, 'work'), true);
  assert.equal(canAcceptChild({ kind:'stage', subtasks:[{ kind:'work' }] }, 'stage'), false);
});

test('progress weights default to one and roll up recursively', () => {
  const tree = [{ kind:'stage', progressWeight:2, subtasks:[
    { kind:'stage', progressWeight:1, subtasks:[
      { kind:'work', progressWeight:1, progress:100 },
      { kind:'work', progressWeight:3, progress:0 },
    ] },
    { kind:'stage', progressWeight:3, subtasks:[
      { kind:'work', progressWeight:1, progress:100 },
    ] },
  ] }];
  assert.equal(progressWeightOf({}), 1);
  assert.equal(rollupProgress(tree), 81);
});

test('estimate is quantity times unit cost and rolls up through stages', () => {
  const first = { kind:'work', quantity:2, unitCost:10, subtasks:[] };
  const second = { kind:'work', quantity:1, unitCost:5, subtasks:[] };
  const nestedStage = { kind:'stage', subtasks:[first, second] };
  const stage = { kind:'stage', subtasks:[nestedStage] };
  assert.equal(lineTotal(first), 20);
  assert.equal(rollupEstimate([stage]), 25);
  assert.equal(projectEstimateTotal([stage], [{ quantity:2, unitCost:3 }]), 31);
});

test('trashed stage excludes its full descendant branch from estimate', () => {
  const hiddenWork = { kind:'work', quantity:3, unitCost:10, subtasks:[] };
  const hiddenStage = { kind:'stage', trashed:true, subtasks:[hiddenWork] };
  const visibleWork = { kind:'work', quantity:2, unitCost:5, subtasks:[] };
  assert.equal(rollupEstimate([hiddenStage, visibleWork]), 10);
});

test('timestamps create then update createdAt stays', () => {
  const created = stampCreate({ id:'1' }, () => new Date('2026-01-01T00:00:00.000Z'));
  const updated = stampUpdate(created, () => new Date('2026-01-02T00:00:00.000Z'));
  assert.equal(created.createdAt, '2026-01-01T00:00:00.000Z');
  assert.equal(updated.createdAt, '2026-01-01T00:00:00.000Z');
  assert.equal(updated.updatedAt, '2026-01-02T00:00:00.000Z');
});

test('export schema is versioned and old nodes normalize as work', () => {
  const payload = { schema: WBS_EXPORT_SCHEMA, items: [normalizeItem({ id:'t1', text:'old' })] };
  assert.equal(validateWbsExport(payload).ok, true);
  assert.equal(payload.items[0].kind, 'work');
  assert.equal(validateWbsExport({ schema:'other', items:[] }).ok, false);
});
