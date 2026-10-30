import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureOperationRows,rowAmount,syncContractAmount,renderQuantityRows} from './contractPricing.js';
import {contractDocumentMarkup} from './contractDocument.js';
globalThis.window={location:{hash:'',search:''}};
const {saveRealContract}=await import('./realContractPersistence.js');
const {makeRealContractDraft}=await import('./realContractDomain.js');
const {projectRepository}=await import('../../data/projectRepository.js');
const {contractApi}=await import('../../domain/contractApi.js');

test('legacy operation migration preserves amounts and does not duplicate rows',()=>{
 const agreed={amountMethod:'agreed',amount:'3000000',amountDescription:'کندن کف'};
 assert.equal(ensureOperationRows(agreed)[0].agreedPrice,'3000000');
 assert.equal(syncContractAmount(agreed),'3000000');
 assert.equal(ensureOperationRows(agreed).length,1);
 const quantity={amountMethod:'quantity',amountRows:[{id:'q',description:'بتن',unit:'مترمکعب',quantity:20,unitPrice:100}]};
 assert.equal(ensureOperationRows(quantity)[0].pricingMode,'quantity');
 assert.equal(syncContractAmount(quantity),'2000');
});

test('mixed operations sum independently and preview replaces fixed unit fields with dashes',()=>{
 const state={operationRows:[{description:'کندن کف',pricingMode:'agreed',agreedPrice:'۳۰۰۰۰۰۰',quantity:999,unitPrice:999},
 {description:'بتن',pricingMode:'quantity',quantity:20,unit:'مترمکعب',unitPrice:100000}]};
 assert.equal(syncContractAmount(state),'5000000');
 const html=contractDocumentMarkup(state);
 assert.match(html,/کندن کف<\/td><td>—<\/td><td>—<\/td><td>—<\/td>/);
 assert.match(html,/مترمکعب/);
 assert.match(html,/۵٬۰۰۰٬۰۰۰/);
 state.operationRows[0].pricingMode='quantity';
 assert.equal(rowAmount(state.operationRows[0]),998001);
 state.operationRows[0].pricingMode='agreed';
 assert.equal(rowAmount(state.operationRows[0]),3000000);
});

test('operation editor explicitly switches modes and keeps total field',()=>{
 const previous=globalThis.document;
 const make=tag=>({tag,children:[],dataset:{},append(...xs){this.children.push(...xs);},appendChild(x){this.children.push(x);},setAttribute(){}});
 globalThis.document={createElement:make,createTextNode:text=>({textContent:text})};
 try{
  const rows=[{id:'one',pricingMode:'agreed',agreedPrice:'300'}];let changes=0;
  const render=()=>{
   const fields=[],root=make('root');
   renderQuantityRows(root,rows,{operations:true,mixed:true,onChange(){changes++;},onDirty(){},pick(){},
    selectRow:(root,label)=>fields.push(label),numberRow:(root,label)=>fields.push(label)});
   return {fields,list:root.children[0]};
  };
  let editor=render();
  assert.deepEqual(editor.fields,['بهای کل عملیات']);
  const choices=editor.list.children[0].children[2];
  assert.equal(choices.children[0].children[0].checked,true);
  const radio=choices.children[1].children[0];radio.checked=true;radio.onchange();
  assert.equal(rows[0].pricingMode,'quantity');assert.equal(changes,1);
  editor=render();assert.deepEqual(editor.fields,['واحد','مقدار','بهای واحد']);
  assert.equal(editor.list.children[0].children.at(-1).children[0].textContent,'بهای کل عملیات:');
  editor.list.children.at(-1).onclick();assert.equal(rows[1].pricingMode,'agreed');
 }finally{globalThis.document=previous;}
});

test('save/reopen retains mixed modes and validates the active fields',()=>{
 const oldProject=projectRepository.getActiveProject,oldSave=contractApi.save;
 projectRepository.getActiveProject=()=>({id:'p',activityTemplates:[{id:'a',name:'نما'}]});
 contractApi.save=(id,record)=>({ok:true,contract:JSON.parse(JSON.stringify(record))});
 try{
  const draft={id:'c',contractDate:'1405/08/07',projectItemId:'task',employerId:'e',contractorId:'c',activityId:'a',
   startDate:'1405/08/07',endDate:'1405/09/07',retentionPercent:10,retentionDuration:'یک ماه',
   amountMethod:'quantity',amountRows:[],operationRows:[{id:'a',description:'کندن',pricingMode:'agreed',agreedPrice:'300'},
    {id:'b',description:'بتن',pricingMode:'quantity',unit:'مترمکعب',quantity:2,unitPrice:100}]};
  const helpers={todayJalaliStr:()=> '1405/08/07'};
  const result=saveRealContract('p',draft,helpers);
  assert.equal(result.ok,true);assert.equal(result.contract.amount,'500');assert.equal(result.contract.retentionAmount,'50');
  assert.deepEqual(makeRealContractDraft(result.contract).operationRows,draft.operationRows);
  draft.operationRows[1].quantity='';assert.equal(saveRealContract('p',draft,helpers).ok,false);
  draft.operationRows[1].quantity='0';assert.equal(saveRealContract('p',draft,helpers).ok,false);
  draft.operationRows[1].pricingMode='agreed';draft.operationRows[1].agreedPrice='200';
  assert.equal(saveRealContract('p',draft,helpers).ok,true);
 }finally{projectRepository.getActiveProject=oldProject;contractApi.save=oldSave;}
});
