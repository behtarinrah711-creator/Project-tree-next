import assert from 'node:assert/strict';
import test from 'node:test';
import { captureBaseline } from './baseline.js';

test('captureBaseline copies live dates and leaves later tasks unmarked', () => {
  const captured = captureBaseline({
    tasks:[{
      id:'work', kind:'work', text:'لوله', scheduleStart:'1405/01/01', scheduleEnd:'1405/01/10',
      workTasks:[{ id:'task', title:'انشعاب', scheduleStart:'1405/01/02', scheduleEnd:'1405/01/04' }],
    }],
  });
  assert.equal(captured.ok, true);
  assert.equal(captured.project.baselineFinish, '1405/01/04');
  assert.equal(captured.project.tasks[0].baselineStart, '1405/01/01');
  assert.equal(captured.project.tasks[0].baselineEnd, '1405/01/10');
  assert.equal(captured.project.tasks[0].workTasks[0].baselineEnd, '1405/01/04');
  captured.project.tasks[0].scheduleEnd = '1405/01/20';
  assert.equal(captured.project.tasks[0].baselineEnd, '1405/01/10');
});

test('captureBaseline rejects a project with no scheduled work', () => {
  assert.equal(captureBaseline({ tasks:[] }).ok, false);
});
