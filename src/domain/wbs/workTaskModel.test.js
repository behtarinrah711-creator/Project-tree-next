import test from 'node:test';
import assert from 'node:assert/strict';
import { activeWorkTasks, normalizeWorkTask, taskWeightOf, workTaskProgress } from './workTaskModel.js';
import { lineTotal, normalizeItem, progressOf } from './normalize.js';

test('work task defaults, reference and weighted progress are canonical', () => {
  const task = normalizeWorkTask({ id:'t1', title:'نصب', type:'اجرا' }, 'w1');
  assert.equal(task.workId, 'w1');
  assert.equal(task.weight, 1);
  assert.equal(task.completed, false);
  assert.equal(task.priority, 'normal');

  const work = { kind:'work', progress:77, workTasks:[
    { id:'a', weight:1, completed:false },
    { id:'b', weight:1, completed:false },
    { id:'c', weight:2, completed:true },
  ] };
  assert.equal(workTaskProgress(work), 50);
  assert.equal(progressOf(work), 50);
  assert.equal(taskWeightOf({ weight:'bad' }), 1);
});

test('legacy work without tasks keeps progress and costs unchanged', () => {
  const legacy = normalizeItem({ id:'w1', kind:'work', progress:37, quantity:2, unitCost:10 });
  assert.deepEqual(activeWorkTasks(legacy), []);
  assert.equal(progressOf(legacy), 37);
  assert.equal(lineTotal(legacy), 20);
  assert.deepEqual(legacy.workTasks, []);
});

test('work tasks never contribute a separate cost', () => {
  const work = { kind:'work', quantity:2, unitCost:50, workTasks:[{ id:'t1', quantity:999, unitCost:999 }] };
  assert.equal(lineTotal(work), 100);
});
