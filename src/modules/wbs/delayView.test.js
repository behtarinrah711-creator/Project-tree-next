import test from 'node:test';
import assert from 'node:assert/strict';
import { jalaliDayNumber } from '../../domain/wbs/scheduling.js';
import { activeOverdueRows } from './delayView.js';

const work = (id, end, progress) => ({
  id, kind:'work', text:id, scheduleStart:'1405/01/01', scheduleEnd:end,
  progress, predecessorIds:[], workTasks:[], subtasks:[],
});

test('active overdue list contains only incomplete work whose planned finish has passed', () => {
  const today = jalaliDayNumber('1405/01/11');
  const project = { tasks:[
    work('oldest','1405/01/08',40),
    work('overdue','1405/01/10',90),
    work('due-today','1405/01/11',20),
    work('future','1405/01/12',0),
    work('completed-late','1405/01/09',100),
    { id:'unscheduled', kind:'work', text:'unscheduled', progress:0, predecessorIds:[], workTasks:[], subtasks:[] },
  ] };

  const rows = activeOverdueRows(project, today);
  assert.deepEqual(rows.map(item => item.row.id), ['oldest','overdue']);
  assert.deepEqual(rows.map(item => item.delay), [3,1]);
});

test('criticality and dependencies do not add a non-overdue work to the list', () => {
  const today = jalaliDayNumber('1405/01/11');
  const project = { plannedFinish:'1405/01/20', tasks:[
    { ...work('source','1405/01/11',0) },
    { ...work('dependent','1405/01/12',0), predecessorIds:['source'] },
  ] };
  assert.deepEqual(activeOverdueRows(project, today), []);
});
