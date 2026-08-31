import test from 'node:test';
import assert from 'node:assert/strict';
import { uid, makeProject, makeTask, makeSub } from './projectFactories.js';

test('project/task/subtask factories preserve classic production shapes',()=>{
  assert.equal(uid(()=>0.5),'i'+(0.5).toString(36).slice(2,10));
  const item={id:'i1',text:'work',done:false,starred:false,cost:null,activities:[],subtasks:[],completedAt:null};
  assert.deepEqual(makeTask('work','i1'),item);
  assert.deepEqual(makeSub('work','i1'),item);
  assert.deepEqual(makeProject('Project',8,'p1'),{
    id:'p1',name:'Project',type:'project',tasks:[],contacts:[],activityTemplates:[],contractTemplates:[],
    contracts:[],contractStatusReports:[],completedOpen:false,archived:false,trashed:false,schemaVersion:8,
  });
});
