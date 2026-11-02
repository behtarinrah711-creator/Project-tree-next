import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.window={location:{hash:'',search:''}};
const {contractApi}=await import('./contractApi.js');
const {contractApprovalState,approvalLabels,canRevokeContractApproval}=await import('./contractApproval.js');
const {contractRepository}=await import('../data/contractRepository.js');
const {projectRepository}=await import('../data/projectRepository.js');
const {workTaskRepository}=await import('../data/workTaskRepository.js');
test('completed tree contracts skip review only when their actual task has no reviewers',()=>{
 const previous=[projectRepository.find,contractRepository.get,contractRepository.save,workTaskRepository.get,workTaskRepository.update];
 let record=null,task={id:'t',hasContract:true,contractApproverContactIds:[]};
 projectRepository.find=()=>({id:'p',tasks:[],contacts:[]});
 contractRepository.get=()=>record;
 contractRepository.save=(id,next)=>{record=structuredClone(next);return record;};
 workTaskRepository.get=()=>task;workTaskRepository.update=()=>null;
 const draft=()=>({id:'c',projectItemId:'w',workTaskId:'t',title:'قرارداد',amount:100});
 try{
  let saved=contractApi.saveDraft('p',draft()).contract;
  assert.equal(contractApprovalState(saved),'incomplete');
  saved=contractApi.save('p',saved).contract;
  assert.equal(contractApprovalState(saved),'approved');
  assert.equal(approvalLabels[contractApprovalState(saved)],'تأییدشده؛ در انتظار امضا');
  assert.deepEqual(saved.approvalContactIds,[]);assert.deepEqual(saved.approvedContactIds,[]);
  assert.equal(canRevokeContractApproval(saved,{contactId:'someone'}),false);
  assert.equal(contractApi.review('p','c','submit',{id:'author'},{approverId:'someone'}).ok,false);
  record=null;task={id:'t',contractApproverContactIds:['reviewer']};
  saved=contractApi.save('p',{...draft(),contractApproverContactIds:[]}).contract;
  assert.equal(contractApprovalState(saved),'ready');assert.deepEqual(saved.contractApproverContactIds,['reviewer']);
  record=null;task=null;
  saved=contractApi.save('p',draft()).contract;assert.equal(contractApprovalState(saved),'ready');
  record=null;
  saved=contractApi.save('p',{id:'manual',title:'دستی'}).contract;assert.equal(contractApprovalState(saved),'ready');
 }finally{[projectRepository.find,contractRepository.get,contractRepository.save,workTaskRepository.get,workTaskRepository.update]=previous;}
});
