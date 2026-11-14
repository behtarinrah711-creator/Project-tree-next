import test from 'node:test';
import assert from 'node:assert/strict';


const make=tag=>({tag,children:[],dataset:{},className:'',
  append(...children){this.children.push(...children);},
  appendChild(child){this.append(child);},
  prepend(child){this.children=[child,...this.children.filter(node=>node!==child)];},
  replaceChildren(...children){this.children=children;},
  setAttribute(){},
  addEventListener(type,fn){this[type]=fn;},
  remove(){},
});

test('saved addenda use the contract card layout and their own status, number and history',async()=>{
  const oldWindow=globalThis.window;
  globalThis.window={location:{hash:'',search:''}};
  const {renderContractAddenda}=await import('./contractAddendaView.js');
  const {projectRepository}=await import('../../data/projectRepository.js');
  const {contactApi}=await import('../../domain/contactApi.js');
  const old=[oldWindow,globalThis.document,projectRepository.find,contactApi.lookup];
  const parent={id:'c',contractNo:'CTR-1',contractorId:'person',projectItemPath:'تصفیه خانه / فونداسیون',status:'final'};
  const draft={id:'a',parentContractId:'c',contractNo:'CTR-1-A01',createdAt:1000,isDraft:true,
    approvalHistory:[{action:'create',at:1000,actor:{name:'سازنده الحاقیه'}}]};
  const accepted={...draft,isDraft:false,status:'final',approvalStatus:'approved',accountingStatus:'accepted',
    signedAt:2000,sentToAccountingAt:3000,amount:100,
    accountingPackage:{contract:{parentDocument:parent},signedFiles:[{id:'file'}]},
    financeHistory:[{action:'approve_finance',at:4000,actor:{name:'مالی'}}]};
  const project={id:'p',tasks:[],contracts:[parent],contractAddenda:[draft]};
  globalThis.document={createElement:make};
  projectRepository.find=()=>project;
  contactApi.lookup=()=>({firstName:'جواد',lastName:'قریشی'});
  try{
    for(const finance of [false,true]){
      project.contractAddenda=[finance?accepted:draft];
      const body=make('div');
      renderContractAddenda(body,'p',{finance});
      const card=body.children[0].children.at(-1);
      const [heading,status]=card.children;
      assert.equal(heading.className,'contract-card-heading');
      assert.equal(typeof heading.onclick,'function');
      assert.equal(heading.children[0].tabIndex,0);
      let menuClickStopped=false;
      heading.children[2].onclick({stopPropagation(){menuClickStopped=true;}});
      assert.ok(menuClickStopped);
      assert.deepEqual(heading.children.map(node=>node.className),['contract-main','contract-created','contract-actions']);
      assert.deepEqual(heading.children[0].children.map(node=>node.textContent),
        ['الحاقیه قرارداد پیمانکاری جواد قریشی','CTR-1-A01','تصفیه خانه ← فونداسیون']);
      assert.equal(status.children[0].textContent,finance?'وضعیت: تأیید شده توسط بخش مالی':'وضعیت: ناقص');
      assert.equal(status.children.at(-1).textContent,'مشاهده قرارداد اصلی');
      const progress=card.children.find(node=>node.className==='contract-progress');
      if(finance){
        assert.equal(progress,undefined);
        assert.equal(status.className,'contract-workflow-row contract-workflow-row--signed-addendum');
        assert.deepEqual(status.children.slice(1).map(node=>node.textContent),['نسخه امضا شده الحاقیه','مشاهده قرارداد اصلی']);
        assert.equal(typeof status.children[1].onclick,'function');
        assert.ok(!card.children.some(node=>node.className.includes('contract-signed-section')));
      }else{
        assert.equal(progress,card.children[2]);
        assert.equal(progress.children.filter(node=>node.className.includes('is-complete')).length,1);
      }
      assert.equal(card.children.at(-1).className,'contract-history');
    }
    project.contractAddenda=[{...accepted,accountingStatus:'rejected',sentToAccountingAt:null,signedAt:null,
      signedFiles:accepted.accountingPackage.signedFiles,financeRejection:{reason:'اسکن ناقص است'}}];
    for(const finance of [false,true]){
      const body=make('div');
      renderContractAddenda(body,'p',{finance});
      const card=body.children[0].children.at(-1);
      const toolbar=card.children[1];
      const status=toolbar.children.find(node=>node.className.includes('contract-status-badge'));
      assert.equal(status.textContent,'وضعیت: توسط مالی رد شد');
      assert.ok(status.className.includes('is-unapproved'));
      if(!finance){
        assert.ok(toolbar.children.some(node=>node.textContent==='نسخه امضاشده الحاقیه'));
        assert.ok(toolbar.children.some(node=>node.textContent==='لغو اعلام تکمیل' && node.className.includes('danger')));
        const progress=card.children.find(node=>node.className==='contract-progress');
        assert.ok(progress.children.at(-1).className.includes('is-rejected'));
      }
    }
    project.contractAddenda=[{...accepted,accountingStatus:'sent',signedFiles:accepted.accountingPackage.signedFiles}];
    for(const readOnly of [false,true]){
      if(readOnly)window.KarhaSaosaWorkspaceAccess={p:{role:'member',permissions:{modules:{contracts:'view',accounting:'full'}}}};
      const body=make('div');
      renderContractAddenda(body,'p');
      const card=body.children[0].children.at(-1);
      const toolbar=card.children[1];
      assert.equal(toolbar.children[0].textContent,'نسخه امضاشده الحاقیه');
      assert.ok(toolbar.children.some(node=>node.textContent==='وضعیت: ارسال شده به مالی'));
      assert.ok(toolbar.children.some(node=>node.textContent==='مشاهده قرارداد اصلی'));
      const withdraw=toolbar.children.find(node=>node.textContent==='× پس گرفتن از مالی');
      assert.equal(!!withdraw,!readOnly);
      if(withdraw)assert.ok(withdraw.className.includes('danger'));
      assert.ok(!card.children.some(node=>node.className.includes('contract-signed-section')));
    }
    delete window.KarhaSaosaWorkspaceAccess;
    window.firebase={auth:()=>({currentUser:{uid:'reviewer',phoneNumber:'0912'}})};
    project.contacts=[{id:'reviewer-contact',phones:['0912']}];
    const ready={...draft,status:'final',isDraft:false,contractApproverContactIds:['reviewer-contact']};
    const pending={...ready,id:'pending',approvalStatus:'pending',approvalContactIds:['reviewer-contact'],approvedContactIds:[],submittedBy:{id:'reviewer'}};
    project.contractAddenda=[ready,pending];
    const body=make('div');
    renderContractAddenda(body,'p');
    const [list]=body.children;
    assert.equal(body.children.length,1);
    assert.equal(list.children.length,2);
    const readyBadge=list.children[0].children[1].children[0];
    assert.equal(readyBadge.textContent,'وضعیت: در انتظار تأیید');
    assert.ok(readyBadge.className.includes('is-incomplete'));
    const legacyCard=list.children[0];
    assert.ok(!legacyCard.children.some(row=>row.children.some(node=>['اعلام تکمیل','تأیید الحاقیه'].includes(node.textContent))));
    const menuActions=card=>{
      const wrap=card.children[0].children[2].children[0];
      wrap.children[0].onclick({stopPropagation(){}});
      return wrap.children.find(node=>node.className==='nb-project-menu').children.map(node=>node.title);
    };
    assert.deepEqual(menuActions(legacyCard),['ویرایش','خروجی','حذف']);
    assert.deepEqual(menuActions(list.children[1]),['خروجی']);
    const pendingCard=list.children[1];
    assert.ok(!pendingCard.children.some(row=>row.children.some(node=>node.textContent==='تأیید الحاقیه')));
    const withdraw=pendingCard.children[1].children.find(node=>node.textContent==='× پس گرفتن از مسئول تأیید');
    assert.ok(withdraw?.className.includes('danger'));
    window.KarhaSaosaWorkspaceAccess={p:{role:'member',permissions:{modules:{contracts:'view'}}}};
    renderContractAddenda(body,'p');
    assert.equal(body.children.length,1);
    assert.deepEqual(menuActions(body.children[0].children[0]),['خروجی']);
    assert.ok(body.children[0].children.every(card=>!card.children.some(row=>row.children.some(node=>node.textContent==='تأیید الحاقیه'))));
    delete window.KarhaSaosaWorkspaceAccess;
    project.contacts.push({id:'first',name:'مسئول اول',phones:['0913']});
    project.contacts[0].name='مسئول دوم';
    project.contractAddenda=[{...pending,approvalContactIds:['first','reviewer-contact'],approvedContactIds:['first']}];
    renderContractAddenda(body,'p');
    assert.equal(body.children.length,1);
    const card=body.children[0].children[0];
    assert.deepEqual(card.children.find(node=>node.className.includes('contract-addendum-reviewers')).children.map(node=>node.textContent),
      ['مسئول اول · تأیید کرد','مسئول دوم · در انتظار تأیید']);
    const approvalStep=card.children.find(node=>node.className==='contract-progress').children.find(node=>node.dataset.step==='approved');
    assert.ok(!approvalStep.className.includes('is-complete'));
    project.contractAddenda=[draft,{...ready,id:'deleted',trashed:true}];
    window.KarhaSaosaWorkspaceAccess={p:{role:'member',permissions:{modules:{contracts:'create'}}}};
    renderContractAddenda(body,'p');
    assert.equal(body.children[0].children.length,1);
    assert.deepEqual(menuActions(body.children[0].children[0]),['ویرایش','خروجی']);
  }finally{[globalThis.window,globalThis.document,projectRepository.find,contactApi.lookup]=old;}
});

