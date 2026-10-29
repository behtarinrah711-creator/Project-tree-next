import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.window={location:{hash:'',search:''}};
const {saveRealContract}=await import('./realContractPersistence.js');
const {makeRealContractDraft}=await import('./realContractDomain.js');
const {projectRepository}=await import('../../data/projectRepository.js');
const {contractApi}=await import('../../domain/contractApi.js');

test('final save and reopen retain separate pricing/payment rows and calculated retention',()=>{
  const oldProject=projectRepository.getActiveProject,oldSave=contractApi.save;
  projectRepository.getActiveProject=()=>({id:'p',activityTemplates:[{id:'a',name:'نما'}]});
  let stored;
  contractApi.save=(id,record)=>{stored=JSON.parse(JSON.stringify(record));return {ok:true,contract:stored};};
  try{
    const draft={id:'c',contractDate:'1405/08/07',projectItemId:'task',employerId:'e',contractorId:'c',activityId:'a',startDate:'1405/08/07',endDate:'1405/09/07',
      amountMethod:'quantity',amount:'999',amountRows:[{id:'price',description:'سنگ نما',unit:'مترمربع',quantity:200,unitPrice:1000000}],
      paymentMethod:'quantity',paymentStageCount:3,paymentRows:[{id:'pay',description:'بخش اول',unit:'مترمربع',quantity:50,unitPrice:1000000}],
      retentionPercent:10,retentionDuration:'یک ماه',retentionBasis:'تحویل موقت',retentionMethod:'all'};
    const result=saveRealContract('p',draft,{todayJalaliStr:()=> '1405/08/07'});
    assert.equal(result.ok,true);assert.equal(stored.amount,'200000000');
    assert.equal(stored.paymentStages.length,1);assert.equal(stored.paymentStages[0].paymentAmount,45000000);
    const reopened=makeRealContractDraft(stored);
    assert.deepEqual(reopened.amountRows,draft.amountRows);assert.deepEqual(reopened.paymentRows,draft.paymentRows);
    assert.equal(reopened.paymentStageCount,3);assert.equal(reopened.retentionBasis,'تحویل موقت');
    draft.paymentRows[0].quantity='';
    assert.equal(saveRealContract('p',draft,{todayJalaliStr:()=> '1405/08/07'}).ok,false);
  }finally{projectRepository.getActiveProject=oldProject;contractApi.save=oldSave;}
});
