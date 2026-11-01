import { test } from 'node:test';
import assert from 'node:assert/strict';

test('contracts renderer wires the real list Add button to the contract form', async () => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  let openedWith = 'not-called';
  const add = {};
  const body = { innerHTML: '' };

  globalThis.window = {
    location: { hash: '' },
    KarhaLegacy: { openContractForm(id){ openedWith = id; } }
  };
  globalThis.document = {
    getElementById(id){
      if(id === 'contractAddBtn') return add;
      if(id === 'contractsPageBody') return body;
      return null;
    }
  };

  try {
    const { default: contractsModule } = await import('./contractsModule.js');
    contractsModule.render();
    assert.equal(typeof add.onclick, 'function');
    add.onclick();
    assert.equal(openedWith, null);
  } finally {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
  }
});

test('contract registration timestamp has separate date/time parts and no registration label', async () => {
  const { contractCreatedParts, contractCreatedLabel } = await import('./contractsModule.js');
  const value = Date.UTC(2026, 7, 29, 12, 34);
  const parts = contractCreatedParts(value);
  assert.ok(parts?.date);
  assert.ok(parts?.time);
  assert.doesNotMatch(contractCreatedLabel(value), /ثبت:/);
  assert.equal(contractCreatedParts(null), null);
});

test('template search removes unmatched rows, normalizes Persian letters and restores all rows on clear',async()=>{
  const {projectRepository}=await import('../../data/projectRepository.js');
  const {contractsModule}=await import('./contractsModule.js');
  const previous=projectRepository.getActiveProject,previousDocument=globalThis.document;
  const make=()=>({children:[],dataset:{},events:{},append(...nodes){this.children.push(...nodes);},appendChild(node){this.children.push(node);},replaceChildren(...nodes){this.children=nodes;},addEventListener(name,fn){this.events[name]=fn;}});
  const body=make();
  projectRepository.getActiveProject=()=>({id:'p',contractTemplates:[{id:'a',title:'قرارداد کناف کاری',items:[]},{id:'b',title:'قرارداد پیمانکاری',items:[]},{id:'c',title:'تست',items:[]}]});
  globalThis.document={createElement:make,getElementById:id=>id==='contractTemplatesPageBody'?body:null};
  try{
    contractsModule.renderTemplates('p');
    const input=body.children[1].children[0],list=body.children[2];
    assert.equal(list.children.length,3);
    input.value='كناف';input.events.input();
    assert.equal(list.children.length,1);
    assert.match(list.children[0].dataset.searchText,/کناف/);
    input.value='ناموجود';input.events.input();
    assert.equal(list.children[0].className,'contract-empty');
    input.value='';input.events.input();
    assert.equal(list.children.length,3);
  }finally{projectRepository.getActiveProject=previous;globalThis.document=previousDocument;}
});
