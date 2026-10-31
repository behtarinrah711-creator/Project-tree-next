import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppDataStore } from '../../data/appDataStore.js';
import { workTaskApi } from './workTaskApi.js';
import { rollupProgress } from './estimate.js';
import { contractApi } from '../contractApi.js';

function installFixture(){
  const store = createAppDataStore({ storage:null });
  store.replaceSnapshot({ schemaVersion:8, activeTab:'p1', viewMode:'simple', starredOrder:[], projects:[{
    id:'p1',
    contacts:[{ id:'c1', name:'مهندس احمدی' },{id:'c2',name:'مهندس محمدی'}],
    activityTemplates:[{id:'a1',name:'آرماتوربندی'},{id:'a2',name:'قالب‌بندی'}],
    contracts:[],
    tasks:[{ id:'s1', kind:'stage', subtasks:[{
      id:'w1', kind:'work', text:'اجرای کابینت', progress:35, done:false, status:'in_progress', subtasks:[],
    }] }],
  }] });
  globalThis.KarhaAppData = store;
  return store;
}

function draft(overrides = {}){
  return {
    title:'نصب یونیت زمینی',
    type:'پیمانکار',
    scheduleStart:'1405/06/01',
    scheduleEnd:'1405/06/03',
    priority:'high',
    assigneeContactId:'c1',
    weight:1,
    ...overrides,
  };
}

test.afterEach(() => { delete globalThis.KarhaAppData; });

test('task API validates references and dates and persists a canonical Work reference', () => {
  installFixture();
  assert.equal(workTaskApi.create('p1', 'w1', draft({ assigneeContactId:'missing' })).code, 'assignee');
  assert.equal(workTaskApi.create('p1', 'w1', draft({ counterpartyContactId:'missing' })).code, 'counterparty');
  assert.equal(workTaskApi.create('p1', 'w1', draft({ activityId:'missing' })).code, 'activity');
  assert.equal(workTaskApi.create('p1', 'w1', draft({ scheduleEnd:'1405/05/30' })).code, 'dates');

  const created = workTaskApi.create('p1', 'w1', draft({ weight:undefined }), () => 100);
  assert.equal(created.ok, false);
  assert.equal(created.code, 'weight');

  const valid = workTaskApi.create('p1', 'w1', draft({ counterpartyContactId:'c1', activityId:'a1', hasLaborPayroll:true }), () => 100);
  assert.equal(valid.ok, true);
  assert.equal(valid.task.workId, 'w1');
  assert.equal(valid.task.assigneeContactId, 'c1');
  assert.equal(valid.task.counterpartyContactId, 'c1');
  assert.equal(valid.task.activityId, 'a1');
  assert.deepEqual(valid.task.activityIds, ['a1']);
  assert.equal(valid.task.hasLaborPayroll, true);
  assert.equal(typeof valid.task.weight, 'number');
});

test('contract toggle creates one system draft and contract edits sync activity back to the task',()=>{
  const store=installFixture();
  const created=workTaskApi.create('p1','w1',draft({counterpartyContactId:'c1',activityId:'a1',hasContract:true}),()=>100);
  assert.equal(created.ok,true);
  let project=store.getSnapshot().projects[0];
  assert.equal(project.contracts.length,1);
  const draftContract=project.contracts[0];
  assert.equal(draftContract.status,'draft');
  assert.equal(draftContract.isDraft,true);
  assert.equal(draftContract.workTaskId,created.task.id);
  assert.equal(draftContract.activityId,'a1');
  assert.equal(draftContract.contractorId,'c1');

  assert.equal(contractApi.save('p1',{...draftContract,activityId:'a2',contractorId:'c2'}).ok,true);
  let synced=workTaskApi.get('p1','w1',created.task.id);
  assert.equal(synced.activityId,'a2');
  assert.equal(synced.counterpartyContactId,'c2');
  assert.equal(workTaskApi.update('p1','w1',created.task.id,{hasContract:false}).code,'contract_locked');

  assert.equal(contractApi.trash('p1',draftContract.id).ok,true);
  synced=workTaskApi.get('p1','w1',created.task.id);
  assert.equal(synced.hasContract,false);
});

test('task weight edits and weighted completion drive Work completion', () => {
  const store = installFixture();
  const first = workTaskApi.create('p1', 'w1', draft({ title:'خرید', weight:2 }), () => 100).task;
  const second = workTaskApi.create('p1', 'w1', draft({ title:'پیمانکار', weight:1 }), () => 200).task;

  const edited = workTaskApi.update('p1', 'w1', second.id, { weight:3, type:'خدمات' }, () => 300);
  assert.equal(edited.ok, true);
  assert.equal(edited.task.weight, 3);
  assert.equal(edited.task.type, 'خدمات');

  workTaskApi.setCompleted('p1', 'w1', second.id, true, () => 400);
  let work = store.getSnapshot().projects[0].tasks[0].subtasks[0];
  assert.equal(work.progress, 60);
  assert.equal(work.done, false);
  assert.equal(rollupProgress(store.getSnapshot().projects[0].tasks), 60);

  workTaskApi.setCompleted('p1', 'w1', first.id, true, () => 500);
  work = store.getSnapshot().projects[0].tasks[0].subtasks[0];
  assert.equal(work.progress, 100);
  assert.equal(work.done, true);
  assert.equal(work.status, 'completed');
  assert.equal(rollupProgress(store.getSnapshot().projects[0].tasks), 100);
});

