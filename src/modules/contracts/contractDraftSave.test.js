import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('./realContractFormModule.js',import.meta.url),'utf8');
const save=source.slice(source.indexOf('function saveDraft() {'),source.indexOf('\nexport const realContractFormModule'));
for(const outcome of ['success','denied','throws']){
 test('draft persistence '+outcome+' preserves form unless saved',()=>{
  const state={id:'c',operationRows:[{description:'عملیات',pricingMode:'agreed',agreedPrice:'300'}],paymentRows:[],items:[{text:'ماده'}]};
  let stored,closed=0;const messages=[];
  const context={state,dirty:true,activeProjectId:'p',
   activeProject:id=>({id}),helper:(name,message)=>messages.push(message),
   contractApi:{saveDraft:(id,draft)=>{
    assert.equal(id,'p');
    if(outcome==='throws')throw Error('storage failed');
    if(outcome==='denied')return {ok:false,message:'عدم دسترسی'};
    stored=structuredClone(draft);return {ok:true,contract:stored};
   }},
   realContractFormModule:{close:()=>{closed++;context.state=null;}}
  };
  vm.createContext(context);
  const result=vm.runInContext(save+';saveDraft()',context);
  assert.equal(result,outcome==='success');
  assert.equal(closed,outcome==='success'?1:0);
  if(outcome==='success')assert.deepEqual(stored,state);
  else{assert.equal(context.state,state);assert.equal(context.dirty,true);assert.ok(!messages.includes('قرارداد ذخیره شد؛ در انتظار تکمیل'));}
 });
}
test('button and exit confirmation use project save lifecycle rather than local cache',()=>{
 assert.doesNotMatch(source,/if-draft/);
 assert.match(source,/const saved=this.save\(\)/);
 assert.doesNotMatch(source,/REAL_CONTRACT_DRAFT_KEY|localStorageAdapter/);
});

test('Save chooses complete or incomplete status and keeps persistence failures open',()=>{
 const start=source.indexOf('  save(projectId = null, silent = false) {');
 const method=source.slice(start,source.indexOf('\n  requestClose(',start));
 for(const outcome of ['complete','incomplete','failure']){
  let drafts=0,closed=0;
  const state={id:'c'};
  const context={state,dirty:true,activeProjectId:'p',activeProject:()=>({id:'p'}),helper:()=>{},
   saveRealContract:()=>outcome==='complete'?{ok:true,contract:{id:'c',status:'final'}}:
    outcome==='incomplete'?{ok:false,incomplete:true}:{ok:false,message:'خطای ذخیره'}};
  vm.createContext(context);
  const form=vm.runInContext('({'+method+'})',context);
  form.saveDraft=()=>{drafts++;return true;};form.close=()=>{closed++;};
  assert.equal(form.save(),outcome!=='failure');
  assert.equal(drafts,outcome==='incomplete'?1:0);
  assert.equal(closed,outcome==='complete'?1:0);
 }
});
