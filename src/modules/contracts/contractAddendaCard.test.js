import test from 'node:test';
import assert from 'node:assert/strict';


const make=tag=>({tag,children:[],dataset:{},className:'',
  append(...children){this.children.push(...children);},
  appendChild(child){this.append(child);},
  replaceChildren(...children){this.children=children;},
  setAttribute(){},
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
      assert.equal(status.children[1].textContent,finance?'مشاهده قرارداد اصلی':'نسخه اصلی قرارداد');
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
      assert.equal(toolbar.children[0].textContent,'وضعیت: توسط مالی رد شد');
      assert.ok(toolbar.children[0].className.includes('is-unapproved'));
      if(!finance){
        assert.ok(toolbar.children.some(node=>node.textContent==='نسخه امضاشده الحاقیه'));
        assert.ok(toolbar.children.some(node=>node.textContent==='لغو اعلام تکمیل' && node.className.includes('danger')));
        const progress=card.children.find(node=>node.className==='contract-progress');
        assert.ok(progress.children.at(-1).className.includes('is-rejected'));
      }
    }
  }finally{[globalThis.window,globalThis.document,projectRepository.find,contactApi.lookup]=old;}
});
