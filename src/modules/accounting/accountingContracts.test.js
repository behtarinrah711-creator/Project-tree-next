import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
globalThis.window={location:{hash:'',search:''}};
const {renderAccountingContracts}=await import('./accountingContracts.js');
const {renderContractCard}=await import('../contracts/contractsModule.js');
const {projectRepository}=await import('../../data/projectRepository.js');
const {contactApi}=await import('../../domain/contactApi.js');
const {activityApi}=await import('../../domain/activityApi.js');
const make=tag=>({tag,children:[],dataset:{},className:'',append(...nodes){nodes.forEach(n=>this.appendChild(n));},appendChild(n){this.children.push(n);},replaceChildren(...nodes){this.children=nodes;},setAttribute(){},addEventListener(){}});
const shape=node=>({tag:node.tag,className:node.className,text:node.textContent,children:node.children.map(shape)});
test('finance contracts use the report card header, status, progress and history with their financial actions',()=>{
  const old=[projectRepository.find,contactApi.lookup,activityApi.lookup,globalThis.document];
  globalThis.document={createElement:make};
  const c={id:'c',title:'قرارداد پیمانکاری',contractNo:'CTR-1',activityId:'a',contractorId:'person',createdAt:1700000000000,status:'final',approvalStatus:'approved',signedAt:1,signedFiles:[{id:'image'}],accountingStatus:'sent',sentToAccountingAt:2,accountingPackage:{contract:{id:'c'},signedFiles:[{id:'image'}]}};
  const p={id:'p',contracts:[c,{id:'unsent',status:'draft'}]};
  projectRepository.find=()=>p;contactApi.lookup=()=>({firstName:'جواد',lastName:'قریشی'});activityApi.lookup=()=>({name:'اجرای فونداسیون'});
  try{
    const report=renderContractCard(p,c),body=make('body');renderAccountingContracts(body,'p');
    assert.equal(body.children[0].className,'contract-list');assert.equal(body.children[0].children.length,1);
    const finance=body.children[0].children[0];
    assert.equal(finance.className,report.className);
    for(const name of ['contract-card-heading','contract-workflow-row','contract-progress','contract-history']){
      assert.deepEqual(shape(finance.children.find(n=>n.className===name)),shape(report.children.find(n=>n.className===name)));
    }
    const actions=finance.children.find(n=>n.className==='contract-signed-section').children.map(n=>n.textContent);
    assert.ok(actions.includes('مشاهده قرارداد تنظیم‌شده'));assert.ok(actions.includes('پس‌گرفتن از مالی'));
    const css=readFileSync(new URL('../../styles/features/contracts.css',import.meta.url),'utf8');
    assert.match(css,/:is\(#contractsPageBody,#accountingPageBody\) \.contract-row\{display:block/);
    assert.match(css,/:is\(#contractsPageBody,#accountingPageBody\) \.contract-card-heading\{display:grid/);
  }finally{[projectRepository.find,contactApi.lookup,activityApi.lookup,globalThis.document]=old;}
});
