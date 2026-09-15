import test from 'node:test';
import assert from 'node:assert/strict';
import { dependencyGeometry, roundedOrthogonalPath } from './timelineDependencies.js';

test('FS connector path uses rounded orthogonal segments and ends at target Start', () => {
  const path = roundedOrthogonalPath(40, 20, 100, 80, 4);
  assert.match(path, /^M 40 20 H /);
  assert.match(path, / Q /);
  assert.match(path, / V /);
  assert.match(path, / H 100$/);
});

const row = (start, end, startDay, endDay, centerY) => ({start, finish:end, startDay, endDay, centerY});

test('valid FS leaves Finish and enters successor Start directly', () => {
  const source=row(20,40,10,11,20); const target=row(40,60,12,13,80);
  const route=dependencyGeometry(source,target,'FS',[source,target],200);
  assert.equal(route.sourceX,source.finish);
  assert.equal(route.targetX,target.start);
  assert.equal(route.invalid,false);
});

test('equal-date FS exits beyond predecessor Finish instead of crossing its bar', () => {
  const source=row(20,60,10,12,20); const target=row(40,80,12,14,80);
  const route=dependencyGeometry(source,target,'FS',[source,target],200);
  assert.equal(route.sourceX,source.finish);
  assert.equal(route.targetX,target.start);
  assert.equal(route.invalid,true);
  assert.ok(route.laneX>source.finish);
  assert.match(roundedOrthogonalPath(route.sourceX,20,route.targetX,80,4,route.laneX),/^M 60 20 H /);
});

test('overlapping FS keeps the same Finish-to-Start anchors and uses an outside lane', () => {
  const source=row(20,80,10,14,20); const target=row(40,60,12,13,80);
  const route=dependencyGeometry(source,target,'FS',[source,target],200);
  assert.deepEqual({sourceX:route.sourceX,targetX:route.targetX,invalid:route.invalid},{sourceX:80,targetX:40,invalid:true});
  assert.ok(route.laneX>source.finish);
});
