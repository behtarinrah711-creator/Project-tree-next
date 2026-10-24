import test from 'node:test';
import assert from 'node:assert/strict';
import { contractActionsMenu } from './contractActionsMenu.js';
import { contractDocumentMarkup } from './contractDocument.js';

test('contract menu toggles dots/close and dispatches edit, export, delete in order',()=>{
  const make=()=>({children:[],attrs:{},append(...x){this.children.push(...x);},appendChild(x){this.children.push(x);},setAttribute(k,v){this.attrs[k]=v;},remove(){this.removed=true;},focus(){}});
  globalThis.document={createElement:make};
  const calls=[];
  const wrap=contractActionsMenu({onEdit:()=>calls.push('edit'),onExport:()=>calls.push('export'),onDelete:()=>calls.push('delete')});
  const toggle=wrap.children[0],click={stopPropagation(){}};
  assert.match(toggle.innerHTML,/circle/);
  for(let i=0;i<3;i++){
    toggle.onclick(click);
    assert.equal(toggle.attrs['aria-expanded'],'true');
    assert.match(toggle.innerHTML,/M5 5/);
    const menu=wrap.children.at(-1);
    assert.deepEqual(menu.children.map(x=>x.title),['ویرایش','خروجی','حذف']);
    menu.children[i].onclick(click);
    assert.equal(toggle.attrs['aria-expanded'],'false');
  }
  assert.deepEqual(calls,['edit','export','delete']);
});

test('contract print includes parties, dates, payments and every clause without mutating data',()=>{
  const contract={contractNo:'123',contractDate:'2026-10-23',employerName:'Owner',contractorName:'Builder',
    amount:'1000',retentionPercent:'10',paymentStages:[{progress:'50',paymentPercent:'25',description:'Pay now'}],
    items:[{text:'Article <one>',children:[{text:'Child A'},{text:'Child B'}]},{text:'Article two'}]};
  const before=JSON.stringify(contract);
  const html=contractDocumentMarkup(contract,'Painting');
  for(const text of ['Owner','Builder','Painting','Article &lt;one&gt;','Child A','Child B','Article two','Pay now','123'])assert.ok(html.includes(text),text);
  assert.equal(JSON.stringify(contract),before);
});

test('contract export keeps PDF/JPEG, note and signature without notebook selection controls',async()=>{
  const {installNotebookExportView}=await import('../notebook/notebookExportView.js');
  globalThis.localStorage={getItem(){return '{}';}};
  const make=()=>({children:[],value:'',checked:false,classList:{add(){},remove(){}},
    append(...xs){this.children.push(...xs);},replaceChildren(){this.children=[];},
    querySelector(){return {};},querySelectorAll(){return [];},closest(){return this.label||{outerHTML:'<textarea id="contractExportNote"></textarea>'};}});
  const ids={};for(const suffix of ['Page','Title','Toolbar','Body','Numbered','Cost','Signature','SignatureHint','Note'])ids['contractExport'+suffix]=make();
  ids.contractExportNumbered.label={};ids.contractExportCost.label={};
  let printed='',captured='',download='',opened='',captureOptions=null;
  const documentRef={getElementById:id=>ids[id],body:{appendChild(){}},createElement:tag=>{
    const el=make();el.scrollHeight=30000;el.scrollWidth=800;el.remove=()=>{};el.click=()=>{download=el.download;};return el;
  }};
  const windowRef={location:{href:'http://localhost/',hash:'#/projects/p/contracts'},document:{fonts:{ready:Promise.resolve()}},
    KarhaChildHistory:{register(){},open:k=>{opened=k;}},
    open:()=>({document:{write:s=>{printed=s;},close(){}}}),
    html2canvas:async (node,options)=>{captureOptions=options;captured=node.innerHTML;return {toDataURL:()=> 'data:image/jpeg;base64,x'};}};
  const view=installNotebookExportView({documentRef,windowRef,idPrefix:'contractExport',historyKey:'contract-export',documentBuilder:()=>'<article>Complete contract'+ '<p>Clause</p>'.repeat(2000)+'<p>Last clause and signatures</p></article>'});
  view.open({title:'قرارداد نقاشی + پیمانکار',items:[]});
  assert.equal(ids.contractExportTitle.textContent,'قرارداد نقاشی + پیمانکار');
  assert.equal(opened,'contract-export');
  assert.equal(ids.contractExportNumbered.label.hidden,true);
  assert.equal(ids.contractExportCost.label.hidden,true);
  assert.equal(ids.contractExportToolbar.children.length,1);
  assert.deepEqual(ids.contractExportToolbar.children[0].children.map(x=>x.textContent),['PDF','JPEG']);
  assert.doesNotMatch(ids.contractExportBody.innerHTML,/data-export-key|export-row/);
  ids.contractExportNote.value='Final note';
  view.printPdf();assert.match(printed,/Complete contract/);assert.match(printed,/Final note/);
  await view.saveJpeg();assert.match(captured,/Complete contract/);assert.match(download,/\.jpg$/);
  assert.match(printed,/Last clause and signatures/);assert.match(captured,/Last clause and signatures/);
  assert.equal(captureOptions.height,30000);assert.equal(captureOptions.width,800);
  assert.ok(captureOptions.height*captureOptions.scale<=16384);
  assert.ok(captureOptions.width*captureOptions.height*captureOptions.scale**2<=16000001);
});
