import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.window={location:{hash:'',search:''},localStorage:{getItem:()=>JSON.stringify({token:'test',phone:'0912',accountId:'me',expiresAt:Date.now()+60000})}};
const {contractsModule,normalizeContractSearch}=await import('./contractsModule.js');
const {projectRepository}=await import('../../data/projectRepository.js');
const {contractApi}=await import('../../domain/contractApi.js');
const {contactApi}=await import('../../domain/contactApi.js');
const {activityApi}=await import('../../domain/activityApi.js');
test('contract list excludes pending reviews and searches beyond the first page',()=>{
 const make=tag=>({tag,children:[],dataset:{},hidden:false,listeners:{},className:'',
 append(...xs){xs.forEach(x=>this.appendChild(x));},appendChild(x){x.remove();x.parent=this;this.children.push(x);},
 replaceChildren(...xs){this.children.forEach(x=>{x.parent=null;});this.children=[];this.append(...xs);},remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);this.parent=null;},
 setAttribute(){},addEventListener(type,fn){this.listeners[type]=fn;},innerHTML:''});
 const body=make('body');globalThis.document={createElement:make,getElementById:id=>id==='contractsPageBody'?body:null};
 const original=[projectRepository.getActiveProject,contractApi.listPage,contactApi.lookup,activityApi.lookup];
 const p={id:'p',contacts:[{id:'reviewer',phone:'0912',firstName:'مدیر'}],projectMembers:[]};
 const records=Array.from({length:205},(_,i)=>({id:String(i),status:'final',title:'قرارداد '+i,contractNo:'CTR-'+i}));
 records[0]={...records[0],approvalStatus:'pending',approvalContactId:'reviewer'};
 records[1]={...records[1],approvalStatus:'pending',approvalContactId:'other'};
 projectRepository.getActiveProject=()=>p;
 contractApi.listPage=(id,{cursor,limit})=>({items:records.slice(cursor,cursor+limit),cursor:cursor+limit<records.length?cursor+limit:null});
 contactApi.lookup=()=>null;activityApi.lookup=()=>null;
 try{
  contractsModule.render('p');
  const list=body.children.find(x=>x.className==='contract-list');
  assert.equal(list.children.length,203);
  assert.ok(list.children.every(row=>row.children.at(-3).className==='contract-workflow-row'));
  assert.ok(list.children.every(row=>row.children.at(-2).className==='contract-addenda-row'));
  assert.ok(list.children.every(row=>!row.children.some(child=>child.className==='contract-progress')));
  for(const row of list.children){
    const ring=row.children[0].children.find(node=>node.className==='today-progress-circle');
    const total=row.dataset.approvalState==='pending'?6:5;
    assert.equal(ring.children[0].textContent,total===6?'۲ از ۶':'۲ از ۵');
    assert.match(ring.innerHTML,new RegExp('stroke-dasharray="'+(2/total*100)+' 100"'));
  }
  assert.ok(list.children.every(row=>!row.children.some(child=>child.className==='contract-signed-section')));
  assert.ok(list.children.every(row=>row.children.at(-1).className==='contract-history'));
  assert.equal(body.children.some(node=>node.className==='contract-review-banner'),false);
  assert.ok(list.children.every(row=>row.dataset.approvalState!=='pending'));
  const filterWrap=body.children.find(x=>x.className==='contract-filter-wrap');
  const search=body.children.find(x=>x.className==='workspace-search').children[0];
  search.value='CTR-۲۰۴';search.listeners.input();
  assert.equal(list.children.length,1);
  assert.equal(list.children[0].dataset.searchText.includes('ctr204'),true);
  assert.equal(body.children.filter(x=>x.className==='contract-empty').length,0);
  const filter=filterWrap.children.find(x=>x.className==='contract-status-filter');
  filter.onclick();
  let menu=filterWrap.children.find(x=>x.id==='contractStatusMenu');
  const checks=menu.children.slice(1).map(label=>label.children[0]);
  assert.equal(checks.length,4);assert.ok(checks.every(check=>check.value!=='pending'));assert.ok(checks.every(check=>check.checked));
  for(const check of checks){if(check.value!=='pending'){check.checked=false;check.onchange();}}
  assert.equal(list.children.length,0);
  assert.equal(body.children.filter(x=>x.className==='contract-empty').length,1);
  search.value='';search.listeners.input();
  assert.equal(list.children.length,0);
  assert.equal(body.children.filter(x=>x.className==='contract-empty').length,1);
  for(const check of checks){check.checked=true;check.onchange();}
  assert.equal(list.children.length,203);
  for(const check of checks){check.checked=false;check.onchange();}
  assert.equal(list.children.length,0);
  for(const check of checks){check.checked=true;check.onchange();}
  filterWrap.children.find(x=>x.className==='contract-filter-dismiss').onclick();
  assert.equal(filterWrap.children.filter(x=>x.id==='contractStatusMenu').length,0);
  search.value='not-found';search.listeners.input();
  assert.equal(list.children.length,0);
  assert.equal(body.children.filter(x=>x.className==='contract-empty').length,1);
  search.value='';search.listeners.input();
  assert.equal(list.children.length,203);
  assert.equal(body.children.filter(x=>x.className==='contract-empty').length,0);
  assert.equal(normalizeContractSearch('كشتارگاه يک'),'کشتارگاهیک');
 }finally{[projectRepository.getActiveProject,contractApi.listPage,contactApi.lookup,activityApi.lookup]=original;}
});
