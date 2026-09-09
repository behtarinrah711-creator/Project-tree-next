import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppDataStore } from '../../data/appDataStore.js';
import { todayApi } from './todayApi.js';

function install(){
  const store=createAppDataStore({storage:null});
  store.replaceSnapshot({schemaVersion:8,activeTab:'p1',viewMode:'simple',starredOrder:[],projects:[{id:'p1',contacts:[{id:'a'},{id:'b'}],tasks:[{id:'w1',kind:'work',text:'کار',type:'اجرا',scheduleStart:'1405/06/01',scheduleEnd:'1405/06/20',progress:0,workTasks:[{id:'t1',workId:'w1',title:'تسک',type:'اجرا',priority:'normal',weight:1,scheduleStart:'1405/06/01',scheduleEnd:'1405/06/20'}]}]}]});
  globalThis.KarhaAppData=store; return store;
}
const ref={kind:'task',id:'t1',workId:'w1'};
const entity=store=>store.getSnapshot().projects[0].tasks[0].workTasks[0];
test.afterEach(()=>{delete globalThis.KarhaAppData;});

test('same author edits the latest report while another author creates the next report',()=>{
  const store=install(); const a={id:'a',name:'الف'},b={id:'b',name:'ب'};
  todayApi.saveReport('p1',ref,'گزارش اول',a,()=>100);
  todayApi.saveReport('p1',ref,'گزارش ویرایش‌شده',a,()=>200);
  assert.equal(entity(store).executionReports.length,1);
  assert.equal(entity(store).executionReports[0].updatedAt,200);
  assert.equal(entity(store).executionHistory.at(-1).type,'report_edited');
  todayApi.saveReport('p1',ref,'گزارش نفر دوم',b,()=>300);
  assert.equal(entity(store).executionReports.length,2);
});

test('completion waits for approval; rejection is typed and returns actionable',()=>{
  const store=install(),actor={id:'a',name:'الف'};
  todayApi.markComplete('p1',ref,actor,()=>100);
  assert.equal(entity(store).completionState,'pending_approval');
  assert.equal(entity(store).completed,false);
  assert.equal(todayApi.reject('p1',ref,'کوتاه',actor,()=>200).ok,true);
  assert.equal(entity(store).executionComments.at(-1).type,'approval_rejected');
  assert.equal(entity(store).executionHistory.at(-1).type,'returned_to_active');
  todayApi.markComplete('p1',ref,actor,()=>300);
  todayApi.approve('p1',ref,actor,()=>400);
  assert.equal(entity(store).completionState,'approved');
  assert.equal(entity(store).completed,true);
  assert.equal(store.getSnapshot().projects[0].tasks[0].progress,100);
});
