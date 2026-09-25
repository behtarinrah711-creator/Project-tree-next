import test from 'node:test';
import assert from 'node:assert/strict';
import {canDeleteProjectTasks,canWriteProjectTasks,projectTasksChanged,projectTasksDeleted} from '../src/app.js';

test('planning and execution write permissions authorize shared task mutations',()=>{
  assert.equal(canWriteProjectTasks({modules:{'planning:tree':'view'}}),false);
  assert.equal(canWriteProjectTasks({modules:{'planning:timeline':'create'}}),true);
  assert.equal(canWriteProjectTasks({modules:{'execution:today':'create'}}),true);
});

test('task deletion requires full planning access',()=>{
  assert.equal(canDeleteProjectTasks({modules:{'planning:tree':'create','planning:timeline':'view'}}),false);
  assert.equal(canDeleteProjectTasks({modules:{'planning:timeline':'full'}}),true);
});

test('task mutation classifier distinguishes edits from removals',()=>{
  const previous={tasks:[{id:'stage',text:'A',subtasks:[{id:'work',text:'B'}]}]};
  const edited={tasks:[{id:'stage',text:'AA',subtasks:[{id:'work',text:'B'}]}]};
  const deleted={tasks:[{id:'stage',text:'A',subtasks:[{id:'work',text:'B',trashed:true}]}]};
  assert.equal(projectTasksChanged(previous,edited),true);
  assert.equal(projectTasksDeleted(previous,edited),false);
  assert.equal(projectTasksDeleted(previous,deleted),true);
});
