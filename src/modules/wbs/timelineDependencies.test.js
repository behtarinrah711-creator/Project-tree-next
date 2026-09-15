import test from 'node:test';
import assert from 'node:assert/strict';
import { dependencyGeometry, dependencyPath, roundedOrthogonalPath } from './timelineDependencies.js';

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
  assert.deepEqual([route.sourceAnchor,route.targetAnchor],['finish','start']);
});

test('overlapping FS exits Finish and approaches Start from outside both bars', () => {
  const source=row(20,60,10,12,20); const target=row(40,80,12,14,80);
  const route=dependencyGeometry(source,target,'FS',[source,target],200);
  assert.equal(route.sourceX,source.finish);
  assert.equal(route.targetX,target.start);
  assert.equal(route.routeKind,'reverse-fs');
  assert.ok(route.sourceStubX>source.finish);
  assert.ok(route.targetStubX<target.start);
  assert.match(dependencyPath(route,20,80),/^M 60 20 L /);
});

test('SS routes outside both Start anchors', () => {
  const source=row(40,80,10,14,20); const target=row(60,100,12,16,80);
  const route=dependencyGeometry(source,target,'SS',[source,target],200);
  assert.deepEqual([route.sourceAnchor,route.targetAnchor],['start','start']);
  assert.ok(route.laneX<source.start && route.laneX<target.start);
});

test('FF routes outside both Finish anchors', () => {
  const source=row(20,60,10,12,20); const target=row(40,100,11,16,80);
  const route=dependencyGeometry(source,target,'FF',[source,target],200);
  assert.deepEqual([route.sourceAnchor,route.targetAnchor],['finish','finish']);
  assert.ok(route.laneX>source.finish && route.laneX>target.finish);
});
