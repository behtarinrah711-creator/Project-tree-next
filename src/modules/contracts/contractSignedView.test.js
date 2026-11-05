import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.window={location:{hash:'',search:''}};
const {renderContractSignedSection}=await import('./contractSignedView.js');
const {contractProgressSteps}=await import('./contractProgressView.js');
class Node{constructor(tag){this.tag=tag;this.children=[];this.classList={add(){}};}appendChild(node){this.children.push(node);return node;}append(...nodes){this.children.push(...nodes);}}
const documentRef={createElement:tag=>new Node(tag)};
const labels=node=>node.children.filter(c=>c.tag==='button').map(c=>c.textContent);
const project={id:'p'};
const file={id:'f',name:'signed.jpg',mime:'image/jpeg'};
test('incomplete and approved cards offer the appropriate separate attachment and finance actions',()=>{
  globalThis.document=documentRef;
  let c={id:'c',status:'draft',isDraft:true};
  assert.equal(renderContractSignedSection(project,c),null);
  c={id:'c',status:'final',approvalStatus:'approved',contractApproverContactIds:[]};
  assert.deepEqual(labels(renderContractSignedSection(project,c)),['افزودن عکس یا PDF قرارداد']);
  c={...c,signedAt:1,signedFiles:[file]};
  assert.deepEqual(labels(renderContractSignedSection(project,c)),['نسخه امضاشده قرارداد','ارسال به واحد مالی']);
  assert.deepEqual(contractProgressSteps(c).map(s=>s.done),[true,true,true,false,false]);
  c={...c,sentToAccountingAt:2,accountingStatus:'sent',accountingPackage:{contract:{...c},signedFiles:[file]}};
  assert.deepEqual(labels(renderContractSignedSection(project,c)),['نسخه امضاشده قرارداد','پس‌گرفتن از مالی']);
  assert.deepEqual(contractProgressSteps(c).map(s=>s.done),[true,true,true,true,false]);
});
test('read-only project members cannot see mutation actions on signed or finance cards',()=>{
  globalThis.document=documentRef;window.KarhaSaosaWorkspaceAccess={p:{role:'member',permissions:{modules:{contracts:'view'}}}};
  const c={id:'c',status:'final',approvalStatus:'approved',signedAt:1,signedFiles:[file]};
  assert.deepEqual(labels(renderContractSignedSection(project,c)),['نسخه امضاشده قرارداد']);
  assert.deepEqual(labels(renderContractSignedSection(project,{...c,accountingStatus:'sent',sentToAccountingAt:2,accountingPackage:{contract:c}},{finance:true})),['نسخه امضاشده قرارداد']);
  delete window.KarhaSaosaWorkspaceAccess;
});

test('returned legacy contracts show their printed copies while fresh drafts have no inactive upload message',()=>{
 globalThis.document=documentRef;
 assert.equal(renderContractSignedSection(project,{id:'new',status:'draft',isDraft:true}),null);
 const returned={id:'c',status:'draft',isDraft:true,accountingStatus:'rejected',signedFiles:[],accountingPackage:{signedFiles:[file]}};
 const section=renderContractSignedSection(project,returned);
 assert.deepEqual(labels(section),['نسخه امضاشده قرارداد']);
 assert.ok(!section.children.some(node=>String(node.textContent).includes('فایل ذخیره شده')));
 assert.ok(!section.children.some(node=>String(node.textContent).includes('پس از تکمیل')));
});
