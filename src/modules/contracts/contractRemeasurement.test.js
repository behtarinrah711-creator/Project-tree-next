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

test('mixed quantities preserve the known subtotal, individual values and unknown final total',()=>{
 const state=draft();state.remeasurement=false;
 state.operationRows=[
  {pricingMode:'quantity',description:'کناف معلوم',unit:'مترمربع',quantity:100,unitPrice:1400000,remeasurement:false},
  {pricingMode:'quantity',description:'برش لاین',unit:'متر',quantity:'',unitPrice:500,remeasurement:true},
  {pricingMode:'agreed',description:'تجهیز',agreedPrice:1000000}
 ];
 const original=JSON.stringify(state);
 const html=contractDocumentMarkup(state);
 assert.equal(JSON.stringify(state),original,'preview must not mutate the saved rows');
 assert.ok(html.includes('جمع ردیف‌های با مبلغ مشخص'));assert.ok(html.includes('۱۴۱٬۰۰۰٬۰۰۰'));
 assert.ok(html.includes('<td>۱۰۰</td>'));assert.ok(html.includes('۱۴۰٬۰۰۰٬۰۰۰'));
 assert.ok(html.includes('پس از متره'));assert.ok(!html.includes('به مبلغ کل'));
 syncContractAmount(state);assert.equal(state.amount,null);assert.equal(state.knownAmount,'141000000');
 syncPaymentStages(state);assert.equal(state.retentionAmount,null);
 state.operationRows[1].remeasurement=false;state.operationRows[1].quantity=20;
 syncContractAmount(state);assert.equal(state.remeasurement,false);assert.equal(state.amount,'141010000');
 const final=contractDocumentMarkup(state);assert.ok(final.includes('جمع کل عملیات‌ها'));assert.ok(final.includes('به مبلغ کل'));
});
test('saving mixed rows requires quantities only for rows that have a known quantity',()=>{
 const oldProject=projectRepository.getActiveProject,oldSave=contractApi.save;
 projectRepository.getActiveProject=()=>({id:'p',activityTemplates:[{id:'a',name:'کناف'}]});
 contractApi.save=(id,record)=>({ok:true,contract:record});
 try{
  const state=draft();state.remeasurement=false;
  state.operationRows[0].remeasurement=true;
  state.operationRows.push({pricingMode:'quantity',description:'معلوم',unit:'متر',unitPrice:500,quantity:20,remeasurement:false});
  const save=()=>saveRealContract('p',state,{todayJalaliStr:()=> '1405/08/07'});
  const result=save();assert.equal(result.ok,true);assert.equal(result.contract.knownAmount,'10000');assert.equal(result.contract.amount,null);
  state.operationRows[1].quantity='';assert.equal(save().ok,false);
 }finally{projectRepository.getActiveProject=oldProject;contractApi.save=oldSave;}
});
