import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEffectiveNetwork, calculateCpm, effectiveDependencyLinks, plannedProgress, validatePredecessors } from './scheduling.js';

test('planned progress is calendar-day based and bounded', () => {
  assert.equal(plannedProgress('1405/01/01', '1405/01/10', 20532), 0);
  const start = 20533;
  assert.equal(plannedProgress('1405/01/01', '1405/01/10', start), 0);
  assert.equal(plannedProgress('1405/01/01', '1405/01/10', start + 9), 100);
});

test('predecessors reject cycles and package plus descendant duplication', () => {
  const tree = [{ id:'s', kind:'stage', subtasks:[{ id:'a', kind:'work', predecessorIds:[], workTasks:[] }, { id:'b', kind:'work', predecessorIds:['a'], workTasks:[] }] }];
  assert.equal(validatePredecessors(tree, 'a', ['b']).code, 'cycle');
  assert.equal(validatePredecessors(tree, 'b', ['s', 'a']).code, 'duplicate_scope');
});

test('CPM uses latest predecessor and only reports float on anchored paths', () => {
  const result = calculateCpm([
    { id:'a', duration:3 }, { id:'b', duration:5 }, { id:'c', duration:2, predecessorIds:['a','b'] },
  ], { projectFinish:10 });
  assert.equal(result.ok, true);
  assert.equal(result.rows.get('c').earlyStart, 5);
  assert.equal(result.rows.get('c').totalFloat, 3);
  const open = calculateCpm([{ id:'x', duration:2 }]);
  assert.equal(open.rows.get('x').totalFloat, null);
});

test('package predecessors expand to all effective Task leaves', () => {
  const tree = [
    { id:'package', kind:'stage', subtasks:[{ id:'source', kind:'work', workTasks:[{ id:'t1' }, { id:'t2' }] }] },
    { id:'target', kind:'work', predecessorIds:['package'], workTasks:[] },
  ];
  const network = buildEffectiveNetwork(tree);
  assert.deepEqual(network.activities.find(row => row.id === 'target').predecessorIds, ['t1','t2']);
  assert.deepEqual(network.unresolved, []);
});

test('dependency drawing resolves aggregate predecessors to their latest scheduled leaf', () => {
  const tree = [
    { id:'package', kind:'stage', subtasks:[{ id:'source', kind:'work', predecessorIds:[], workTasks:[
      { id:'early', title:'Early', scheduleStart:'1405/01/01', scheduleEnd:'1405/01/03' },
      { id:'late', title:'Late', scheduleStart:'1405/01/01', scheduleEnd:'1405/01/08' },
    ] }] },
    { id:'target', kind:'work', scheduleStart:'1405/01/09', scheduleEnd:'1405/01/10', predecessorIds:['package'], workTasks:[] },
  ];
  assert.deepEqual(effectiveDependencyLinks(tree), [{ sourceId:'late', targetId:'target', predecessorId:'package', type:'FS', lagDays:0 }]);
});

test('dependency drawing omits unscheduled endpoints and aggregate Work consumers', () => {
  const tree = [
    { id:'source', kind:'work', scheduleStart:'1405/01/01', scheduleEnd:'1405/01/02', predecessorIds:[], workTasks:[] },
    { id:'aggregate', kind:'work', predecessorIds:['source'], workTasks:[
      { id:'dated', title:'Dated', scheduleStart:'1405/01/03', scheduleEnd:'1405/01/04', predecessorIds:['source'] },
      { id:'undated', title:'Undated', predecessorIds:['source'] },
    ] },
  ];
  assert.deepEqual(effectiveDependencyLinks(tree), [{ sourceId:'source', targetId:'dated', predecessorId:'source', type:'FS', lagDays:0 }]);
});


test('SS aggregate predecessor resolves from earliest scheduled leaf while FS and FF resolve from latest finish', () => {
  const source = {
    id:'package', kind:'stage', subtasks:[{
      id:'source', kind:'work', workTasks:[
        { id:'early', title:'Early', scheduleStart:'1405/01/01', scheduleEnd:'1405/01/03' },
        { id:'late', title:'Late', scheduleStart:'1405/01/04', scheduleEnd:'1405/01/08' },
      ],
    }],
  };
  const target = type => ({
    id:'target', kind:'work', scheduleStart:'1405/01/09', scheduleEnd:'1405/01/10',
    predecessorIds:['package'],
    dependencies:[{ predecessorId:'package', type, lagDays:0 }],
    workTasks:[],
  });
  assert.equal(effectiveDependencyLinks([source, target('SS')])[0].sourceId, 'early');
  assert.equal(effectiveDependencyLinks([source, target('FS')])[0].sourceId, 'late');
  assert.equal(effectiveDependencyLinks([source, target('FF')])[0].sourceId, 'late');
});
