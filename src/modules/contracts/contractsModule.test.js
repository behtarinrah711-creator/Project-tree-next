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


function readStatusSheet(render,make){
  const root=make();root.classList={add(){}};
  const card=render(options=>options.body(root));
  card.children[0].children.find(node=>node.className.split(' ').includes('today-progress-circle')).click({stopPropagation(){}});
  return root;
}

test('only contract writers can register documents and linked records remain visible to readers',async()=>{
  const {renderContractCard}=await import('./contractsModule.js');
  const previousWindow=globalThis.window,previousDocument=globalThis.document;
  const make=()=>({children:[],dataset:{},append(...nodes){this.children.push(...nodes);},
    appendChild(node){this.children.push(node);},replaceChildren(...nodes){this.children=nodes;},setAttribute(){},addEventListener(type,handler){this[type]=handler;}});
  globalThis.window={location:{hash:''}};
  globalThis.document={createElement:make};
  const project={id:'p',tasks:[]};
  window.KarhaAppData={getProjects:()=>[project]};
  const contract={id:'c',contractNo:'CTR-1',status:'final',isDraft:false,approvalStatus:'approved',contractApproverContactIds:[],signedAt:1,signedFiles:[{id:'signed'}],sentToAccountingAt:2,accountingStatus:'accepted',accountingPackage:{contract:{id:'c'},signedFiles:[{id:'signed'}]}};
  const addendaRow=card=>card.children.find(node=>node.className==='contract-addenda-row');
  const shortcut=record=>addendaRow(renderContractCard(project,record))?.children[0].children
    .find(node=>node.textContent==='ثبت سند');
  try{
    assert.equal(shortcut(contract).type,'button');
    assert.equal(shortcut({...contract,status:'draft',isDraft:true,accountingStatus:null}),undefined);
    assert.equal(shortcut({...contract,contractNo:'',accountingStatus:null}),undefined);
    window.firebase={auth:()=>({currentUser:{uid:'reviewer',phoneNumber:'0912'}})};
    project.contacts=[{id:'me',phone:'0912'}];
    const pending={...contract,accountingStatus:null,sentToAccountingAt:null,accountingPackage:null,signedAt:null,signedFiles:[],approvalStatus:'pending',approvalContactIds:['me','other'],
      contractApproverContactIds:['me','other'],approvedContactIds:['me'],submittedBy:{id:'reviewer'}};
    assert.equal(shortcut({...contract,accountingStatus:'sent'}),undefined);
    const status=readStatusSheet(openStatusSheet=>renderContractCard(project,pending,{openStatusSheet}),make);
    assert.deepEqual(status.children.map(node=>node.textContent),
      ['مسئول تأیید · تأیید کرد','مسئول تأیید · در انتظار تأیید','پس‌گرفتن از تأیید']);
    window.KarhaSaosaWorkspaceAccess={p:{role:'member',permissions:{modules:{contracts:'view',accounting:'full'}}}};
    assert.equal(shortcut(contract),undefined);
    project.contractAddenda=[
      {id:'a',parentContractId:'c',contractNo:'CTR-1-A01',isDraft:true},
      {id:'b',parentContractId:'other',contractNo:'CTR-2-A01',isDraft:true},
      {id:'old',parentContractId:'c',contractNo:'CTR-1-A02',trashed:true},
    ];
    const card=renderContractCard(project,contract);
    assert.deepEqual(card.children.map(node=>node.className),
      ['contract-card-heading','contract-workflow-panel','contract-addenda-row']);
    const [toolbar,list]=addendaRow(card).children;
    assert.deepEqual(toolbar.children.map(node=>node.textContent),['اسناد (۱)']);
    assert.equal(list.hidden,false);
    const nested=list.children.find(node=>node.className==='contract-row');
    assert.equal(nested.children[0].children[0].children[0].textContent,'الحاقیه شماره ۱');
    assert.ok(!nested.children[0].children.find(node=>node.className==='contract-card-visible-actions').children.some(node=>['ویرایش','حذف'].includes(node.textContent)));
    toolbar.children[0].onclick({stopPropagation(){}});
    assert.equal(list.hidden,true);
  }finally{globalThis.window=previousWindow;globalThis.document=previousDocument;}
});


test('active contract sheets contain only stage actions and history opens separately',async()=>{
  const {renderContractCard}=await import('./contractsModule.js');
  const previous=[globalThis.window,globalThis.document];
  const make=tag=>({tag,className:'',children:[],dataset:{},append(...nodes){this.children.push(...nodes);},appendChild(node){this.children.push(node);},setAttribute(){},addEventListener(type,handler){this[type]=handler;}});
  globalThis.document={createElement:make};globalThis.window={location:{hash:''}};
  const project={id:'p',tasks:[]};
  const base={id:'c',contractNo:'CTR-1',status:'final',approvalStatus:'approved'};
  const file={id:'f',name:'signed.jpg',mime:'image/jpeg'};
  const nodes=root=>[root,...root.children.flatMap(nodes)];
  function render(record){
    let opened;
    const card=renderContractCard(project,{...base,...record},{openSignedSheet:(source,record,options)=>{opened={upload:true,record,options};},openStatusSheet:options=>{const root=make('div');root.classList={add(){}};options.body(root);opened={title:options.title,root};}});
    return {card,openStage(id){const stage=id?nodes(card).find(n=>n.dataset.step===id)?.children[0]:nodes(card).find(n=>n.className.includes('contract-progress-step') && !n.className.includes('is-complete'))?.children[0];stage?.onclick({stopPropagation(){}});return opened;},get opened(){return opened;}};
  }
  const labels=sheet=>nodes(sheet.root).filter(n=>n.tag==='button').map(n=>n.textContent);
  try{
    assert.deepEqual(labels(render({status:'draft',isDraft:true}).openStage()),['ویرایش و تکمیل قرارداد']);
    const upload=render({}).openStage();
    assert.equal(upload.upload,true);
    assert.equal(upload.record.id,'c');
    const signed={signedAt:1,signedFiles:[file]};
    assert.deepEqual(labels(render(signed).openStage()),['ارسال به واحد مالی']);
    const sent={...signed,accountingStatus:'sent',sentToAccountingAt:2,accountingPackage:{contract:base,signedFiles:[file]}};
    assert.deepEqual(labels(render(sent).openStage()),[]);
    assert.deepEqual(labels(render(sent).openStage('finance')),['پس‌گرفتن از مالی']);
    for(const record of [{status:'draft',isDraft:true},signed,sent]){
      const sheet=render(record).openStage();
      assert.ok(!nodes(sheet.root).some(n=>['contract-progress','contract-history','contract-status-badge'].includes(n.className)));
    }
    const completed=render({...sent,accountingStatus:'accepted'});
    assert.equal(nodes(completed.card).filter(n=>n.className==='contract-stage-button' && !n.disabled).length,5);
    const history=nodes(completed.card).find(n=>n.tag==='button' && n.textContent==='تاریخچه');
    history.onclick({stopPropagation(){}});
    assert.equal(completed.opened.title,'تاریخچه');
    assert.deepEqual(completed.opened.root.children.map(n=>n.className),['contract-history']);
    assert.equal(completed.opened.root.children[0].open,true);
    window.KarhaSaosaWorkspaceAccess={p:{role:'member',permissions:{modules:{contracts:'view',accounting:'full'}}}};
    assert.deepEqual(labels(render({status:'draft',isDraft:true}).openStage()),[]);
    assert.deepEqual(labels(render(signed).openStage()),[]);
  }finally{[globalThis.window,globalThis.document]=previous;}
});
