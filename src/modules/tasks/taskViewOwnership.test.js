import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { TaskRuntimeModule } from './taskRuntimeModule.js';

test('task actions continue to use the canonical runtime repository',()=>{
  const project={id:'A',tasks:[]}; const repository={list:()=>project.tasks,get:(_p,id)=>project.tasks.find(x=>x.id===id),save(_p,item){project.tasks.push(item);return item;},addSubtask(_p,id,_parent,item){project.tasks[0].subtasks.push(item);return item;},update(_p,id,fn){const i=project.tasks.findIndex(x=>x.id===id);project.tasks[i]=fn(project.tasks[i]);return project.tasks[i];},updateSubtask(_p,_id,sid,fn){const i=project.tasks[0].subtasks.findIndex(x=>x.id===sid);project.tasks[0].subtasks[i]=fn(project.tasks[0].subtasks[i]);return project.tasks[0].subtasks[i];}};
  let n=0; const runtime=new TaskRuntimeModule(repository,{uid:()=>`i${++n}`});
  const task=runtime.create('A','task'); const sub=runtime.createSubtask('A',task.id,'sub'); runtime.toggleStarred('A',task.id); runtime.toggleCompleted('A',task.id,sub.id);
  assert.equal(project.tasks[0].starred,true); assert.equal(project.tasks[0].subtasks[0].done,true);
});

test('task/trash/project-management rendering has one modular owner and no legacy implementation',async()=>{
  const legacy=await readFile(new URL('../runtime/featureComposition.js',import.meta.url),'utf8');
  assert.doesNotMatch(legacy,/function renderTaskBlock\([^)]*\)\s*\{/);
  assert.doesNotMatch(legacy,/function renderProjectTrashItem\(/);
  assert.doesNotMatch(legacy,/function startProjectMgmtDrag\(/);
  assert.match(legacy,/function renderProjectTrashPage\(\)\{ return projectTrashView\?\.render\(\); \}/);
  assert.match(legacy,/function renderManagementPage\(\)\{ return projectManagementView\.render\(\); \}/);
});