test('finance approval shows a failed save on the card and rerenders an accepted addendum after a successful save',async t=>{
  const original={window:globalThis.window,document:globalThis.document};
  t.after(()=>Object.assign(globalThis,original));
  const parent={id:'c',contractNo:'CTR-1',amount:1000};
  const addendum={id:'addendum-00000000-0000-4000-8000-000000000001',parentContractId:'c',contractNo:'CTR-1-A01',
    createdAt:1,updatedAt:10,handoffVersion:2,status:'final',approvalStatus:'approved',amount:100,accountingStatus:'sent',
    sentToAccountingAt:9,accountingPackage:{contract:{amount:100,parentDocument:parent},signedFiles:[]}};
  const accepted={...addendum,accountingStatus:'accepted',updatedAt:11,handoffVersion:3};
  const projects=[{id:'p',contracts:[parent],contractAddenda:[addendum]}];
  const permissions={p:{role:'member',permissions:{modules:{'accounting-contracts':'full'}}}};
  globalThis.window={
    location:{hash:'',search:''},
    localStorage:{getItem:()=>JSON.stringify({token:'test',phone:'0912',expiresAt:Date.now()+60000})},
    KarhaAppData:{getProjects:()=>projects,setProjects:value=>value},
    KarhaSaosaWorkspaceAccess:permissions,
    dispatchEvent(){},
  };
  const controls=Object.fromEntries(['confirmOverlay','confirmText','confirmOkBtn','confirmCancelBtn'].map(id=>
    [id,{classList:new Set(['hidden'])}]));
  controls.confirmOverlay.classList.remove=controls.confirmOverlay.classList.delete;
  globalThis.document={createElement:tag=>({...make(tag),remove(){
    if(this.parent)this.parent.children=this.parent.children.filter(node=>node!==this);
  },appendChild(child){child.parent=this;this.children.push(child);}}),getElementById:id=>controls[id]};
  const {installConfirmBindings}=await import('../../ui/confirm.js');
  const {renderAccountingContracts}=await import('../accounting/accountingContracts.js');
  installConfirmBindings({documentRef:document});
  const mock=t.mock.method(globalThis,'fetch',async(url,request)=>{
    assert.equal(url,'/api/v1/projects/p/addenda/'+addendum.id+'/handoff');
    assert.deepEqual(JSON.parse(request.body),{action:'approve_finance',version:2,updatedAt:10});
    return mock.mock.callCount()===0
      ? {ok:false,json:async()=>({message:'ارتباط قطع شد؛ دوباره تلاش کنید'})}
      : {ok:true,json:async()=>({contract:accepted})};
  });

  const body=make('div');
  renderAccountingContracts(body,'p');
  assert.equal(body.children.length,1);
  const documents=body.children[0].children[0].children[1];
  assert.equal(documents.children[1].hidden,false);
  assert.equal(documents.children[1].children.at(-1).children.length,1);
  const {renderAddendumCard}=await import('./contractAddendaView.js');
  const card=()=>renderAddendumCard(projects[0],projects[0].contractAddenda[0],()=>renderAccountingContracts(body,'p'),true);
  let detail=card();
  const actions=()=>detail.children.find(node=>node.className.includes('contract-finance-actions'));
  const approve=actions().children[0];
  assert.equal(approve.textContent,'تأیید الحاقیه');
  const confirmApproval=async()=>{
    approve.onclick();
    assert.equal(controls.confirmOverlay.classList.has('hidden'),false);
    controls.confirmOkBtn.onclick();
    await new Promise(resolve=>setImmediate(resolve));
  };

  await confirmApproval();
  assert.equal(projects[0].contractAddenda[0].accountingStatus,'sent');
  assert.equal(actions().children.at(-1).textContent,'ارتباط قطع شد؛ دوباره تلاش کنید');
  assert.equal(approve.disabled,false);

  await confirmApproval();
  assert.equal(mock.mock.callCount(),2);
  assert.equal(projects[0].contractAddenda[0].accountingStatus,'accepted');
  detail=card();
  assert.equal(detail.children[1].children[0].textContent,'وضعیت: تأیید شده توسط بخش مالی');
  assert.ok(!actions().children.some(node=>node.textContent==='تأیید الحاقیه'));
  assert.match(detail.children[2].textContent,/جمع الحاقیه‌های تأییدشده: ۱۰۰ تومان/);

  permissions.p.permissions.modules['accounting-contracts']='view';
  projects[0].contractAddenda=[addendum];
  renderAccountingContracts(body,'p');
  detail=card();
  assert.equal(actions().children.length,0);
});
