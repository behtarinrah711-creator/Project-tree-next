import test from 'node:test';
import assert from 'node:assert/strict';


const make=tag=>({tag,children:[],dataset:{},className:'',
  append(...children){this.children.push(...children);},
  appendChild(child){this.append(child);},
  prepend(child){this.children=[child,...this.children.filter(node=>node!==child)];},
  replaceChildren(...children){this.children=children;},
  setAttribute(){},
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
      assert.equal(status.children[0].textContent,finance?'نسخه امضا شده الحاقیه':'وضعیت: ناقص');
      assert.equal(status.children[1].textContent,'مشاهده قرارداد اصلی');
      const progress=card.children.find(node=>node.className==='contract-progress');
      if(finance){
        assert.equal(progress,undefined);
        assert.equal(status.className,'contract-workflow-row contract-workflow-row--signed-addendum');
        assert.deepEqual(status.children.map(node=>node.className),['contract-review-action','contract-review-action']);
        assert.equal(typeof status.children[0].onclick,'function');
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
    const [banner,list]=body.children;
    assert.equal(banner.textContent,'۱ الحاقیه منتظر تأیید شما ‹');
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
    banner.onclick();
    assert.equal(body.children[1].children.length,1);
    assert.ok(body.children[1].children[0].children[2].children.some(node=>node.textContent==='تأیید الحاقیه'));
    const withdraw=body.children[1].children[0].children[1].children.find(node=>node.textContent==='× پس گرفتن از مسئول تأیید');
    assert.ok(withdraw?.className.includes('danger'));
    body.children[0].onclick();
    assert.equal(body.children[1].children.length,2);
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
    assert.equal(body.children[0].textContent,'۱ الحاقیه منتظر تأیید شما ‹');
    const card=body.children[1].children[0];
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
