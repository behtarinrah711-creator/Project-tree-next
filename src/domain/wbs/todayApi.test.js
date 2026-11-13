import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppDataStore } from '../../data/appDataStore.js';
import { todayApi } from './todayApi.js';

function install(hasApprover=true){
  const store=createAppDataStore({storage:null});
  store.replaceSnapshot({schemaVersion:8,activeTab:'p1',viewMode:'simple',starredOrder:[],projects:[{id:'p1',contacts:[{id:'a'},{id:'b'}],tasks:[{id:'w1',kind:'work',text:'کار',type:'اجرا',scheduleStart:'1405/06/01',scheduleEnd:'1405/06/20',progress:0,workTasks:[{id:'t1',workId:'w1',title:'تسک',type:'اجرا',priority:'normal',weight:1,approvalContactId:hasApprover?'a':'',scheduleStart:'1405/06/01',scheduleEnd:'1405/06/20'}]}]}]});
  globalThis.KarhaAppData=store; return store;
}
const ref={kind:'task',id:'t1',workId:'w1'};
const entity=store=>store.getSnapshot().projects[0].tasks[0].workTasks[0];
test.afterEach(()=>{delete globalThis.KarhaAppData;});

test('one report per Tehran day is edited in place and a later day creates a new report',()=>{
  const store=install(); const a={id:'a',name:'الف'},b={id:'b',name:'ب'};
  const firstDay=Date.parse('2026-11-09T20:29:58Z');
  const nextDay=Date.parse('2026-11-09T20:30:00Z');
  todayApi.saveReport('p1',ref,'گزارش اول',a,()=>firstDay,30);
  todayApi.saveReport('p1',ref,'گزارش ویرایش‌شده',b,()=>firstDay+1000,40);
  assert.equal(entity(store).executionReports.length,1);
  assert.equal(entity(store).executionReports[0].updatedAt,firstDay+1000);
  assert.equal(entity(store).executionReports[0].updatedBy.id,'b');
  assert.equal(entity(store).executionReports[0].progress,40);
  assert.equal(entity(store).executionHistory.at(-1).type,'report_edited');
  todayApi.saveReport('p1',ref,'گزارش روز بعد',a,()=>nextDay,55);
  assert.equal(entity(store).executionReports.length,2);
  assert.deepEqual(entity(store).executionReports.map(report=>report.reportDay),['1405/08/18','1405/08/19']);
  assert.equal(entity(store).executionReports[0].description,'گزارش ویرایش‌شده');
  assert.equal(entity(store).executionHistory.at(-1).type,'report_created');
});

