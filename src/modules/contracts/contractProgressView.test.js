import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.window={location:{hash:'',search:''}};
const {contractProgressSteps,renderContractProgress,renderContractProgressCircle}=await import('./contractProgressView.js');
test('six-stage progress follows creation, completion, approval and revocation',()=>{
 const c={id:'c',status:'draft',isDraft:true,contractApproverContactIds:['reviewer']};
 const states=()=>contractProgressSteps(c).map(s=>s.done);
 assert.deepEqual(states(),[true,false,false,false,false,false]);
 c.status='final';c.isDraft=false;assert.deepEqual(states(),[true,true,false,false,false,false]);
 c.approvalStatus='pending';assert.deepEqual(states(),[true,true,false,false,false,false]);
 c.approvalStatus='approved';assert.deepEqual(states(),[true,true,true,false,false,false]);
 c.approvalStatus='unapproved';assert.deepEqual(states(),[true,true,false,false,false,false]);
 c.attachments=[{name:'scan.jpg'}];assert.deepEqual(states(),[true,true,false,false,false,false]);
});
test('actual task reviewers choose five or six stages, including nested works',()=>{
 const c={id:'c',projectItemId:'w',workTaskId:'t',status:'final',approvalStatus:'approved',contractApproverContactIds:['stale']};
 const task={id:'t',contractApproverContactIds:[]};
 const p={tasks:[{id:'parent',subtasks:[{id:'w',workTasks:[task]}]}]};
 let steps=contractProgressSteps(c,p);assert.deepEqual(steps.map(s=>s.id),['created','completed','signed','finance','finance-approved']);
 task.contractApproverContactIds=['r'];steps=contractProgressSteps(c,p);assert.equal(steps.length,6);assert.equal(steps[2].done,true);
 assert.equal(contractProgressSteps({...c,workTaskId:null,contractApproverContactIds:[]}).length,5);
});
test('render exposes completed and current steps in an RTL ordered list',()=>{
 const make=()=>({children:[],dataset:{},attrs:{},setAttribute(k,v){this.attrs[k]=v;},append(...n){this.children.push(...n);},appendChild(n){this.children.push(n);}});
 const list=renderContractProgress({createElement:make},{id:'c',status:'final',contractApproverContactIds:['r']});
 assert.equal(list.dir,'rtl');assert.equal(list.children.length,6);
 assert.ok(list.children[0].className.includes('has-complete-next'));
 assert.ok(!list.children[1].className.includes('has-complete-next'));
 assert.equal(list.children[2].attrs['aria-current'],'step');
 assert.equal(list.children[2].dataset.step,'approved');
 assert.equal(list.children[4].children[0].textContent,'ارسال به مالی');
});
test('financial approval completes the last milestone and rejection returns to creation only',()=>{
 const c={id:'c',status:'final',approvalStatus:'approved',contractApproverContactIds:['r'],signedAt:1,signedFiles:[{id:'f'}],sentToAccountingAt:2,accountingStatus:'accepted',accountingPackage:{}};
 assert.deepEqual(contractProgressSteps(c).map(step=>step.done),[true,true,true,true,true,true]);
 assert.equal(contractProgressSteps({...c,accountingStatus:'sent'}).at(-1).done,false);
 assert.deepEqual(contractProgressSteps({...c,status:'draft',isDraft:true,approvalStatus:null,signedAt:null,signedFiles:[],sentToAccountingAt:null,accountingStatus:'rejected'}).map(step=>step.done),[true,false,false,false,false,false]);
});

test('rejected contracts use the red ring until completion is declared again',()=>{
 const doc={createElement:()=>({className:'',setAttribute(){},appendChild(){}})};
 const draft={id:'c',status:'draft',isDraft:true};
 const ring=record=>renderContractProgressCircle(doc,record).className;
 assert.doesNotMatch(ring(draft),/rejected/);
 assert.match(ring({...draft,approvalStatus:'unapproved',approvalHistory:[{action:'reject'}]}),/rejected/);
 assert.match(ring({...draft,accountingStatus:'rejected'}),/rejected/);
 assert.doesNotMatch(ring({...draft,status:'final',isDraft:false,accountingStatus:'rejected'}),/rejected/);
});


test('only the active document stage opens an action and summary controls are absent',async()=>{
 const {renderContractWorkflowPanel}=await import('./contractProgressView.js');
 const make=tag=>({tag,className:'',attrs:{},dataset:{},children:[],setAttribute(k,v){this.attrs[k]=v;},append(...nodes){this.children.push(...nodes);},appendChild(node){this.children.push(node);}});
 const record={id:'s',statementType:'interim',status:'final',approvalStatus:'pending',contractApproverContactIds:['r']};
 let selected;
 const heading=make('div');heading.append(make('div'));
 const panel=renderContractWorkflowPanel({createElement:make},record,{id:'p'},{expanded:true,heading,onOpen:(event,step)=>{selected=step.id;}});
 assert.equal(panel.children.length,1);
 const body=panel.children[0];
 assert.equal(body.hidden,false);
 const stages=body.children[0].children;
 for(const item of stages){
   const button=item.children[0];
   assert.equal(button.disabled,item.dataset.step!=='approved');
   assert.equal(typeof button.onclick,item.dataset.step==='approved'?'function':'undefined');
 }
 stages.find(item=>item.dataset.step==='approved').children[0].onclick({stopPropagation(){}});
 assert.equal(selected,'approved');
 heading.onclick();assert.equal(body.hidden,true);
 heading.onclick();assert.equal(body.hidden,false);
 const returned=renderContractWorkflowPanel({createElement:make},{...record,accountingStatus:'rejected',financeRejection:{reason:'نسخه ناقص'}},{id:'p'},{onOpen(){}});
 assert.match(returned.children[0].children[1].textContent,/نسخه ناقص/);
 assert.equal(returned.children[0].children.length,2);
});

test('advance opens current, completed and rejected stages and disables future stages',()=>{
 const make=()=>({children:[],dataset:{},setAttribute(){},append(...nodes){this.children.push(...nodes);},appendChild(node){this.children.push(node);}});
 const record={id:'a',statementType:'advance',status:'draft',approvalContactIds:['reviewer']};
 const render=patch=>renderContractProgress({createElement:make},{...record,...patch},null,()=>{}).children;
 const enabled=items=>items.filter(item=>!item.children[0].disabled).map(item=>item.dataset.step);
 assert.deepEqual(enabled(render({})),['created','advance-submit']);
 assert.deepEqual(enabled(render({accountingStatus:'rejected'})),['created','advance-submit','finance-approved']);
 assert.deepEqual(enabled(render({status:'final',approvalStatus:'pending',approvalHistory:[{action:'submit'}]})),['created','advance-submit','approved']);
});
