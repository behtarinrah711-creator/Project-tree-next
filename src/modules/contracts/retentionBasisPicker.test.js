import test from 'node:test';
import assert from 'node:assert/strict';
import {createAppDataStore} from '../../data/appDataStore.js';
globalThis.window={location:{hash:'',search:''}};
const {addRetentionBasis,retentionBasisOptions,openRetentionBasisPicker,openRetentionBasisSheet}=await import('./retentionBasisPicker.js');
const {projectRepository}=await import('../../data/projectRepository.js');
function boot(){
  const map=new Map(),storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v))};
  const store=createAppDataStore({storage});store.replaceSnapshot({schemaVersion:8,projects:[{id:'p'},{id:'other'}],activeTab:'p',viewMode:'simple',starredOrder:[]});
  globalThis.KarhaAppData=store;window.KarhaAppData=store;return store;
}
test('custom bases persist per project and reject blank or equivalent titles',()=>{
  boot();assert.ok(addRetentionBasis('p','  ').error);
  assert.ok(addRetentionBasis('p','تاریخ پایان قرارداد').error);
  assert.deepEqual(addRetentionBasis('p',' تأیید صورت‌وضعیت نهایی '),{value:'تأیید صورت‌وضعیت نهایی'});
  assert.ok(addRetentionBasis('p','تأیید صورت وضعیت نهایی').error);
  assert.equal(retentionBasisOptions(projectRepository.getActiveProject('p')).length,5);
  assert.equal(retentionBasisOptions(projectRepository.getActiveProject('other')).length,4);
  let config;window.KarhaSearchTemplate={open:opts=>{config=opts;return true;}};
  let selected;openRetentionBasisPicker('p','',v=>selected=v);
  assert.equal(config.showAdd,true);assert.equal(typeof config.onAdd,'function');
  assert.ok(config.items.some(x=>x.name==='تأیید صورت‌وضعیت نهایی'));
  config.onSelect({id:'تأیید صورت‌وضعیت نهایی'});assert.equal(selected,'تأیید صورت‌وضعیت نهایی');
});
test('sheet validates, saves, dismisses and cleans keyboard viewport listeners',()=>{
  boot();let removed=false,focused=false,saved,ready,dismissed;
  const input={value:'',focus(){focused=true;},setAttribute(){},removeAttribute(){}};
  const error={textContent:''},cancel={},buttons=[{},{}];
  const form={querySelectorAll:()=>buttons};
  const overlay={style:{},classList:{remove(){}},remove(){removed=true;},querySelector:s=>s==='form'?form:s==='input'?input:s==='[role="alert"]'?error:cancel};
  let listeners=0;
  const doc={querySelector:()=>null,activeElement:{focus(){}},createElement:()=>overlay,body:{appendChild(){}}};
  const win={innerHeight:800,visualViewport:{height:400,offsetTop:10,addEventListener(){listeners++;},removeEventListener(){listeners--; }},KarhaChildHistory:{presentTransient:(key,opts)=>{ready=opts.onReady;dismissed=opts.onDismiss;return true;},isTransientOpen:()=>true,dismissTransient:(key,opts)=>opts.after()}};
  assert.equal(openRetentionBasisSheet('p',v=>saved=v,{documentRef:doc,windowRef:win}),true);ready();assert.ok(focused);assert.equal(overlay.style.height,'400px');
  form.onsubmit({preventDefault(){}});assert.ok(error.textContent);assert.equal(removed,false);
  input.value='تأیید ناظر';form.onsubmit({preventDefault(){}});assert.equal(saved,'تأیید ناظر');assert.ok(removed);assert.equal(listeners,0);
  removed=false;openRetentionBasisSheet('p',()=>assert.fail(),{documentRef:doc,windowRef:win});dismissed();assert.ok(removed);
});
