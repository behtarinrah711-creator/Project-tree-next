import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.window={location:{hash:'',search:''}};
const {createContractPreviewView}=await import('./contractPreviewView.js');

test('contract row preview is read-only, preserves data and closes with header/device Back',()=>{
  const make=tag=>({tag,children:[],attrs:{},hidden:true,
    classList:{add(){},remove(){}},setAttribute(k,v){this.attrs[k]=v;},
    append(...x){this.children.push(...x);},appendChild(x){this.children.push(x);},replaceChildren(){this.children=[];}});
  const root=make('body'),registered={},events=[];let focused=0,mounts=[];
  const view=createContractPreviewView({
    documentRef:{createElement:make,body:root},
    windowRef:{KarhaChildHistory:{register(k,opts){registered[k]=opts;},open:k=>events.push(['open',k]),consume:(k,opts)=>events.push(['close',k,opts.fromPopState])}},
    mountPrintPage:(body,preview)=>{body.appendChild(preview);mounts.push(preview.innerHTML);},
  });
  const project={activityTemplates:[{id:'a',name:'Painting'}],contacts:[{id:'c',name:'Builder'}]};
  const contract={id:'one',activityId:'a',contractorId:'c',items:[{text:'Article',children:[{text:'Clause'}]}]};
  const snapshot=JSON.stringify(contract);
  view.open(project,contract,{trigger:{focus(){focused++;}}});
  assert.equal(root.children.length,1);
  const page=root.children[0],header=page.children[0];
  assert.equal(header.children[1].textContent,'پیش‌نمایش قرارداد');
  assert.equal(page.children.length,2);
  assert.match(mounts[0],/Article/);assert.match(mounts[0],/Clause/);assert.match(mounts[0],/Builder/);
  assert.doesNotMatch(mounts[0],/<input|<textarea|contenteditable|<button/);
  assert.equal(JSON.stringify(contract),snapshot);
  header.children[0].onclick();
  assert.deepEqual(events.at(-1),['close','contract-preview',false]);
  assert.equal(focused,1);
  view.open(project,{...contract,id:'two',items:[{text:'Next contract'}]});
  assert.equal(root.children.length,1);assert.match(mounts.at(-1),/Next contract/);
  registered['contract-preview'].onPop();
  assert.deepEqual(events.at(-1),['close','contract-preview',true]);
});

 test('row preview displays lazy default template clauses before editing or saving',()=>{
  const make=()=>({children:[],classList:{add(){},remove(){}},setAttribute(){},append(...x){this.children.push(...x);},appendChild(x){this.children.push(x);},replaceChildren(){this.children=[];}});
  let output='';
  const view=createContractPreviewView({documentRef:{createElement:make,body:make()},windowRef:{},mountPrintPage:(_,preview)=>{output=preview.innerHTML;}});
  const project={activityTemplates:[{id:'a',name:'Foundation'}],contractTemplates:[{id:'t',activityId:'a',items:[{text:'Foundation terms',children:[{text:'Employer supplies materials'}]}]}]};
  const record={id:'auto',activityId:'a',templateId:'t',items:[]};
  view.open(project,record);
  assert.match(output,/Foundation terms/);assert.match(output,/Employer supplies materials/);
  assert.deepEqual(record.items,[]);
 });
