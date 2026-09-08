import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkTaskRepository } from './workTaskRepository.js';

function fixture(){
  const project = { id:'p1', tasks:[{ id:'s1', kind:'stage', subtasks:[{ id:'w1', kind:'work', workTasks:[], subtasks:[] }] }] };
  return {
    project,
    repo:{
      find:id => id === 'p1' ? project : null,
      updateProject(id, updater){
        if(id !== 'p1') return null;
        Object.assign(project, updater(project));
        return project;
      },
    },
  };
}

test('task is persisted under its referenced Work and can be edited', () => {
  const { project, repo } = fixture();
  const tasks = new WorkTaskRepository(repo);
  const created = tasks.save('p1', 'w1', { id:'t1', workId:'wrong', title:'قالب‌بندی', type:'اجرا', weight:1 });
  assert.equal(created.workId, 'w1');
  assert.equal(project.tasks[0].subtasks[0].workTasks[0].workId, 'w1');
  const edited = tasks.update('p1', 'w1', 't1', { ...created, title:'قالب‌بندی جدید', weight:3 });
  assert.equal(edited.title, 'قالب‌بندی جدید');
  assert.equal(tasks.get('p1', 'w1', 't1').weight, 3);
});

test('task cannot be persisted under a Stage', () => {
  const { repo } = fixture();
  const tasks = new WorkTaskRepository(repo);
  assert.equal(tasks.save('p1', 's1', { id:'t1', title:'نامعتبر', type:'اجرا' }), null);
});
