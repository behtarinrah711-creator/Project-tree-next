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

test('existing templates disable activities except the template being edited',async()=>{
  const store=createAppDataStore({storage:{getItem(){return null;},setItem(){}}});
  store.replaceSnapshot({schemaVersion:8,projects:[{
    id:'p',tasks:[],activityTemplates:[{id:'a',name:'A'},{id:'b',name:'B'},{id:'c',name:'C'}],
    contractTemplates:[{id:'tpl-a',activityId:'a'},{id:'tpl-b',activityId:'b',status:'draft'},{id:'trash',activityId:'c',trashed:true}],
  }],activeTab:'p',viewMode:'simple',starredOrder:[]});
  let options;
  globalThis.KarhaAppData=store;
  globalThis.document={getElementById(){return null;}};
  globalThis.window={location:{hash:'',search:''},KarhaAppData:store,
    findContractTemplate:id=>({id,activityId:'a'}),
    makeContractTemplateDraftClean:existing=>existing||{id:'new-template',activityId:'',items:[]}};
  registerSearchPicker({open:opts=>{options=opts;return true;}});
  try{
    const {contractTemplateFormModule:form}=await import('./contractTemplateFormModule.js');
    form.open(null,'p');form.openActivityPicker();
    assert.deepEqual(options.items.map(x=>x.disabled),[true,true,false]);
    assert.equal(options.items[0].disabledReason,'قالب قرارداد قبلاً ساخته شده است');
    options.onSelect(options.items[0]);
    assert.equal(form.getState().activityId,'');
    options.onSelect(options.items[2]);
    assert.equal(form.getState().activityId,'c');
    form.open('tpl-a','p');form.openActivityPicker();
    assert.deepEqual(options.items.map(x=>x.disabled),[false,true,false]);
    options.onSelect(options.items[0]);
    assert.equal(form.getState().activityId,'a');
  }finally{registerSearchPicker();}
});

test('shared picker renders disabled rows and ignores their clicks',async()=>{
  const {readFileSync}=await import('node:fs');
  const {runInNewContext}=await import('node:vm');
  const make=()=>({children:[],dataset:{},classList:{add(){},remove(){},toggle(){}},
    append(...xs){this.children.push(...xs);},appendChild(x){this.children.push(x);},
    setAttribute(k,v){this[k]=v;}});
  const body=make(),page=make();let selected=0,closed=0;
  const context={document:{readyState:'loading',addEventListener(){},createElement:make,
    getElementById:id=>id==='searchTemplatePage'?page:id==='searchTemplateBody'?body:null},
    window:{KarhaChildHistory:{register(){},open(){},isOpen(){return false;},consume(){closed++;}}},
    getCurrentProject:()=>({}),setTimeout(){}};
  runInNewContext(readFileSync(new URL('./searchTemplateModule.js',import.meta.url),'utf8'),context);
  context.window.KarhaSearchTemplate.open({items:[{id:'a',name:'A',disabled:true,disabledReason:'Already created'},{id:'b',name:'B'}],onSelect(){selected++;}});
  const rows=body.children.filter(x=>x.className?.startsWith('stpl-row'));
  assert.equal(rows[0]['aria-disabled'],'true');
  assert.equal(rows[0].children[1].children[0].textContent,'Already created');
  assert.equal(rows[0].children[2].disabled,true);
  rows[0].onclick();
  assert.equal(selected,0);assert.equal(closed,0);
  rows[1].onclick();
  assert.equal(selected,1);assert.ok(closed>0);
});

test('shared picker creates the add button only for lists that allow adding',async()=>{
  const {readFileSync}=await import('node:fs');
  const {runInNewContext}=await import('node:vm');
  const make=()=>({children:[],dataset:{},classList:{add(){},remove(){},toggle(){}},
    append(...xs){xs.forEach(x=>this.appendChild(x));},
    appendChild(x){x.parent=this;this.children.push(x);},
    remove(){this.parent.children=this.parent.children.filter(x=>x!==this);},
    setAttribute(k,v){this[k]=v;}});
  const page=make(),body=make();let added=0;
  const context={document:{readyState:'loading',addEventListener(){},createElement:make,
    getElementById:id=>id==='searchTemplatePage'?page:id==='searchTemplateBody'?body:page.children.find(x=>x.id===id)||null},
    window:{KarhaChildHistory:{register(){},open(){}}},getCurrentProject:()=>({}),setTimeout(){}};
  runInNewContext(readFileSync(new URL('./searchTemplateModule.js',import.meta.url),'utf8'),context);
  const open=context.window.KarhaSearchTemplate.open;
  const button=()=>page.children.find(x=>x.id==='searchTemplateFab');
  open({items:[],showAdd:false});assert.equal(button(),undefined);
  open({items:[],resourceType:'contact',onAdd(){added++;}});
  assert.ok(button());button().onclick();assert.equal(added,1);
  open({items:[],resourceType:'contact',showAdd:false,onAdd(){added++;}});
  assert.equal(button(),undefined);
  open({items:[],resourceType:'activity',onAdd(){added++;}});
  assert.ok(button());button().onclick();assert.equal(added,2);
  open({items:[],resourceType:'other'});assert.equal(button(),undefined);
});
