import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppDataStore } from '../../data/appDataStore.js';
import { todayApi } from './todayApi.js';

function install(requiresManagementApproval=true){
  const store=createAppDataStore({storage:null});
  store.replaceSnapshot({schemaVersion:8,activeTab:'p1',viewMode:'simple',starredOrder:[],projects:[{id:'p1',contacts:[{id:'a'},{id:'b'}],tasks:[{id:'w1',kind:'work',text:'کار',type:'اجرا',scheduleStart:'1405/06/01',scheduleEnd:'1405/06/20',progress:0,workTasks:[{id:'t1',workId:'w1',title:'تسک',type:'اجرا',priority:'normal',weight:1,requiresManagementApproval,approvalContactId:requiresManagementApproval?'a':'',scheduleStart:'1405/06/01',scheduleEnd:'1405/06/20'}]}]}]});
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
  todayApi.markComplete('p1',ref,actor,()=>50);
  assert.equal(entity(store).completionState,'incomplete');
  todayApi.start('p1',ref,actor,()=>80);
  todayApi.markComplete('p1',ref,actor,()=>100);
  assert.equal(entity(store).completionState,'pending_approval');
  assert.equal(entity(store).completed,false);
  assert.equal(todayApi.reject('p1',ref,'کوتاه',actor,()=>200).ok,true);
  assert.equal(entity(store).executionComments.at(-1).type,'approval_rejected');
  assert.equal(entity(store).executionHistory.at(-1).type,'returned_to_active');
  todayApi.start('p1',ref,actor,()=>280);
  todayApi.markComplete('p1',ref,actor,()=>300);
  todayApi.approve('p1',ref,actor,()=>400);
  assert.equal(entity(store).completionState,'approved');
  assert.equal(entity(store).completed,true);
  assert.equal(entity(store).completionSubmittedAt,300);
  assert.equal(entity(store).completedAt,300);
  assert.equal(entity(store).actualFinishDay,300);
  assert.equal(entity(store).approvedAt,400);
  assert.equal(store.getSnapshot().projects[0].tasks[0].progress,100);
});

test('completion closes immediately when management approval is not required',()=>{
  const store=install(false),actor={id:'a',name:'الف'};
  todayApi.start('p1',ref,actor,()=>80);
  todayApi.markComplete('p1',ref,actor,()=>100);
  assert.equal(entity(store).completionState,'approved');
  assert.equal(entity(store).completed,true);
  assert.equal(entity(store).executionHistory.at(-1).type,'completed_without_approval');
});

test('cancel start clears the start and records history without touching pending approval',()=>{
  const store=install(),actor={id:'a',name:'الف'};
  assert.equal(todayApi.cancelStart('p1',ref,actor,()=>10).code,'not_started');
  todayApi.start('p1',ref,actor,()=>20);
  assert.equal(todayApi.cancelStart('p1',ref,actor,()=>30).ok,true);
  assert.equal(entity(store).actualStart,null);
  assert.equal(entity(store).executionHistory.at(-1).type,'start_cancelled');
  todayApi.start('p1',ref,actor,()=>40);
  todayApi.markComplete('p1',ref,actor,()=>50);
  assert.equal(todayApi.cancelStart('p1',ref,actor,()=>60).code,'locked');
  assert.ok(entity(store).actualStart);
});

test('responsible person can withdraw a pending check back to the previous tab',()=>{
  const store=install(),owner={id:'a',name:'الف'},other={id:'b',name:'ب'};
  todayApi.start('p1',ref,owner,()=>20);
  todayApi.markComplete('p1',ref,owner,()=>30);
  assert.equal(entity(store).completionSubmittedBy.id,'a');
  assert.equal(todayApi.withdrawCompletion('p1',ref,other,()=>40).code,'not_submitter');
  assert.equal(entity(store).completionState,'pending_approval');
  assert.equal(todayApi.withdrawCompletion('p1',ref,owner,()=>50).ok,true);
  assert.equal(entity(store).completionState,'incomplete');
  assert.equal(entity(store).returnedToTodayOn,null);
  assert.ok(entity(store).actualStart);
  assert.equal(entity(store).executionHistory.at(-2).type,'completion_withdrawn');
  assert.equal(entity(store).executionHistory.at(-1).type,'returned_to_previous');
});

test('approved task reaches 100 percent and cancellation returns it to its active list',()=>{
  const store=install(),actor={id:'a',name:'الف'};
  todayApi.start('p1',ref,actor,()=>20);
  todayApi.markComplete('p1',ref,actor,()=>30);
  todayApi.approve('p1',ref,actor,()=>40);
  assert.equal(entity(store).progress,100);
  assert.equal(entity(store).completionState,'approved');
  assert.equal(todayApi.cancelApproval('p1',ref,actor,()=>50).ok,true);
  assert.equal(entity(store).progress,0);
  assert.equal(entity(store).completionState,'incomplete');
  assert.equal(entity(store).completed,false);
  assert.equal(entity(store).approvedAt,null);
  assert.equal(entity(store).executionHistory.at(-2).type,'approval_cancelled');
  assert.equal(entity(store).executionHistory.at(-1).type,'returned_to_active');
});
