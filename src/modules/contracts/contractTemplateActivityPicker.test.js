import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppDataStore } from '../../data/appDataStore.js';
import { registerSearchPicker } from '../../ui/searchPickerAdapter.js';

test('template editor accepts an independent title and saves without an activity', async()=>{
  const store=createAppDataStore({storage:{getItem(){return null;},setItem(){}}});
  store.replaceSnapshot({schemaVersion:8,projects:[{id:'p',tasks:[],activityTemplates:[],contractTemplates:[]}],activeTab:'p',starredOrder:[]});
  globalThis.KarhaAppData=store;
  globalThis.document={getElementById(){return null;}};
  globalThis.window={location:{hash:'',search:''},KarhaAppData:store,
    makeContractTemplateDraftClean:()=>({id:'template-1',title:'',items:[{id:'clause',text:'Keep me'}]})};
  const {contractTemplateFormModule:form}=await import('./contractTemplateFormModule.js');
  form.open(null,'p');
  assert.equal(form.save('p'),false);
  form.getState().title='قرارداد دیوار برشی';
  assert.equal(form.save('p'),true);
  const saved=store.getSnapshot().projects[0].contractTemplates[0];
  assert.equal(saved.title,'قرارداد دیوار برشی');
  assert.equal(saved.activityId,undefined);
  assert.equal(saved.items[0].text,'Keep me');
  assert.equal(store.getSnapshot().projects[0].activityTemplates.length,0);
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

test('independent templates save, rename and coexist without duplicate-activity restrictions',async()=>{
  const {contractApi}=await import('../../domain/contractApi.js');
  const store=createAppDataStore({storage:null});
  store.replaceSnapshot({schemaVersion:8,projects:[{id:'titles',tasks:[],contractTemplates:[]}],activeTab:'titles',starredOrder:[]});
  globalThis.KarhaAppData=store;window.KarhaAppData=store;
  const first=contractApi.saveTemplate('titles',{id:'f',title:'  قرارداد فونداسیون  ',activityId:'a',items:[]},'نام فعالیت');
  const second=contractApi.saveTemplate('titles',{id:'w',title:'قرارداد دیوار برشی',activityId:'a',items:[]},'نام فعالیت');
  assert.equal(first.ok,true);assert.equal(second.ok,true);
  assert.equal(first.template.title,'قرارداد فونداسیون');
  assert.equal(first.template.activityId,undefined);
  assert.equal(second.template.title,'قرارداد دیوار برشی');
  assert.equal(contractApi.saveTemplate('titles',{...first.template,title:'اسکلت بتنی'}).template.title,'اسکلت بتنی');
  assert.equal(contractApi.saveTemplate('titles',{id:'empty',title:'   '}).ok,false);
  assert.equal(store.getSnapshot().projects[0].contractTemplates.length,2);
});

test('new manual template uses real draft IDs, saves in its opening project and keeps subsequent edits',async()=>{
  const {makeContractTemplateDraftClean,makeContractItem}=await import('./contractTemplatesDomain.js');
  const store=createAppDataStore({storage:null});
  store.replaceSnapshot({schemaVersion:8,projects:[{id:'manual-a',tasks:[],contractTemplates:[]},{id:'manual-b',tasks:[],contractTemplates:[]}],activeTab:'manual-b',starredOrder:[]});
  globalThis.KarhaAppData=store;
  globalThis.document={getElementById(){return null;}};
  globalThis.window={location:{hash:'',search:''},KarhaAppData:store,makeContractTemplateDraftClean};
  const {contractTemplateFormModule:form}=await import('./contractTemplateFormModule.js');
  assert.equal(form.open(null,'manual-a'),true);
  const first=form.getState();
  assert.ok(first.id);
  assert.equal(first.items.length,12);
  assert.equal(new Set(first.items.map(x=>x.id)).size,12);
  first.title='قرارداد گچ‌کاری';
  first.items[0].children.push(makeContractItem('بند گچ‌کاری'));
  assert.equal(form.save(),true);
  const project=store.getSnapshot().projects.find(p=>p.id==='manual-a');
  assert.equal(project.contractTemplates[0].title,'قرارداد گچ‌کاری');
  assert.equal(project.contractTemplates[0].items[0].children[0].text,'بند گچ‌کاری');
  assert.equal(store.getSnapshot().projects.find(p=>p.id==='manual-b').contractTemplates.length,0);
  window.findContractTemplate=id=>project.contractTemplates.find(t=>t.id===id);
  assert.equal(form.open(first.id,'manual-a'),true);
  form.getState().items[0].children.push(makeContractItem('بند جدید'));
  assert.equal(form.save(),true);
  assert.equal(store.getSnapshot().projects.find(p=>p.id==='manual-a').contractTemplates[0].items[0].children.length,2);
});

test('editor commits real articles and clauses without legacy item factories and retains them on reopen',async()=>{
  const domain=await import('./contractTemplatesDomain.js');
  const store=createAppDataStore({storage:null});
  store.replaceSnapshot({schemaVersion:8,projects:[{id:'clauses',tasks:[],contractTemplates:[]}],activeTab:'clauses',starredOrder:[]});
  globalThis.KarhaAppData=store;globalThis.document={getElementById(){return null;}};
  globalThis.window={location:{hash:'',search:''},KarhaAppData:store,makeContractTemplateDraftClean:domain.makeContractTemplateDraftClean};
  const {contractTemplateFormModule:form}=await import('./contractTemplateFormModule.js');
  form.open(null,'clauses');form.getState().title='قالب تست';
  assert.equal(form.commitInput('ماده تست'),true);
  const parent=form.getState().items.at(-1);
  assert.equal(form.commitInput('بند تست',parent.id),true);
  assert.equal(form.save('clauses'),true);
  const saved=store.getSnapshot().projects[0].contractTemplates[0];
  assert.equal(saved.items.at(-1).text,'ماده تست');
  assert.equal(saved.items.at(-1).children[0].text,'بند تست');
  window.findContractTemplate=id=>saved.id===id?saved:null;
  form.open(saved.id,'clauses');
  assert.equal(form.getState().items.at(-1).children[0].text,'بند تست');
});
