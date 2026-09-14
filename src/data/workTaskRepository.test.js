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

test('leaf stage holds tasks without changing its kind and restores manual cost after deletion', async () => {
  const { lineTotal } = await import('../domain/wbs/normalize.js');
  const { rollupEstimate } = await import('../domain/wbs/estimate.js');
  const { collectTodayItems } = await import('../domain/wbs/todayDomain.js');
  const { project, repo } = fixture();
  project.tasks[0].subtasks = [{id:'leaf',kind:'stage',text:'برق کشی',manualCost:900,subtasks:[]}];
  const tasks = new WorkTaskRepository(repo);
  const leaf = () => project.tasks[0].subtasks[0];
  assert.equal(lineTotal(leaf()),900);
  assert.ok(tasks.save('p1','leaf',{id:'t2',title:'خرید کابل',type:'',weight:1,amount:200}));
  assert.equal(leaf().kind,'stage');
  assert.equal(lineTotal(leaf()),200);
  assert.equal(rollupEstimate(project.tasks),200);
  assert.equal(collectTodayItems(project)[0].entity.title,'خرید کابل');
  tasks.update('p1','leaf','t2',{...tasks.get('p1','leaf','t2'),trashed:true});
  assert.equal(lineTotal(leaf()),900);
  assert.equal(leaf().kind,'stage');
});
