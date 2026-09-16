import test from 'node:test';
import assert from 'node:assert/strict';
import { dependencyGeometry, dependencyMarkerId, dependencyPath, dependencyRelationClass, roundedOrthogonalPath } from './timelineDependencies.js';

test('FS connector path uses rounded orthogonal segments and ends at target Start', () => {
  const path = roundedOrthogonalPath(40, 20, 100, 80, 4);
  assert.match(path, /^M 40 20 H /);
  assert.match(path, / Q /);
  assert.match(path, / V /);
  assert.match(path, / H 100$/);
});

const row = (start, end, startDay, endDay, centerY) => ({start, finish:end, startDay, endDay, centerY});

test('all logical relation types use the same Start-to-Start visual geometry', () => {
  const source=row(20,40,10,11,20); const target=row(40,60,12,13,80);
  for(const type of ['FS','SS','FF']){
    const route=dependencyGeometry(source,target,type,[source,target],200);
    assert.equal(route.type,type);
    assert.equal(route.sourceX,source.start);
    assert.equal(route.targetX,target.start);
    assert.deepEqual([route.sourceAnchor,route.targetAnchor],['start','start']);
    assert.equal(route.routeKind,'start-trunk');
  }
});

test('start trunk stays inside the timeline at the WBS boundary', () => {
  const source=row(0,60,10,12,20); const target=row(40,80,12,14,80);
  const route=dependencyGeometry(source,target,'FS',[source,target],200);
  assert.equal(route.laneX,0.75);
  assert.match(dependencyPath(route,20,80),/^M 0 20 H /);
  assert.match(dependencyPath(route,20,80),/ H 40$/);
});

test('start trunk uses an 8px lead-in when there is room', () => {
  const source=row(40,80,10,14,20); const target=row(70,100,15,18,80);
  const route=dependencyGeometry(source,target,'FS',[source,target],200);
  assert.equal(route.laneX,32);
  assert.match(dependencyPath(route,20,80),/^M 40 20 H /);
});

test('logical relation types retain distinct style classes and markers', () => {
  assert.equal(dependencyRelationClass('FS'),'is-relation-fs');
  assert.equal(dependencyRelationClass('SS'),'is-relation-ss');
  assert.equal(dependencyRelationClass('FF'),'is-relation-ff');
  assert.equal(dependencyMarkerId('FS'),'wbs-gantt-fs-arrow');
  assert.equal(dependencyMarkerId('SS'),'wbs-gantt-ss-arrow');
  assert.equal(dependencyMarkerId('FF'),'wbs-gantt-ff-arrow');
});
