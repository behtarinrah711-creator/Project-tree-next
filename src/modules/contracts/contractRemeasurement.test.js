import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.window={location:{hash:'',search:''}};
const {contractDocumentMarkup}=await import('./contractDocument.js');
const {syncContractAmount}=await import('./contractPricing.js');
const {syncPaymentStages}=await import('./paymentStagesModule.js');
const {saveRealContract}=await import('./realContractPersistence.js');
const {projectRepository}=await import('../../data/projectRepository.js');
const {contractApi}=await import('../../domain/contractApi.js');
const draft=()=>({contractDate:'1405/08/07',projectItemId:'task',employerId:'e',contractorId:'c',activityId:'a',startDate:'1405/08/07',endDate:'1405/09/07',remeasurement:true,operationRows:[{pricingMode:'quantity',description:'کناف',unit:'مترمربع',unitPrice:1400000,quantity:''}],paymentMethod:'quantity',paymentRows:[],retentionPercent:10,retentionDuration:'یک ماه',retentionBasis:'تحویل موقت'});
test('unknown totals stay null while actual measured payments deduct retention',()=>{
 const state=draft();syncContractAmount(state);syncPaymentStages(state);
 assert.equal(state.amount,null);assert.equal(state.retentionAmount,null);assert.equal(state.amountAfterRetention,null);
 state.paymentRows=[{pricingMode:'quantity',description:'متره اول',unit:'مترمربع',quantity:2,unitPrice:1400000}];
 assert.equal(syncPaymentStages(state)[0].paymentAmount,2520000);
});
test('preview omits empty payment section and fixed monetary retention for unknown quantities',()=>{
 const state=draft();state.paymentRows=[{description:'  ',unit:''}];
 const html=contractDocumentMarkup(state);
 assert.ok(!html.includes('doc-payment'));assert.ok(!html.includes('معادل'));assert.ok(!html.includes('مبلغ کل ۰'));
 assert.ok(html.includes('از مبلغ هر صورت‌وضعیت تأییدشده'));assert.ok(html.includes('پس از متره'));
 state.paymentRows=[{pricingMode:'agreed',description:'پس از تحویل',agreedPrice:1000000}];
 assert.ok(contractDocumentMarkup(state).includes('doc-payment'));
 const fixed=contractDocumentMarkup({amount:100,retentionPercent:0,paymentMethod:'quantity',paymentRows:[]});
 assert.ok(!fixed.includes('doc-payment'));assert.ok(!fixed.includes('حسن انجام کار'));
});
test('save permits unknown quantities and optional payments but validates entered data',()=>{
 const oldProject=projectRepository.getActiveProject,oldSave=contractApi.save;
 projectRepository.getActiveProject=()=>({id:'p',activityTemplates:[{id:'a',name:'کناف'}]});
 contractApi.save=(id,record)=>({ok:true,contract:record});
 const save=state=>saveRealContract('p',state,{todayJalaliStr:()=> '1405/08/07'});
 try{
  const state=draft();const result=save(state);assert.equal(result.ok,true);assert.equal(result.contract.amount,null);assert.equal(result.contract.retentionMethod,'all');
  state.operationRows[0].unitPrice='';assert.equal(save(state).ok,false);
  const partial=draft();partial.paymentRows=[{pricingMode:'quantity',description:'پرداخت',unit:'متر',unitPrice:500}];assert.equal(save(partial).ok,false);
  const fixed=draft();fixed.remeasurement=false;fixed.operationRows[0].quantity=2;assert.equal(save(fixed).ok,true);
 }finally{projectRepository.getActiveProject=oldProject;contractApi.save=oldSave;}
});
