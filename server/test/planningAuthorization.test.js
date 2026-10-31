import test from 'node:test';
import assert from 'node:assert/strict';
import {stampContractCreation,canDeleteProjectTasks,canMutateSharedProject,canWriteProjectCostline,canWriteProjectTasks,mergeAssignedExecutionPayload,mergeSharedProjectPayload,projectFundingChanged,projectPayloadChanged,projectTasksChanged,projectTasksDeleted} from '../src/app.js';

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

test('funding writes require cost estimate edit access',()=>{
  assert.equal(canWriteProjectCostline({modules:{'planning:tree':'full','planning:costline':'view'}}),false);
  assert.equal(canWriteProjectCostline({modules:{'planning:costline':'create'}}),true);
  assert.equal(projectFundingChanged({fundingReceipts:[]},{fundingReceipts:[{id:'r1',amount:10}]}),true);
});

test('task mutation classifier distinguishes edits from removals',()=>{
  const previous={tasks:[{id:'stage',text:'A',subtasks:[{id:'work',text:'B'}]}]};
  const edited={tasks:[{id:'stage',text:'AA',subtasks:[{id:'work',text:'B'}]}]};
  const deleted={tasks:[{id:'stage',text:'A',subtasks:[{id:'work',text:'B',trashed:true}]}]};
  assert.equal(projectTasksChanged(previous,edited),true);
  assert.equal(projectTasksDeleted(previous,edited),false);
  assert.equal(projectTasksDeleted(previous,deleted),true);
});

