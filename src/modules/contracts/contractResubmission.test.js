import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.window={location:{hash:'',search:''}};
const {contractsModule}=await import('./contractsModule.js');
const {projectRepository}=await import('../../data/projectRepository.js');
const {contractApi}=await import('../../domain/contractApi.js');
const {transitionContractApproval,canSubmitContract,contractRevisionContent}=await import('../../domain/contractApproval.js');
const {makeRealContractDraft}=await import('./realContractDomain.js');

test('unchanged reopen, metadata updates and row IDs cannot unlock resubmission',()=>{
 const state={status:'final',title:'قرارداد',contractDate:'1405/08/11',amount:100,retentionBasis:'تحویل موقت',items:[{text:'بند',children:[]}]};
 const c={...state,approvalStatus:'unapproved',revisionBaseline:contractRevisionContent(state)};
 assert.equal(canSubmitContract(makeRealContractDraft(c)),false);
 assert.equal(canSubmitContract({...c,updatedAt:999,isDraft:false,approvedContactIds:['forged']}),false);
 assert.equal(canSubmitContract({...c,items:[{id:'new',number:'1',text:'بند',included:true,children:[]}]}),false);
 assert.equal(canSubmitContract({...c,items:[{text:'بند اصلاح‌شده'}]}),true);
 assert.equal(canSubmitContract({...c,title:'قرارداد اصلاح‌شده'}),true);
});

test('contract list removes the return action, shows a red reason and gates the resubmit button',()=>{
 const previous=[globalThis.document,globalThis.window,projectRepository.getActiveProject,contractApi.listPage];
 const make=()=>({children:[],dataset:{},setAttribute(){},addEventListener(){},append(...nodes){for(const node of nodes){node.parent=this;this.children.push(node);}},appendChild(node){this.append(node);},replaceChildren(...nodes){this.children=[];this.append(...nodes);},remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);}});
 const body=make();
 globalThis.document={createElement:make,getElementById:id=>id==='contractsPageBody'?body:null};
 globalThis.window={location:{hash:'',search:''},firebase:{auth:()=>({currentUser:{uid:'reviewer',phoneNumber:'123'}})}};
 const p={id:'resubmit-ui',contacts:[{id:'reviewer',phone:'123'}]};
 projectRepository.getActiveProject=()=>p;
 let c={id:'c',status:'final',title:'قرارداد',approvalStatus:'pending',approvalContactIds:['reviewer'],approvedContactIds:[]};
 contractApi.listPage=()=>({items:[c],cursor:null});
 const all=node=>[node,...node.children.flatMap(all)];
 const render=()=>{body.children=[];contractsModule.render(p.id);return all(body);};
 try{
  assert.ok(!render().some(n=>n.textContent==='برگشت برای اصلاح'));
  c=transitionContractApproval(c,'approve',{id:'r',contactId:'reviewer'}).contract;
  c=transitionContractApproval(c,'revoke',{id:'r',contactId:'reviewer'},{reason:'مبلغ باید اصلاح شود'}).contract;
  let nodes=render();
  assert.ok(!nodes.some(n=>['ارسال برای تأیید','ارسال مجدد برای تأیید'].includes(n.textContent)));
  assert.ok(nodes.some(n=>n.className==='contract-rejection-reason' && n.textContent.includes('مبلغ باید اصلاح شود')));
  c={...c,title:'قرارداد اصلاح‌شده'};nodes=render();
  assert.ok(nodes.some(n=>n.textContent==='ارسال مجدد برای تأیید'));
  assert.ok(!nodes.some(n=>n.textContent==='ارسال برای تأیید'));
 }finally{[globalThis.document,globalThis.window,projectRepository.getActiveProject,contractApi.listPage]=previous;}
});
