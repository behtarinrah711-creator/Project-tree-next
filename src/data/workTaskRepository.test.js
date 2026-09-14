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

test('task can be persisted alongside child stages without changing the parent kind', () => {
  const { repo } = fixture();
  const tasks = new WorkTaskRepository(repo);
  assert.ok(tasks.save('p1', 's1', { id:'t1', title:'کار جدید', type:'اجرا' }));
  assert.equal(tasks.work('p1','s1').kind,'stage');
  assert.equal(tasks.work('p1','s1').subtasks[0].id,'w1');
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

test('mixed children keep task costs, weighted progress, schedule and list visibility', async () => {
  const {rollupEstimate,rollupProgress}=await import('../domain/wbs/estimate.js');
  const {actualProgress,scheduleRangeOf,buildEffectiveNetwork}=await import('../domain/wbs/scheduling.js');
  const {collectTodayItems}=await import('../domain/wbs/todayDomain.js');
  const {collectShoppingItems}=await import('../domain/wbs/shoppingDomain.js');
  const {project,repo}=fixture();
  project.tasks[0]={id:'s1',kind:'stage',text:'والد',manualCost:900,subtasks:[{id:'s2',kind:'stage',text:'فرزند',progressWeight:1,subtasks:[],workTasks:[{id:'child-task',workId:'s2',title:'فرزند',weight:1,amount:300,progress:100,completed:true,scheduleStart:'1405/01/01',scheduleEnd:'1405/01/02'}]}]};
  const tasks=new WorkTaskRepository(repo);
  tasks.save('p1','s1',{id:'direct',title:'خرید',type:'خرید',weight:3,amount:200,progress:0,scheduleStart:'1405/01/03',scheduleEnd:'1405/01/05'});
  assert.equal(rollupEstimate(project.tasks),500);
  assert.equal(rollupProgress(project.tasks),25);
  assert.equal(actualProgress(project.tasks[0]),25);
  assert.equal(scheduleRangeOf(project.tasks[0]).endDate,'1405/01/05');
  assert.equal(scheduleRangeOf(project.tasks[0]).startDate,'1405/01/01');
  assert.deepEqual(collectTodayItems(project).map(row=>row.id),['direct']);
  assert.deepEqual(collectShoppingItems(project).map(row=>row.id),['direct']);
  assert.equal(buildEffectiveNetwork(project.tasks).activities.length,2);
  assert.equal(project.tasks[0].kind,'stage');
});
