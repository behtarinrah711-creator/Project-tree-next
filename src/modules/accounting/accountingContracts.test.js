import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
globalThis.window={location:{hash:'',search:''}};
const {renderAccountingContracts}=await import('./accountingContracts.js');
const {contractCreatedParts,renderContractCard}=await import('../contracts/contractsModule.js');
const {projectRepository}=await import('../../data/projectRepository.js');
const {contactApi}=await import('../../domain/contactApi.js');
const {activityApi}=await import('../../domain/activityApi.js');
const make=tag=>({tag,children:[],dataset:{},className:'',append(...nodes){nodes.forEach(n=>this.appendChild(n));},appendChild(n){this.children.push(n);},replaceChildren(...nodes){this.children=nodes;},setAttribute(){},addEventListener(){}});
const shape=node=>({tag:node.tag,className:node.className,text:node.textContent,children:node.children.map(shape)});
test('finance contracts use the report card header with only financial decision actions and financial history',()=>{
  const old=[projectRepository.find,contactApi.lookup,activityApi.lookup,globalThis.document];
  globalThis.document={createElement:make};
  const c={id:'c',title:'قرارداد پیمانکاری',contractNo:'CTR-1',activityId:'a',contractorId:'person',createdAt:1700000000000,status:'final',approvalStatus:'approved',signedAt:1,signedFiles:[{id:'image'}],accountingStatus:'sent',sentToAccountingAt:2,accountingPackage:{contract:{id:'c'},signedFiles:[{id:'image'}]}};
  c.projectItemId='columns';c.workTaskId='reinforce';c.projectItemPath='مسیر قدیمی';
  c.approvalHistory=[{action:'create',at:1,actor:{name:'سازنده'}},{action:'complete',at:2,actor:{name:'تنظیم کننده'}},{action:'send_finance',at:3,actor:{name:'ارسال کننده'}}];
  const p={id:'p',tasks:[{id:'shed',text:'سوله موجود',subtasks:[{id:'columns',text:'اجرای ستون‌ها',workTasks:[{id:'reinforce',title:'بستن میلگرد ستون'}]}]}],contracts:[c,{id:'unsent',status:'draft'}]};
  projectRepository.find=()=>p;contactApi.lookup=()=>({firstName:'جواد',lastName:'قریشی'});activityApi.lookup=()=>({name:'اجرای فونداسیون'});
  try{
    const report=renderContractCard(p,c),body=make('body');renderAccountingContracts(body,'p');
    assert.equal(body.children[0].className,'contract-list');assert.equal(body.children[0].children.length,1);
    const finance=body.children[0].children[0];
    assert.equal(finance.className,report.className);
    const heading=report.children.find(n=>n.className==='contract-card-heading');
    const [main,progress,details,menu]=heading.children;
    assert.equal(main.className,'contract-main');
    assert.deepEqual(main.children.map(n=>n.textContent),['قرارداد پیمانکاری جواد قریشی','CTR-1']);
    assert.equal(progress.className,'today-progress-circle');
    assert.equal(details.className,'contract-heading-details');
    assert.equal(details.children[0].textContent,'سوله موجود ← اجرای ستون‌ها ← بستن میلگرد ستون');
    const {time,date}=contractCreatedParts(c.createdAt);
    assert.equal(details.children[1].textContent,time+' | '+date);
    assert.equal(menu.className,'contract-actions');
    assert.ok(report.dataset.searchText.includes('بستنمیلگردستون'));
    for(const name of ['contract-card-heading']){
      assert.deepEqual(shape(finance.children.find(n=>n.className===name)),shape(report.children.find(n=>n.className===name)));
    }
    assert.equal(finance.children.some(n=>n.className==='contract-progress' || n.className==='contract-workflow-row' || n.className==='contract-signed-section'),false);
    const actions=finance.children.find(n=>n.className.includes('contract-finance-actions')).children.map(n=>n.textContent);
    assert.deepEqual(actions,['تأیید قرارداد','رد قرارداد']);
    const history=finance.children.find(n=>n.className==='contract-history');assert.equal(history.children.filter(n=>n.className==='contract-history-entry').length,1);
    const menuWrap=finance.children[0].children.find(n=>n.className==='contract-actions').children[0];
    menuWrap.children[0].onclick({stopPropagation(){}});
    assert.deepEqual(menuWrap.children.find(n=>n.className==='nb-project-menu').children.map(n=>n.title),['خروجی']);
    const accepted={...c,accountingStatus:'accepted',accountingDecision:{actor:{id:'guest'}}};
    const acceptedReport=renderContractCard(p,accepted);
    assert.equal(acceptedReport.children.find(n=>n.className==='contract-workflow-row').children[0].textContent,'وضعیت: تأیید شده توسط بخش مالی');
    const acceptedFinance=renderContractCard(p,accepted,{finance:true});
    assert.deepEqual(acceptedFinance.children.find(n=>n.className.includes('contract-finance-actions')).children.map(n=>n.textContent),['پس‌گرفتن تأیید مالی']);
    const rejected=renderContractCard(p,{...c,status:'draft',isDraft:true,approvalStatus:null,accountingStatus:'rejected',signedAt:null,signedFiles:[],financeRejection:{reason:'صفحه ناقص است'}});
    assert.ok(rejected.children.find(n=>n.className==='contract-workflow-row').children.some(n=>n.textContent==='دلیل رد توسط بخش مالی: صفحه ناقص است'));
    const css=readFileSync(new URL('../../styles/features/contracts.css',import.meta.url),'utf8');
    assert.match(css,/:is\(#contractsPageBody,#accountingPageBody\) \.contract-row\{display:block/);
    assert.match(css,/:is\(#contractsPageBody,#accountingPageBody\) \.contract-card-heading\{display:grid/);
  }finally{[projectRepository.find,contactApi.lookup,activityApi.lookup,globalThis.document]=old;}
});
