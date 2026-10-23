import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppDataStore } from '../../data/appDataStore.js';
import { registerSearchPicker } from '../../ui/searchPickerAdapter.js';

test('template uses shared activity picker and selects newly created activity without losing clauses', async()=>{
  const store=createAppDataStore({storage:{getItem(){return null;},setItem(){}}});
  store.replaceSnapshot({schemaVersion:8,projects:[{
    id:'p',tasks:[],activityTemplates:[{id:'a',name:'A'},{id:'b',name:'B'},{id:'trash',trashed:true}],
  }],activeTab:'p',viewMode:'simple',starredOrder:[]});
  let options,creation,closed=false;
  globalThis.KarhaAppData=store;
  globalThis.document={getElementById(){return null;}};
  globalThis.window={
    location:{hash:'',search:''},KarhaAppData:store,
    makeContractTemplateDraftClean:()=>({activityId:'',items:[{id:'clause',text:'Keep me'}]}),
    KarhaSearchTemplate:{close(){closed=true;}},
    KarhaApp:{modules:{get:id=>id==='activities'?{openActivityForm:opts=>{creation=opts;}}:null}},
  };
  registerSearchPicker({open:opts=>{options=opts;return true;}});
  try{
    const {contractTemplateFormModule:form}=await import('./contractTemplateFormModule.js');
    assert.equal(form.open(null,'p'),true);
    assert.equal(form.openActivityPicker(),true);
    assert.equal(options.resourceType,'activity');
    assert.equal(options.showAdd,true);
    assert.deepEqual(options.items.map(x=>x.id),['a','b']);
    options.onSelect(options.items[1]);
    assert.equal(form.getState().activityId,'b');
    assert.equal(form.isDirty(),true);
    form.openActivityPicker();
    assert.deepEqual(options.items.map(x=>x.id),['a','b']);
    options.onAdd();
    assert.equal(closed,true);
    assert.equal(creation.pickerMode,true);
    creation.onCreated({id:'new',name:'New activity'});
    assert.equal(form.getState().activityId,'new');
    assert.equal(form.getState().title,'قرارداد New activity');
    assert.deepEqual(form.getState().items,[{id:'clause',text:'Keep me'}]);
  }finally{registerSearchPicker();}
});