test('first and last Task transfer Work predecessors without orphaning the network', () => {
  const store = installFixture();
  const project = store.getSnapshot().projects[0];
  const work = project.tasks[0].subtasks[0];
  project.tasks[0].subtasks.unshift({ id:'w0', kind:'work', text:'پیش‌نیاز', subtasks:[] });
  work.predecessorIds = ['w0'];
  const created = workTaskApi.create('p1', 'w1', draft(), () => 100);
  assert.equal(created.ok, true);
  assert.deepEqual(created.task.predecessorIds, ['w0']);
  assert.deepEqual(workTaskApi.list('p1', 'w1').length, 1);
  let savedWork = store.getSnapshot().projects[0].tasks[0].subtasks.find(item => item.id === 'w1');
  assert.deepEqual(savedWork.predecessorIds, []);
  assert.equal(workTaskApi.remove('p1', 'w1', created.task.id, () => 200).ok, true);
  savedWork = store.getSnapshot().projects[0].tasks[0].subtasks.find(item => item.id === 'w1');
  assert.deepEqual(savedWork.predecessorIds, ['w0']);
  assert.equal(savedWork.workTasks.length, 1);
  assert.equal(savedWork.workTasks[0].trashed, true);
  assert.deepEqual(workTaskApi.list('p1', 'w1'), []);
});


test('Task reorder persists active order without reviving deleted Tasks', () => {
  const store = installFixture();
  const first = workTaskApi.create('p1', 'w1', draft({ title:'اول' }), () => 100).task;
  const second = workTaskApi.create('p1', 'w1', draft({ title:'دوم' }), () => 200).task;
  const third = workTaskApi.create('p1', 'w1', draft({ title:'سوم' }), () => 300).task;
  assert.equal(workTaskApi.remove('p1', 'w1', second.id, () => 400).ok, true);
  assert.equal(workTaskApi.reorder('p1', 'w1', [third.id, first.id], () => 500).ok, true);
  assert.deepEqual(workTaskApi.list('p1', 'w1').map(task => task.id), [third.id, first.id]);
  const raw = store.getSnapshot().projects[0].tasks[0].subtasks[0].workTasks;
  assert.equal(raw.find(task => task.id === second.id).trashed, true);
});

test('title-only creation under a leaf stage preserves stage identity through execution', async () => {
  const { lineTotal } = await import('./normalize.js');
  const { collectPlannedWorks } = await import('./costline.js');
  const { collectShoppingItems } = await import('./shoppingDomain.js');
  const { TodayRepository } = await import('../../data/todayRepository.js');
  const store=installFixture();
  store.getSnapshot().projects[0].tasks[0].subtasks[0].kind='stage';
  const created=workTaskApi.create('p1','w1',draft({type:'',assigneeContactId:'',priority:'normal',scheduleStart:'',scheduleEnd:''}),()=>100);
  assert.equal(created.ok,true);
  assert.equal(created.task.type,'');
  const edit=workTaskApi.update('p1','w1',created.task.id,{type:'خرید',amount:1500,scheduleStart:'1405/06/01',scheduleEnd:'1405/06/03'});
  assert.equal(edit.ok,true);
  const project=()=>store.getSnapshot().projects[0];
  const stage=()=>project().tasks[0].subtasks[0];
  assert.equal(stage().kind,'stage');
  const { normalizeItem } = await import('./normalize.js');
  assert.equal(normalizeItem(stage()).workTasks[0].id,created.task.id);
  const { wbsApi } = await import('./wbsApi.js');
  assert.ok(wbsApi.updateItem('p1','w1',{text:'مرحله ویرایش‌شده',progressWeight:2}));
  assert.equal(stage().workTasks[0].id,created.task.id);
  assert.equal(lineTotal(stage()),1500);
  assert.equal(collectPlannedWorks(project().tasks)[0].amount,1500);
  assert.equal(collectShoppingItems(project())[0].entity.id,created.task.id);
  assert.ok(new TodayRepository().update('p1',{kind:'task',workId:'w1',id:created.task.id},task=>({...task,description:'updated'})));
  assert.equal(workTaskApi.get('p1','w1',created.task.id).description,'updated');
  workTaskApi.setCompleted('p1','w1',created.task.id,true);
  assert.equal(rollupProgress(project().tasks),100);
  assert.equal(stage().kind,'stage');
});