test('unchanged read-only projects do not turn an account-wide save into a write',()=>{
  const remote={id:'view-only',name:'پروژه فقط مشاهده',tasks:[{id:'stage',text:'A'}]};
  assert.equal(projectPayloadChanged(remote,structuredClone(remote)),false);
  assert.equal(projectPayloadChanged(remote,{...remote,tasks:[...remote.tasks,{id:'new',text:'B'}]}),true);
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

test('cost estimate members save shared receipts without gaining unrelated project fields',()=>{
  const current={id:'p1',name:'مالک',fundingReceipts:[],fundingAllocations:[],projectMembers:[{mobile:'09120000000'}],tasks:[]};
  const incoming={...current,name:'عضو',projectMembers:[],fundingReceipts:[{id:'r1',amount:20}],fundingAllocations:[{taskId:'w1',amount:20}],fundingLedgerVersion:1};
  const merged=mergeSharedProjectPayload(current,incoming,{modules:{'planning:costline':'create'}});
  assert.equal(merged.name,'مالک');
  assert.equal(merged.projectMembers.length,1);
  assert.equal(merged.fundingReceipts[0].amount,20);
  assert.equal(merged.fundingAllocations[0].amount,20);
});

test('assigned member can update only execution fields without general module write access',()=>{
  const current={id:'p1',name:'پروژه',contacts:[{id:'c1',phones:['09120000000']}],tasks:[{id:'w1',text:'کار',workTasks:[{id:'t1',title:'آرماتوربندی',assigneeContactId:'c1',executionHistory:[]}]}]};
  const incoming=structuredClone(current);
  incoming.tasks[0].workTasks[0].actualStart='1405/07/16';
  incoming.tasks[0].workTasks[0].executionHistory=[{type:'started'}];
  const allowed=mergeAssignedExecutionPayload(current,incoming,'09120000000');
  assert.equal(allowed.ok,true);
  assert.equal(allowed.project.tasks[0].workTasks[0].actualStart,'1405/07/16');
  incoming.tasks[0].workTasks[0].title='تغییر غیرمجاز';
  assert.equal(mergeAssignedExecutionPayload(current,incoming,'09120000000').ok,false);
});

test('assigned member report survives harmless local project metadata differences',()=>{
  const current={id:'p1',name:'نسخه سرور',contacts:[{id:'c1',phones:['09120000000']}],projectMembers:[{mobile:'09120000000',contactId:'c1',status:'active'}],tasks:[{id:'w1',text:'کار',workTasks:[{id:'t1',title:'آرماتوربندی',assigneeContactId:'c1',executionReports:[],executionHistory:[]}]}]};
  const incoming=structuredClone(current);
  incoming.name='نسخه محلی قدیمی';
  incoming.projectMembers=[...incoming.projectMembers,{mobile:'09000000000',status:'invited'}];
  incoming.tasks[0].workTasks[0].executionReports=[{id:'r1',description:'گزارش مسئول',createdBy:{id:'account-1',name:'مهندس احمدی'},createdAt:10}];
  incoming.tasks[0].workTasks[0].executionHistory=[{type:'report_created',at:10}];
  const result=mergeAssignedExecutionPayload(current,incoming,'09120000000');
  assert.equal(result.ok,true);
  assert.equal(result.project.name,'نسخه سرور');
  assert.equal(result.project.projectMembers.length,1);
  assert.equal(result.project.tasks[0].workTasks[0].executionReports[0].description,'گزارش مسئول');
});

test('member planning writes retain linked contract drafts and their completion across saves',()=>{
  const permissions={edit:true,modules:{'planning:tree':'create'}};
  const tasks=[{id:'work',workTasks:[{id:'task',hasContract:true,contractTemplateId:'template'}]}];
  const draft={id:'rc_task_task',projectItemId:'work',workTaskId:'task',templateId:'template',title:'قرارداد پیمانکاری',status:'draft',isDraft:true,items:[{text:'بند'}],updatedAt:1};
  const saved=mergeSharedProjectPayload({tasks:[],contracts:[{id:'owner'}]},{tasks,contracts:[draft]},permissions);
  assert.deepEqual(saved.contracts.map(c=>c.id),['owner','rc_task_task']);
  assert.equal(saved.contracts[1].items[0].text,'بند');
  const completed=mergeSharedProjectPayload(saved,{tasks,contracts:[{...draft,status:'final',isDraft:false,amount:100,updatedAt:2}]},permissions);
  assert.equal(completed.contracts[1].amount,100);
  assert.equal(completed.contracts[1].isDraft,false);
  assert.equal(mergeSharedProjectPayload(completed,{tasks,contracts:[]},permissions).contracts.length,2);
});

test('contract member merge rejects unrelated writes, deletion and forged approvals',()=>{
  const tasks=[{id:'w',workTasks:[{id:'t',hasContract:true}]}];
  const current={tasks,contracts:[{id:'locked',approvalStatus:'approved',amount:50},{id:'draft',projectItemId:'w',workTaskId:'t',status:'draft',contractNo:'server',updatedAt:1}]};
  const incoming={tasks,contracts:[{id:'unrelated'},{id:'locked',amount:0},
    {id:'draft',projectItemId:'w',workTaskId:'t',approvalStatus:'approved',approvedContactIds:['forged'],contractNo:'forged',updatedAt:2}]};
  const result=mergeSharedProjectPayload(current,incoming,{modules:{'planning:tree':'create'}});
  assert.equal(result.contracts.length,2);
  assert.equal(result.contracts[0].amount,50);
  assert.equal(result.contracts[1].approvalStatus,undefined);
  assert.equal(result.contracts[1].approvedContactIds,undefined);
  assert.equal(result.contracts[1].contractNo,'server');
  const deleted=mergeSharedProjectPayload(current,{tasks,contracts:[{...current.contracts[1],trashed:true}]},{modules:{contracts:'create'}});
  assert.equal(deleted.contracts[1].trashed,undefined);
  assert.deepEqual(mergeSharedProjectPayload(current,incoming,{modules:{'planning:tree':'view'}}).contracts,current.contracts);
  assert.equal(mergeSharedProjectPayload({tasks:[],contracts:[]},{tasks:[],contracts:[{id:'manual',status:'draft'}]},{modules:{contracts:'create'}}).contracts[0].id,'manual');
});


test('contract creation stores the authenticated creator once and preserves it on completion',()=>{
  const project={contacts:[{id:'ahmadi',firstName:'سیامند',lastName:'احمدی',phones:['09120000000']}],contracts:[{id:'draft',status:'draft',createdAt:1,createdBy:{name:'جعلی'}}]};
  stampContractCreation(project,null,'account-ahmadi','09120000000',100);
  assert.equal(project.contracts[0].createdBy.name,'سیامند احمدی');
  assert.equal(project.contracts[0].creationEvent.actor.id,'account-ahmadi');
  assert.equal(project.contracts[0].creationEvent.at,100);
  const incoming=structuredClone(project);
  incoming.contracts[0].createdBy={name:'ویرایشگر'};
  incoming.contracts[0].creationEvent={action:'create',at:200,actor:{name:'ویرایشگر'}};
  incoming.contracts[0].status='final';
  stampContractCreation(incoming,project,'other','',200);
  assert.deepEqual(incoming.contracts[0].creationEvent,project.contracts[0].creationEvent);
  assert.equal(incoming.contracts[0].createdAt,100);
  assert.equal(incoming.contracts[0].createdBy.name,'سیامند احمدی');
  const legacy={contracts:[{id:'old',createdAt:50}]};
  const updated={contracts:[{id:'old',createdBy:{name:'ساختگی'}}]};
  stampContractCreation(updated,legacy,'other','',300);
  assert.equal(updated.contracts[0].creationEvent,undefined);
  assert.equal(updated.contracts[0].createdBy,undefined);
});
