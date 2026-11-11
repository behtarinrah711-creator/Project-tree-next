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
  card.children[0].children.find(node=>node.className==='today-progress-circle').click({stopPropagation(){}});
  return root.children[0];
}

test('only contract writers see the addendum shortcut on completed report cards',async()=>{
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
    .find(node=>node.textContent==='ایجاد الحاقیه');
  try{
    assert.equal(shortcut(contract).type,'button');
    assert.equal(shortcut({...contract,status:'draft',isDraft:true}),undefined);
    assert.equal(shortcut({...contract,contractNo:''}),undefined);
    window.firebase={auth:()=>({currentUser:{uid:'reviewer',phoneNumber:'0912'}})};
    project.contacts=[{id:'me',phone:'0912'}];
    const pending={...contract,accountingStatus:null,sentToAccountingAt:null,accountingPackage:null,signedAt:null,signedFiles:[],approvalStatus:'pending',approvalContactIds:['me','other'],
      approvedContactIds:['me'],submittedBy:{id:'reviewer'}};
    assert.equal(shortcut({...contract,accountingStatus:'sent'}),undefined);
    const status=readStatusSheet(openStatusSheet=>renderContractCard(project,pending,{openStatusSheet}),make);
    assert.deepEqual(status.children.map(node=>node.textContent),
      ['وضعیت: تکمیل و برای مسئول تایید ارسال شد | گام بعد: صبور باشید','پس‌گرفتن از تأیید']);
    window.KarhaSaosaWorkspaceAccess={p:{role:'member',permissions:{modules:{contracts:'view',accounting:'full'}}}};
    assert.equal(shortcut(contract),undefined);
    project.contractAddenda=[
      {id:'a',parentContractId:'c',contractNo:'CTR-1-A01',isDraft:true},
      {id:'b',parentContractId:'other',contractNo:'CTR-2-A01',isDraft:true},
      {id:'old',parentContractId:'c',contractNo:'CTR-1-A02',trashed:true},
    ];
    const card=renderContractCard(project,contract);
    assert.deepEqual(card.children.map(node=>node.className),
      ['contract-card-heading','contract-addenda-row']);
    const [toolbar,list]=addendaRow(card).children;
    assert.deepEqual(toolbar.children.map(node=>node.textContent),['الحاقیه‌ها (۱)']);
    toolbar.children[0].onclick();
    assert.equal(list.children.length,1);
    assert.equal(list.children[0].children[0].children[0].children[1].textContent,'CTR-1-A01');
  }finally{globalThis.window=previousWindow;globalThis.document=previousDocument;}
});


test('contract card explains each normal workflow stage and removes the next step after finance approval',async()=>{
  const {renderContractCard}=await import('./contractsModule.js');
  const previousWindow=globalThis.window,previousDocument=globalThis.document;
  const make=()=>({children:[],dataset:{},append(...nodes){this.children.push(...nodes);},
    appendChild(node){this.children.push(node);},setAttribute(){},addEventListener(type,handler){this[type]=handler;}});
  globalThis.document={createElement:make};
  globalThis.window={location:{hash:''}};
  const project={id:'p',tasks:[]};
  const base={id:'c',contractNo:'CTR-1',status:'final',approvalStatus:'approved'};
  const file={id:'f',name:'signed.jpg',mime:'image/jpeg'};
  const signed={signedAt:1,signedFiles:[file]};
  const sent={...signed,accountingStatus:'sent',sentToAccountingAt:2,accountingPackage:{contract:base,signedFiles:[file]}};
  const texts=contract=>readStatusSheet(openStatusSheet=>renderContractCard(project,{...base,...contract},{openStatusSheet}),make).children
    .filter(node=>node.className?.includes('contract-status-badge'))
    .map(node=>node.textContent);
  try{
    for(const reviewed of [false,true]){
      const approvalContactIds=reviewed?['reviewer']:[];
      const check=(contract,label,step)=>assert.deepEqual(texts({...contract,approvalContactIds}),
        ['وضعیت: '+label+(step?' | گام بعد: '+step:'')]);
      check({status:'draft',isDraft:true},'ناقص','قرارداد را ویرایش و تکمیل کنید');
      if(reviewed)check({approvalStatus:'pending'},'تکمیل و برای مسئول تایید ارسال شد','صبور باشید');
      check({},reviewed?'تکمیل و تایید شد':'تکمیل شد','نسخه امضا شده قرارداد را بارگذاری کنید');
      check(signed,reviewed?'تکمیل، تایید، امضا و بارگذاری شد':'تکمیل، امضا و بارگذاری شد','ارسال به بخش مالی');
      check(sent,'در انتظار تایید بخش مالی','صبور باشید');
      check({...sent,accountingStatus:'accepted'},reviewed?'تکمیل، تایید، امضا، بارگذاری و ثبت مالی شد':'تکمیل، امضا، بارگذاری و ثبت مالی شد');
    }
    assert.deepEqual(texts({status:'draft',isDraft:true,approvalStatus:'unapproved',approvalRejectionReason:'نیاز به اصلاح'}),['وضعیت: ناقص']);
    assert.deepEqual(texts({accountingStatus:'rejected',financeRejection:{reason:'صفحه ناقص است'}}),['وضعیت: تأیید شده است']);
  }finally{globalThis.window=previousWindow;globalThis.document=previousDocument;}
});
