import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.window={location:{hash:'',search:''}};
const {saveRealContract}=await import('./realContractPersistence.js');
const {contractApi}=await import('../../domain/contractApi.js');
const {projectRepository}=await import('../../data/projectRepository.js');
const {contractRepository}=await import('../../data/contractRepository.js');
const {workTaskRepository}=await import('../../data/workTaskRepository.js');
const {transitionContractApproval,contractApprovalState}=await import('../../domain/contractApproval.js');
const {contractProgressSteps}=await import('./contractProgressView.js');
const actor={id:'writer',contactId:'writer',name:'تنظیم‌کننده'};
const draft=()=>({id:'c',projectItemId:'w',workTaskId:'t',contractorId:'contractor',activityId:'a',title:'قرارداد',
 operationRows:[{pricingMode:'agreed',description:'عملیات',agreedPrice:100}],paymentMethod:'quantity',paymentRows:[],retentionPercent:0});
test('manual completion accepts deliberate blank fields, records history and can be cancelled without losing content',()=>{
 const old=[projectRepository.find,projectRepository.getActiveProject,contractRepository.get,contractRepository.save,workTaskRepository.get,workTaskRepository.update];
 let stored=null;const project={id:'p',activityTemplates:[{id:'a',name:'فعالیت'}]};
 projectRepository.find=projectRepository.getActiveProject=()=>project;
 contractRepository.get=()=>stored;contractRepository.save=(id,c)=>{stored=structuredClone(c);return stored;};
 workTaskRepository.get=()=>({id:'t',contractApproverContactIds:[]});workTaskRepository.update=()=>null;
 const helpers={declareCompletion:true,actor,todayJalaliStr:()=> '1405/08/12'};
 try{
  const state=draft();assert.equal(contractApi.saveDraft('p',state).ok,true);assert.equal(contractApprovalState(stored),'incomplete');
  assert.equal(saveRealContract('p',state,helpers).ok,false);
  const manualFields=['contractDate','employerId','startDate','endDate'];
  const result=saveRealContract('p',state,{...helpers,manualFields});assert.equal(result.ok,true);
  assert.equal(stored.status,'final');assert.equal(stored.approvalStatus,'approved');
  assert.equal(stored.completedBy.id,'writer');assert.deepEqual(stored.manualCompletionFields,manualFields);
  assert.equal(stored.approvalHistory.at(-1).action,'complete');
  assert.equal(contractProgressSteps(stored)[1].done,true);
  assert.equal(contractApi.review('p','c','cancel_completion',actor,{reason:'کم'}).ok,false);
  assert.equal(contractApi.review('p','c','cancel_completion',actor,{reason:'تاریخ‌ها باید اصلاح شوند'}).ok,true);
  assert.equal(contractApprovalState(stored),'incomplete');assert.equal(contractProgressSteps(stored)[1].done,false);
  assert.equal(stored.operationRows[0].agreedPrice,100);assert.equal(stored.approvalHistory.at(-1).action,'cancel_completion');
  assert.equal(saveRealContract('p',{...state,contractorId:''},{...helpers,manualFields:[...manualFields,'contractorId']}).ok,false);
  assert.equal(saveRealContract('p',{...state,startDate:'1405/09/01',endDate:'1405/08/01'},{...helpers,manualFields}).ok,false);
  const incomplete={...state,contractorId:'',activityId:'',operationRows:[]};
  assert.equal(saveRealContract('p',incomplete,{...helpers,manualFields,confirmedEmptyFields:true}).ok,true);
 }finally{[projectRepository.find,projectRepository.getActiveProject,contractRepository.get,contractRepository.save,workTaskRepository.get,workTaskRepository.update]=old;}
});
test('only submitter can withdraw; approved reviews require revocation and signed contracts stay locked',()=>{
 const c={id:'c',status:'final',approvalStatus:'pending',submittedBy:actor,approvalContactIds:['reviewer'],contractApproverContactIds:['reviewer'],amount:100};
 assert.equal(transitionContractApproval(c,'withdraw_submission',{id:'other'},{reason:'نیاز به اصلاح دارد'}).ok,false);
 const result=transitionContractApproval(c,'withdraw_submission',actor,{reason:'نیاز به اصلاح دارد'});
 assert.equal(result.ok,true);assert.equal(result.contract.status,'draft');assert.equal(result.contract.amount,100);
 assert.deepEqual(result.contract.approvedContactIds,[]);
 assert.equal(transitionContractApproval({...c,approvalStatus:'approved'},'cancel_completion',actor,{reason:'نیاز به اصلاح دارد'}).ok,false);
 for(const extra of [{signedAt:1},{sentToAccountingAt:1},{signatureStatus:'signed'},{accountingStatus:'accepted'}]){
  assert.equal(transitionContractApproval({...c,approvalStatus:'approved',contractApproverContactIds:[],...extra},'cancel_completion',actor,{reason:'نیاز به اصلاح دارد'}).ok,false);
 }
});
