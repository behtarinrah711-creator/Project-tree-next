import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.window={location:{hash:'',search:''}};
const {contractsModule}=await import('./contractsModule.js');
const {projectRepository}=await import('../../data/projectRepository.js');
const {contractApi}=await import('../../domain/contractApi.js');
const {transitionContractApproval,canSubmitContract,contractRevisionContent}=await import('../../domain/contractApproval.js');
const {makeRealContractDraft}=await import('./realContractDomain.js');

test('completed returned contracts can start a new review without editing their content',()=>{
 const state={status:'final',title:'قرارداد',contractDate:'1405/08/11',amount:100,retentionBasis:'تحویل موقت',items:[{text:'بند',children:[]}]};
 const c={...state,approvalStatus:'unapproved',revisionBaseline:contractRevisionContent(state)};
 assert.equal(canSubmitContract(makeRealContractDraft(c)),true);
 assert.equal(canSubmitContract({...c,updatedAt:999,isDraft:false,approvedContactIds:['forged']}),true);
 assert.equal(canSubmitContract({...c,items:[{id:'new',number:'1',text:'بند',included:true,children:[]}]}),true);
 assert.equal(canSubmitContract({...c,items:[{text:'بند اصلاح‌شده'}]}),true);
 assert.equal(canSubmitContract({...c,title:'قرارداد اصلاح‌شده'}),true);
 for(const changes of [{revisionBaseline:null},{revisionBaseline:undefined},{approvalStatus:'returned'}]){
  assert.equal(canSubmitContract({...c,...changes}),true);
 }
 for(const changes of [{isDraft:true},{status:'draft'},{approvalStatus:'pending'},{approvalStatus:'approved'}]){
  assert.equal(canSubmitContract({...c,...changes}),false);
 }
 const result=transitionContractApproval(c,'submit',{id:'writer'},{approverIds:['reviewer']});
 assert.equal(result.ok,true);
 assert.equal(result.contract.approvalStatus,'pending');
 assert.deepEqual(result.contract.approvedContactIds,[]);
 assert.equal(result.contract.revisionBaseline,null);
 assert.equal(contractRevisionContent(result.contract),contractRevisionContent(c));
});

test('contract list removes the return action, shows a red reason and leaves resubmission to the edit form',()=>{
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
  assert.ok(!nodes.some(n=>['ارسال برای تأیید','ارسال مجدد برای تأیید'].includes(n.textContent)));
 }finally{[globalThis.document,globalThis.window,projectRepository.getActiveProject,contractApi.listPage]=previous;}
});
