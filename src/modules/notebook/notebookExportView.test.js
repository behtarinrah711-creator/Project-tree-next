import test from 'node:test';
import assert from 'node:assert/strict';
import { createNotebookRepository } from '../../data/notebookRepository.js';
import { flattenNotebookItems, installNotebookExportView } from './notebookExportView.js';

test('export notes survive reopening, rerendering and repository reload per list',()=>{
  const saved=new Map();
  const storage={getItem:key=>saved.get(key),setItem:(key,value)=>saved.set(key,value)};
  const repository=createNotebookRepository({storage});
  repository.replace({lists:[
    {id:'a',title:'A',items:[]},
    {id:'b',title:'B',items:[]},
  ]});
  const elements=new Map();
  const element=()=>({
    value:'',checked:false,classList:{add(){},remove(){}},
    closest(){return {outerHTML:'<div class="export-note-wrap"></div>'};},
    append(){},replaceChildren(){},querySelector(){return {};},querySelectorAll(){return [];},
  });
  for(const name of ['Page','Title','Toolbar','Body','Numbered','Cost','Signature','SignatureHint','Note']){
    elements.set('notebookExport'+name,element());
  }
  // Rendering replaces the textarea, just as assigning body.innerHTML does in the browser.
  Object.defineProperty(elements.get('notebookExportBody'),'innerHTML',{set(){
    elements.set('notebookExportNote',element());
  }});
  const documentRef={getElementById:id=>elements.get(id),createElement:element};
  const windowRef={location:{href:'https://example.test/',hash:''}};
  let writes=0;
  const install=()=>installNotebookExportView({documentRef,windowRef,onNoteChange:(id,value)=>{
    writes++;
    repository.mutate(nb=>{
      const list=nb.lists.find(list=>list.id===id);
      list.exportNote=value;
      list.updatedAt=Date.now();
    });
  }});
  const open=(view,id)=>view.open(repository.get().lists.find(list=>list.id===id));
  const note=()=>elements.get('notebookExportNote');
  const type=value=>{note().value=value;note().oninput();};
  globalThis.localStorage={getItem:()=>null};
  try{
    let view=install();
    open(view,'a');
    assert.equal(note().value,'');
    assert.equal(writes,0);
    type('توضیح اول\nخط دوم');
    view.render();
    assert.equal(note().value,'توضیح اول\nخط دوم');
    type('آخرین ویرایش');
    view.close();
    open(view,'b');
    assert.equal(note().value,'');
    type('توضیح فهرست دوم');
    open(view,'a');
    assert.equal(note().value,'آخرین ویرایش');
    repository.load();
    view=install();
    open(view,'a');
    assert.equal(note().value,'آخرین ویرایش');
    type('');
    view.close();
    repository.load();
    open(view,'a');
    assert.equal(note().value,'');
    open(view,'b');
    assert.equal(note().value,'توضیح فهرست دوم');
    assert.equal(writes,4);
  }finally{
    delete globalThis.localStorage;
  }
});

test('notebook export preserves every visible hierarchy depth',()=>{
  const rows=flattenNotebookItems([
    {id:'a',text:'A',children:[{id:'b',text:'B',children:[{id:'c',text:'C',children:[]}]}]},
    {id:'done',text:'Done',done:true,children:[]},
    {id:'trash',text:'Trash',trashed:true,children:[]},
  ]);
  assert.deepEqual(rows.map(row=>[row.key,row.depth,row.path]),[
    ['a',0,[]],['b',1,['A']],['c',2,['A','B']],
  ]);
});

test('notebook export does not mutate its source',()=>{
  const items=[{id:'a',text:'A',children:[]}];
  const before=JSON.stringify(items);
  flattenNotebookItems(items);
  assert.equal(JSON.stringify(items),before);
});
