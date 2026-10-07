import test from 'node:test';
import assert from 'node:assert/strict';
import {canDeleteProjectTasks,canMutateSharedProject,canWriteProjectTasks,mergeSharedProjectPayload,projectTasksChanged,projectTasksDeleted} from '../src/app.js';

test('planning and execution write permissions authorize shared task mutations',()=>{
  assert.equal(canWriteProjectTasks({modules:{
    'planning:tree':'none','planning:timeline':'none','planning:costline':'none',
  }}),false);
  assert.equal(canWriteProjectTasks({modules:{'planning:tree':'view'}}),false);
  assert.equal(canWriteProjectTasks({modules:{'planning:tree':'create'}}),true);
  assert.equal(canWriteProjectTasks({modules:{'planning:timeline':'create'}}),true);
  assert.equal(canWriteProjectTasks({modules:{'planning:costline':'create'}}),true);
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

test('invitation module access is the member work permission',()=>{
  const granted={view:true,edit:true,modules:{'planning:tree':'create','reports:reports':'view'}};
  assert.equal(canMutateSharedProject(granted),true);
  assert.equal(canWriteProjectTasks(granted),true);
  assert.equal(canDeleteProjectTasks(granted),false);
  assert.equal(canMutateSharedProject({modules:{'planning:tree':'view'}}),false);
  assert.equal(canMutateSharedProject({modules:{
    'planning:tree':'view','planning:timeline':'view','planning:costline':'view',
  }}),false);
});

test('member task writes merge onto the shared project and do not wipe other records',()=>{
  const current={id:'p1',name:'کشتارگاه',projectMembers:[{mobile:'09120000000'}],tasks:[{id:'owner',text:'مالک'}]};
  const incoming={id:'p1',name:'تغییر عضو',projectMembers:[],tasks:[{id:'member',text:'مهندس'}]};
  const merged=mergeSharedProjectPayload(current,incoming,{edit:true,modules:{'planning:tree':'create'}});
  assert.deepEqual(merged.tasks.map(task=>task.id),['owner','member']);
  assert.equal(merged.projectMembers.length,1);
  const trashed=mergeSharedProjectPayload(merged,{...merged,tasks:merged.tasks.map(task=>task.id==='owner'?{...task,trashed:true}:task)},{edit:true,modules:{'planning:tree':'create'}});
  assert.equal(trashed.tasks.find(task=>task.id==='owner').trashed,undefined);
});
