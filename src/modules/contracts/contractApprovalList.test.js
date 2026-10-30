import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.window={location:{hash:'',search:''},localStorage:{getItem:()=>JSON.stringify({token:'test',phone:'0912',accountId:'me',expiresAt:Date.now()+60000})}};
const {contractsModule,normalizeContractSearch}=await import('./contractsModule.js');
const {projectRepository}=await import('../../data/projectRepository.js');
const {contractApi}=await import('../../domain/contractApi.js');
const {contactApi}=await import('../../domain/contactApi.js');
const {activityApi}=await import('../../domain/activityApi.js');
test('shared list filters assigned pending requests, clears filter, and searches beyond first page',()=>{
 const make=tag=>({tag,children:[],dataset:{},hidden:false,listeners:{},className:'',
 append(...xs){this.children.push(...xs);},appendChild(x){this.children.push(x);},
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
  assert.equal(list.children.length,205);
  assert.ok(list.children.every(row=>row.children.at(-1).className==='contract-workflow-row'));
  const banner=body.children.find(x=>x.className==='contract-review-banner');
  assert.match(banner.textContent,/۱ قرارداد/);banner.onclick();
  assert.equal(list.children.filter(x=>!x.hidden).length,1);
  body.children.find(x=>x.className==='contract-status-filter').onclick();
  assert.equal(list.children.filter(x=>!x.hidden).length,205);
  const search=body.children.find(x=>x.className==='workspace-search').children[0];
  search.value='CTR-۲۰۴';search.listeners.input();
  assert.equal(list.children.filter(x=>!x.hidden).length,1);
  assert.equal(list.children.find(x=>!x.hidden).dataset.searchText.includes('ctr204'),true);
  assert.equal(normalizeContractSearch('كشتارگاه يک'),'کشتارگاهیک');
 }finally{[projectRepository.getActiveProject,contractApi.listPage,contactApi.lookup,activityApi.lookup]=original;}
});
