import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.window={location:{hash:'',search:''}};
const {renderContractSignedSection}=await import('./contractSignedView.js');
const {contractProgressSteps}=await import('./contractProgressView.js');
class Node{constructor(tag){this.tag=tag;this.children=[];}appendChild(node){this.children.push(node);return node;}append(...nodes){this.children.push(...nodes);}}
const documentRef={createElement:tag=>new Node(tag)};
const labels=node=>node.children.filter(c=>c.tag==='button').map(c=>c.textContent);
const project={id:'p'};
const file={id:'f',name:'signed.jpg',mime:'image/jpeg'};
test('incomplete and approved cards offer the appropriate separate attachment and finance actions',()=>{
  globalThis.document=documentRef;
  let c={id:'c',status:'draft',isDraft:true};
  assert.deepEqual(labels(renderContractSignedSection(project,c)),[]);
  c={id:'c',status:'final',approvalStatus:'approved',contractApproverContactIds:[]};
  assert.deepEqual(labels(renderContractSignedSection(project,c)),['افزودن نسخه امضاشده']);
  c={...c,signedAt:1,signedFiles:[file]};
  assert.deepEqual(labels(renderContractSignedSection(project,c)),['مشاهده و اصلاح نسخه امضاشده','ارسال به واحد مالی']);
  assert.deepEqual(contractProgressSteps(c).map(s=>s.done),[true,true,true,false,false]);
  c={...c,sentToAccountingAt:2,accountingStatus:'sent',accountingPackage:{contract:{...c},signedFiles:[file]}};
  assert.deepEqual(labels(renderContractSignedSection(project,c)),['مشاهده نسخه امضاشده','پس‌گرفتن از مالی']);
  assert.deepEqual(contractProgressSteps(c).map(s=>s.done),[true,true,true,true,false]);
});
test('read-only project members cannot see mutation actions on signed or finance cards',()=>{
  globalThis.document=documentRef;window.KarhaSaosaWorkspaceAccess={p:{role:'member',permissions:{modules:{contracts:'view'}}}};
  const c={id:'c',status:'final',approvalStatus:'approved',signedAt:1,signedFiles:[file]};
  assert.deepEqual(labels(renderContractSignedSection(project,c)),['مشاهده نسخه امضاشده']);
  assert.deepEqual(labels(renderContractSignedSection(project,{...c,accountingStatus:'sent',sentToAccountingAt:2,accountingPackage:{contract:c}},{finance:true})),['مشاهده نسخه امضاشده']);
  delete window.KarhaSaosaWorkspaceAccess;
});