test('contract reviewers persist from the task and every assigned reviewer must approve',()=>{
 const store=installFixture();
 assert.equal(workTaskApi.create('p1','w1',draft({hasContract:true,contractApproverContactIds:['missing']})).code,'approver');
 const created=workTaskApi.create('p1','w1',draft({hasContract:true,contractApproverContactIds:['c1','c2','c1']}));
 assert.deepEqual(created.task.contractApproverContactIds,['c1','c2']);
 let c=store.getSnapshot().projects[0].contracts[0];
 assert.deepEqual(c.contractApproverContactIds,['c1','c2']);
 assert.equal(contractApi.save('p1',{...c,status:'final',isDraft:false}).ok,true);
 const actor={id:'a',contactId:'c1'};
 let result=contractApi.review('p1',c.id,'submit',actor,{approverIds:['c1']});
 assert.equal(result.ok,true);
 assert.deepEqual(result.contract.approvalContactIds,['c1','c2']);
 assert.equal(workTaskApi.update('p1','w1',created.task.id,{contractApproverContactIds:['c1']}).code,'contract_locked');
 assert.equal(contractApi.review('p1',c.id,'approve',actor).contract.approvalStatus,'pending');
 assert.equal(contractApi.review('p1',c.id,'approve',{id:'b',contactId:'c2'}).contract.approvalStatus,'approved');
});

test('work task independently persists a template and clones it into its system contract',()=>{
  const store=installFixture();
  const project=store.getSnapshot().projects[0];
  project.contractTemplates=[
    {id:'foundation',title:'قرارداد فونداسیون',items:[{id:'s',text:'فونداسیون',children:[{id:'c',text:'بند'}]}]},
    {id:'wall',title:'قرارداد دیوار برشی',items:[{id:'w',text:'دیوار برشی'}]},
    {id:'deleted',title:'حذف شده',trashed:true},
  ];
  assert.equal(workTaskApi.create('p1','w1',draft({hasContract:true,contractTemplateId:'missing'})).code,'contract_template');
  assert.equal(workTaskApi.create('p1','w1',draft({hasContract:true,contractTemplateId:'deleted'})).code,'contract_template');
  const created=workTaskApi.create('p1','w1',draft({hasContract:true,activityId:'a1',contractTemplateId:'foundation'}));
  assert.equal(created.ok,true);
  assert.equal(created.task.contractTemplateId,'foundation');
  const contract=()=>store.getSnapshot().projects[0].contracts.find(c=>c.workTaskId===created.task.id);
  assert.equal(contract().templateId,'foundation');
  assert.equal(contract().title,'قرارداد فونداسیون');
  assert.equal(contract().items[0].text,'فونداسیون');
  assert.notEqual(contract().items[0].id,'s');
  contract().items[0].children[0].text='ویرایش اختصاصی';
  assert.equal(workTaskApi.update('p1','w1',created.task.id,{activityId:'a2'}).ok,true);
  assert.equal(contract().templateId,'foundation');
  assert.equal(contract().items[0].children[0].text,'ویرایش اختصاصی');
  assert.equal(workTaskApi.update('p1','w1',created.task.id,{contractTemplateId:'wall'}).ok,true);
  assert.equal(contract().activityId,'a2');
  assert.equal(contract().templateId,'wall');
  assert.equal(contract().items[0].text,'دیوار برشی');
  assert.equal(contractApi.save('p1',{...contract(),templateId:'foundation',items:[{text:'نهایی'}]}).ok,true);
  assert.equal(workTaskApi.get('p1','w1',created.task.id).contractTemplateId,'foundation');
  assert.equal(workTaskApi.update('p1','w1',created.task.id,{contractTemplateId:'wall'}).code,'contract_locked');
  assert.equal(contract().items[0].text,'نهایی');
});

test('template edits affect new work contracts while existing drafts keep their snapshots',()=>{
  const store=installFixture();
  const project=store.getSnapshot().projects[0];
  project.contractTemplates=[{id:'tpl',title:'عنوان قدیمی',items:[{text:'بند قدیمی'}]}];
  const first=workTaskApi.create('p1','w1',draft({hasContract:true,contractTemplateId:'tpl'}));
  const firstContract=()=>store.getSnapshot().projects[0].contracts.find(c=>c.workTaskId===first.task.id);
  project.contractTemplates[0]={id:'tpl',title:'عنوان جدید',items:[{text:'بند جدید'}]};
  workTaskApi.update('p1','w1',first.task.id,{title:'ویرایش کار'});
  assert.equal(firstContract().title,'عنوان قدیمی');
  assert.equal(firstContract().items[0].text,'بند قدیمی');
  firstContract().items=[];
  workTaskApi.update('p1','w1',first.task.id,{title:'ویرایش دوباره'});
  assert.deepEqual(firstContract().items,[]);
  const second=workTaskApi.create('p1','w1',draft({hasContract:true,contractTemplateId:'tpl'}));
  const next=store.getSnapshot().projects[0].contracts.find(c=>c.workTaskId===second.task.id);
  assert.equal(next.title,'عنوان جدید');
  assert.equal(next.items[0].text,'بند جدید');
});
