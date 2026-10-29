import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureAgreedRows,syncContractAmount,renderQuantityRows} from './contractPricing.js';
import {contractDocumentMarkup} from './contractDocument.js';
globalThis.window={location:{hash:'',search:''}};
const {makeRealContractDraft}=await import('./realContractDomain.js');
const {saveRealContract}=await import('./realContractPersistence.js');
const {projectRepository}=await import('../../data/projectRepository.js');
const {contractApi}=await import('../../domain/contractApi.js');

test('agreed operation editor uses one price field and supports add/delete with renumbering',()=>{
 const old=globalThis.document;
 const make=tag=>({tag,children:[],dataset:{},append(...xs){this.children.push(...xs);},appendChild(x){this.children.push(x);},setAttribute(){}});
 globalThis.document={createElement:make};
 try{
  const rows=[{id:'a',description:'A',agreedPrice:'100'},{id:'b',description:'B',agreedPrice:'200'}];let fields=[];
  const render=()=>{fields=[];const root=make('root');renderQuantityRows(root,rows,{agreed:true,operations:true,onChange(){},onDirty(){},selectRow(){assert.fail('No unit selector in agreed mode');},numberRow:(root,label,value,change,options)=>fields.push({label,value,change,options})});return root.children[0];};
  let list=render();assert.deepEqual(fields.map(x=>x.label),['بهای توافقی','بهای توافقی']);
  assert.equal(fields[0].options.suffix,'تومان');fields[0].change('150');assert.equal(rows[0].agreedPrice,'150');
  list.children[0].children[0].children[1].onclick();list=render();
  assert.equal(list.children[0].children[0].children[0].textContent,'عملیات ۱');
  list.children.at(-1).onclick();assert.equal(rows.length,2);
 }finally{globalThis.document=old;}
});

test('agreed sums, method switching and legacy amount migration preserve separate prices',()=>{
 const draft=makeRealContractDraft({amountMethod:'agreed',amount:'420',amountDescription:'قدیمی'});
 assert.equal(draft.agreedRows[0].agreedPrice,'420');assert.equal(draft.agreedRows[0].description,'قدیمی');
 draft.agreedRows.push({description:'جدید',agreedPrice:'۸۰'});assert.equal(syncContractAmount(draft),'500');
 draft.amountRows=[{quantity:2,unitPrice:50}];draft.amountMethod='quantity';assert.equal(syncContractAmount(draft),'100');
 draft.amountMethod='agreed';assert.equal(syncContractAmount(draft),'500');
 const html=contractDocumentMarkup(draft);assert.match(html,/بهای توافقی/);assert.match(html,/جدید/);assert.doesNotMatch(html,/بهای واحد/);
 assert.equal(ensureAgreedRows(draft).length,2);
});

test('save/reopen keeps agreed operations and retention; rejects incomplete price rows',()=>{
 const oldProject=projectRepository.getActiveProject,oldSave=contractApi.save;
 projectRepository.getActiveProject=()=>({id:'p',activityTemplates:[{id:'a',name:'نما'}]});
 contractApi.save=(id,record)=>({ok:true,contract:JSON.parse(JSON.stringify(record))});
 try{
 const draft={id:'c',contractDate:'1405/08/07',projectItemId:'task',employerId:'e',contractorId:'c',activityId:'a',startDate:'1405/08/07',endDate:'1405/09/07',amountMethod:'agreed',agreedRows:[{id:'a',description:'اول',agreedPrice:'100'},{id:'b',description:'دوم',agreedPrice:'300'}],retentionPercent:10,retentionDuration:'یک ماه',retentionMethod:'all'};
 const helpers={todayJalaliStr:()=> '1405/08/07'};
 const result=saveRealContract('p',draft,helpers);assert.equal(result.ok,true);assert.equal(result.contract.amount,'400');assert.equal(result.contract.retentionAmount,'40');
 assert.deepEqual(makeRealContractDraft(result.contract).agreedRows,draft.agreedRows);
 draft.agreedRows[1].agreedPrice='';assert.equal(saveRealContract('p',draft,helpers).ok,false);
 }finally{projectRepository.getActiveProject=oldProject;contractApi.save=oldSave;}
});
