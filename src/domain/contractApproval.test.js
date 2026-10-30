import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.window={location:{hash:'',search:''}};
const {transitionContractApproval,contractApprovalState,canReviewContract}=await import('./contractApproval.js');
const author={id:'author',contactId:'writer',name:'نویسنده'};
const manager={id:'manager',contactId:'reviewer',name:'مدیر'};
test('incomplete contracts cannot be submitted and only designated reviewer can decide',()=>{
 assert.equal(transitionContractApproval({status:'draft',isDraft:true},'submit',author,{approverId:'reviewer'}).ok,false);
 const result=transitionContractApproval({id:'c',status:'final'},'submit',author,{approverId:'reviewer',at:1});
 assert.equal(contractApprovalState(result.contract),'pending');
 assert.equal(canReviewContract(result.contract,manager),true);
 assert.equal(canReviewContract(result.contract,author),false);
 assert.equal(transitionContractApproval(result.contract,'approve',author).ok,false);
 const approved=transitionContractApproval(result.contract,'approve',manager,{at:2});
 assert.equal(contractApprovalState(approved.contract),'approved');
 assert.equal(approved.contract.approvalHistory.length,2);
 assert.equal(transitionContractApproval(approved.contract,'reject',manager,{reason:'دلیل کافی'}).ok,false);
});
test('rejection reason is mandatory and survives resubmission in audit history',()=>{
 const pending=transitionContractApproval({status:'final'},'submit',author,{approverId:'reviewer',at:1}).contract;
 for(const reason of ['', '   ','کم'])assert.equal(transitionContractApproval(pending,'reject',manager,{reason}).ok,false);
 const rejected=transitionContractApproval(pending,'reject',manager,{reason:'اصلاح مبلغ قرارداد',at:2}).contract;
 assert.equal(contractApprovalState(rejected),'returned');
 assert.equal(rejected.approvalRejectionReason,'اصلاح مبلغ قرارداد');
 const resubmitted=transitionContractApproval(rejected,'submit',author,{approverId:'reviewer',at:3}).contract;
 assert.equal(resubmitted.approvalRejectionReason,'');
 assert.equal(resubmitted.approvalHistory[1].reason,'اصلاح مبلغ قرارداد');
 assert.equal(resubmitted.approvalHistory.length,3);
 assert.equal(transitionContractApproval(rejected,'submit',{id:'guest'},{approverId:'reviewer'}).ok,false);
});

test('project API saves workflow and prevents changing approved content',async()=>{
 const {contractApi}=await import('./contractApi.js');
 const {contractRepository}=await import('../data/contractRepository.js');
 const {projectRepository}=await import('../data/projectRepository.js');
 const before=[projectRepository.find,contractRepository.get,contractRepository.save];
 let record={id:'c',status:'final',amount:'100'};
 const project={id:'p',contacts:[{id:'reviewer'}],contracts:[record]};
 projectRepository.find=()=>project;
 contractRepository.get=()=>record;
 contractRepository.save=(id,next)=>{record=structuredClone(next);project.contracts=[record];return record;};
 try{
  assert.equal(contractApi.review('p','c','submit',author,{approverId:'missing'}).ok,false);
  assert.equal(contractApi.review('p','c','submit',author,{approverId:'reviewer'}).ok,true);
  assert.equal(contractApi.save('p',{...record,amount:'999'}).ok,false);
  assert.equal(record.amount,'100');
  assert.equal(contractApi.review('p','c','reject',author,{reason:'دلیل رد طولانی'}).ok,false);
  assert.equal(contractApi.review('p','c','reject',manager,{reason:'مبلغ اصلاح شود'}).ok,true);
  assert.equal(contractApi.save('p',{...record,amount:'200',approvalStatus:'approved'}).ok,true);
  assert.equal(record.approvalStatus,'returned');
  assert.equal(contractApi.review('p','c','submit',author,{approverId:'reviewer'}).ok,true);
  assert.equal(contractApi.review('p','c','approve',manager).ok,true);
  assert.equal(contractApi.saveDraft('p',{...record,amount:'300'}).ok,false);
  assert.equal(record.amount,'200');
 }finally{[projectRepository.find,contractRepository.get,contractRepository.save]=before;}
});

test('all assigned contacts must approve once and rejection resets the next round',()=>{
 const second={id:'employer',contactId:'employer'};
 let c=transitionContractApproval({status:'final'},'submit',author,{approverIds:['reviewer','employer','reviewer']}).contract;
 assert.deepEqual(c.approvalContactIds,['reviewer','employer']);
 c=transitionContractApproval(c,'approve',manager,{at:2}).contract;
 assert.equal(c.approvalStatus,'pending');
 assert.equal(canReviewContract(c,manager),false);
 assert.equal(canReviewContract(c,second),true);
 assert.equal(transitionContractApproval(c,'approve',manager).ok,false);
 const rejected=transitionContractApproval(c,'reject',second,{reason:'مبلغ نیاز به اصلاح دارد'}).contract;
 assert.equal(rejected.approvalStatus,'returned');
 c=transitionContractApproval(rejected,'submit',author,{approverIds:['reviewer','employer']}).contract;
 assert.deepEqual(c.approvedContactIds,[]);
 c=transitionContractApproval(c,'approve',second).contract;
 assert.equal(c.approvalStatus,'pending');
 c=transitionContractApproval(c,'approve',manager).contract;
 assert.equal(c.approvalStatus,'approved');
 assert.equal(c.reviewedBy.contactId,'reviewer');
});