test('report progress is persisted and capped at one hundred percent',()=>{
  const store=install(); const actor={id:'a',name:'الف'};
  todayApi.saveReport('p1',ref,'گزارش پیشرفت',actor,()=>100,72);
  assert.equal(entity(store).progress,72);
  todayApi.saveReport('p1',ref,'گزارش تکمیل',actor,()=>200,140);
  assert.equal(entity(store).progress,100);
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

test('completion closes immediately when no approver is selected',()=>{
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

test('an assigned user with execution view access cannot start, report, or approve a task',()=>{
  const store=install();
  const previous=globalThis.window;
  const actor={id:'a',contactId:'a',name:'الف'};
  entity(store).assigneeContactId='a';
  const original=structuredClone(entity(store));
  const modules={'execution:today':'view','execution:shopping':'full','planning:tree':'full'};
  globalThis.window={KarhaSaosaWorkspaceAccess:{p1:{role:'invite',permissions:{modules}}}};
  try{
    assert.equal(todayApi.start('p1',ref,actor).code,'forbidden');
    assert.equal(todayApi.saveReport('p1',ref,'گزارش اجرا',actor).code,'forbidden');
    assert.equal(todayApi.approve('p1',ref,actor).code,'forbidden');
    assert.deepEqual(entity(store),original);
    modules['execution:today']='create';
    assert.equal(todayApi.start('p1',ref,actor).ok,true);
  }finally{globalThis.window=previous;}
});

test('start delay is recorded only for due, unstarted work by its assignee with execution write access',()=>{
  const store=install();
  store.getSnapshot().projects[0].tasks[0].workTasks[0].assigneeContactId='a';
  const actor={id:'member',contactId:'a',name:'مسئول'};
  const at=Date.parse('2026-11-09T20:30:00Z');
  const record=(reason='تأمین نشدن مصالح',note='',who=actor,clock=()=>at)=>
    todayApi.recordStartDelay('p1',ref,reason,note,who,clock);
  assert.equal(record('تغییر نقشه','',actor,()=>Date.parse('2026-07-01T09:00:00Z')).code,'not_due_or_started');
  assert.equal(record('سایر').code,'invalid_reason');
  assert.equal(record('تغییر نقشه','',{...actor,contactId:'b'}).code,'forbidden');
  globalThis.window={KarhaSaosaWorkspaceAccess:{p1:{role:'member',permissions:{modules:{'execution:today':'view','reports:reports':'full'}}}}};
  try{
    assert.equal(record().code,'forbidden');
  }finally{
    delete globalThis.window;
  }
  assert.equal(record('سایر','  تأیید نمونه در انتظار است  ').ok,true);
  const delay=entity(store).executionHistory.at(-1);
  assert.equal(delay.type,'start_delayed');
  assert.equal(delay.day,'1405/08/19');
  assert.equal(delay.description,'تأیید نمونه در انتظار است');
  assert.equal(delay.actor.contactId,'a');
  assert.ok(!entity(store).actualStart);
  assert.equal(todayApi.start('p1',ref,actor,()=>at+1000).ok,true);
  assert.equal(record().code,'not_due_or_started');
  assert.ok(entity(store).executionHistory.some(entry=>entry.id===delay.id));
});

test('saving a report at 100 percent records its photos and submits once for the assigned reviewer',()=>{
  const store=install();
  entity(store).assigneeContactId='a';
  const actor={id:'member',contactId:'a',name:'مسئول'};
  const clock=()=>Date.parse('2026-11-10T10:00:00Z');
  const files=[{id:'photo',category:'reports',recordId:'t1'}];
  const save=progress=>todayApi.saveReport('p1',ref,'گزارش اجرا',actor,clock,progress,{files,completeAt100:true});
  assert.equal(save(90).entity.workflowStatus,'in_progress');
  assert.equal(save(100).entity.completionState,'pending_approval');
  assert.equal(entity(store).progress,100);
  assert.equal(entity(store).executionReports.length,1);
  assert.deepEqual(entity(store).executionReports[0].photos,files);
  assert.equal(entity(store).executionHistory.at(-1).type,'sent_for_approval');
  assert.equal(save(100).code,'locked');
  assert.equal(entity(store).executionHistory.filter(event=>event.type==='sent_for_approval').length,1);
});

test('saving at 100 percent completes work directly when there is no reviewer',()=>{
  const store=install(false);
  entity(store).assigneeContactId='a';
  const actor={id:'member',contactId:'a'};
  const result=todayApi.saveReport('p1',ref,'پایان اجرا',actor,()=>500,100,{completeAt100:true});
  assert.equal(result.entity.completionState,'approved');
  assert.equal(entity(store).executionReports.length,1);
  assert.equal(entity(store).executionHistory.at(-1).type,'completed_without_approval');
});

test('daily status requires a reason when inactive and records same-day changes independently of reports',()=>{
  const store=install();
  const snapshot=store.getSnapshot();
  snapshot.projects[0].tasks[0].workTasks[0].assigneeContactId='a';
  store.replaceSnapshot(snapshot);
  const actor={id:'a',contactId:'a'};
  const now=()=>Date.parse('2026-11-09T20:29:58Z');
  assert.equal(todayApi.setDailyStatus('p1',ref,'inactive','',null,actor,now).ok,false);
  assert.equal(todayApi.setDailyStatus('p1',ref,'inactive','funding','',actor,now).ok,true);
  assert.equal(todayApi.setDailyStatus('p1',ref,'active',null,null,actor,now).ok,true);
  assert.deepEqual(entity(store).executionHistory.map(({day,status,reasonId})=>[day,status,reasonId]),[
    ['1405/08/18','inactive','funding'],['1405/08/18','active',undefined],
  ]);
  assert.equal((entity(store).executionReports||[]).length,0);
});
