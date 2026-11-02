import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.window={location:{hash:'',search:''}};
const {contractProgressSteps,renderContractProgress}=await import('./contractProgressView.js');
test('five-stage progress follows creation, completion, approval and revocation',()=>{
 const c={id:'c',status:'draft',isDraft:true,contractApproverContactIds:['reviewer']};
 const states=()=>contractProgressSteps(c).map(s=>s.done);
 assert.deepEqual(states(),[true,false,false,false,false]);
 c.status='final';c.isDraft=false;assert.deepEqual(states(),[true,true,false,false,false]);
 c.approvalStatus='pending';assert.deepEqual(states(),[true,true,false,false,false]);
 c.approvalStatus='approved';assert.deepEqual(states(),[true,true,true,false,false]);
 c.approvalStatus='unapproved';assert.deepEqual(states(),[true,true,false,false,false]);
 c.attachments=[{name:'scan.jpg'}];assert.deepEqual(states(),[true,true,false,false,false]);
});
test('actual task reviewers choose four or five stages, including nested works',()=>{
 const c={id:'c',projectItemId:'w',workTaskId:'t',status:'final',approvalStatus:'approved',contractApproverContactIds:['stale']};
 const task={id:'t',contractApproverContactIds:[]};
 const p={tasks:[{id:'parent',subtasks:[{id:'w',workTasks:[task]}]}]};
 let steps=contractProgressSteps(c,p);assert.deepEqual(steps.map(s=>s.id),['created','completed','signed','finance']);
 task.contractApproverContactIds=['r'];steps=contractProgressSteps(c,p);assert.equal(steps.length,5);assert.equal(steps[2].done,true);
 assert.equal(contractProgressSteps({...c,workTaskId:null,contractApproverContactIds:[]}).length,4);
});
test('render exposes completed and current steps in an RTL ordered list',()=>{
 const make=()=>({children:[],dataset:{},attrs:{},setAttribute(k,v){this.attrs[k]=v;},append(...n){this.children.push(...n);},appendChild(n){this.children.push(n);}});
 const list=renderContractProgress({createElement:make},{id:'c',status:'final',contractApproverContactIds:['r']});
 assert.equal(list.dir,'rtl');assert.equal(list.children.length,5);
 assert.ok(list.children[0].className.includes('has-complete-next'));
 assert.ok(!list.children[1].className.includes('has-complete-next'));
 assert.equal(list.children[2].attrs['aria-current'],'step');
 assert.equal(list.children[2].dataset.step,'approved');
 assert.equal(list.children[4].children[0].textContent,'ارسال به مالی');
});
