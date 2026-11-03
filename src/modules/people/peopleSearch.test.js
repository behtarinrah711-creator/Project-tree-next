import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window={location:{hash:'',search:''}};
const {peopleModule}=await import('./peopleModule.js');
const {contactApi}=await import('../../domain/contactApi.js');
const {activityApi}=await import('../../domain/activityApi.js');
const {projectRepository}=await import('../../data/projectRepository.js');

function render(t,contacts){
  const previous={document:globalThis.document,project:projectRepository.getActiveProject,list:contactApi.listPage,activity:activityApi.lookup};
  t.after(()=>{globalThis.document=previous.document;projectRepository.getActiveProject=previous.project;contactApi.listPage=previous.list;activityApi.lookup=previous.activity;});
  const make=()=>{
    const node={children:[],events:{},dataset:{},className:'',value:'',
      append(...children){children.forEach(child=>{child.parent=this;this.children.push(child);});},
      appendChild(child){this.append(child);},addEventListener(event,callback){this.events[event]=callback;},
      remove(){if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this);}};
    node.classList={contains:name=>node.className.split(/\s+/).includes(name),toggle(name,force){
      const classes=new Set(node.className.split(/\s+/).filter(Boolean));const on=force??!classes.has(name);
      if(on)classes.add(name);else classes.delete(name);node.className=[...classes].join(' ');
    }};
    return node;
  };
  const body=make(),calls=[];
  globalThis.document={getElementById:id=>id==='contactsPageBody'?body:null,createElement:make};
  projectRepository.getActiveProject=()=>({id:'p'});
  contactApi.listPage=(id,{cursor,limit})=>{assert.equal(id,'p');calls.push(cursor);return {items:contacts.slice(cursor,cursor+limit),cursor:cursor+limit<contacts.length?cursor+limit:null};};
  activityApi.lookup=(_id,id)=>id==='a'?{name:'آرماتوربندی'}:null;
  peopleModule.render('p');
  const input=body.children[0].children[0],list=body.children[1],empty=body.children[2];
  return {body,list,empty,calls,search(value){input.value=value;input.events.input();},
    visible:()=>list.children.filter(row=>!row.classList.contains('hidden'))};
}
const contacts=[{id:'q',type:'پیمانکار',firstName:'جواد',lastName:'قریشی',activities:['a']},
  {id:'a',type:'مهندس',firstName:'سیامند',lastName:'احمدی'}, {id:'k',type:'کارفرما',firstName:'کاظم',lastName:'نیک‌خواه'}];

test('contact search hides unmatched flex rows and restores them when cleared',t=>{
  const ui=render(t,contacts);ui.search('قريشي');
  assert.equal(ui.visible().length,1);assert.match(ui.visible()[0].dataset.searchText,/قریشی/);
  assert.ok(ui.list.children[1].classList.contains('hidden'));
  ui.search('پیدا نشد');assert.equal(ui.visible().length,0);assert.equal(ui.empty.classList.contains('hidden'),false);
  ui.search('');assert.equal(ui.visible().length,3);assert.equal(ui.empty.classList.contains('hidden'),true);
});
test('contact search matches activities, contact type, Arabic letters and spacing',t=>{
  const ui=render(t,contacts);
  for(const query of ['آرماتوربندی','پیمانکار','كاظم','نیک خواه','  جواد   قريشي  ']){
    ui.search(query);assert.equal(ui.visible().length,1,query);
  }
});
test('contact search includes contacts beyond the first page without duplicating rows on later input',t=>{
  const ui=render(t,[...Array.from({length:50},(_,index)=>({id:String(index),firstName:'مخاطب '+index})),{id:'last',lastName:'قریشی'}]);
  assert.equal(ui.list.children.length,50);ui.search('قریشی');
  assert.equal(ui.list.children.length,51);assert.equal(ui.visible().length,1);assert.deepEqual(ui.calls,[0,50]);
  assert.equal(ui.body.children.some(child=>child.textContent==='بارگذاری بیشتر'),false);
  ui.search('احمدی');ui.search('');assert.equal(ui.visible().length,51);assert.deepEqual(ui.calls,[0,50]);
});
