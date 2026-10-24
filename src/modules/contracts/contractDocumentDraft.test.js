import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.window={location:{hash:'',search:''}};
const {resolveContractDocumentDraft}=await import('./realContractDomain.js');
import {contractDocumentMarkup} from './contractDocument.js';

const template={id:'f',activityId:'a',items:Array.from({length:12},(_,i)=>({text:`Article ${i+1}`,children:[{text:`Clause ${i+1}`}]}))};
const project={contractTemplates:[template],contacts:[]};
test('auto-created work contract resolves all twelve articles for document output without modifying storage',()=>{
  const record={id:'work-contract',activityId:'a',items:[],workTaskId:'task'};
  const before=JSON.stringify({record,project});
  const draft=resolveContractDocumentDraft(record,project);
  assert.equal(draft.items.length,12);assert.equal(draft.templateId,'f');
  const html=contractDocumentMarkup(draft,'Foundation');
  for(let i=1;i<=12;i++){assert.ok(html.includes(`Article ${i}`));assert.ok(html.includes(`Clause ${i}`));}
  draft.items[0].children[0].text='edit';
  assert.equal(JSON.stringify({record,project}),before);
});
test('saved custom clauses take priority over the default template',()=>{
  const record={activityId:'a',templateId:'f',items:[{text:'Custom clause',children:[]}]};
  assert.deepEqual(resolveContractDocumentDraft(record,project).items,record.items);
});
test('explicit template links are respected; missing, trashed and ambiguous templates are not silently substituted',()=>{
  assert.equal(resolveContractDocumentDraft({activityId:'a',templateId:'f'},project).items.length,12);
  assert.equal(resolveContractDocumentDraft({activityId:'a',templateId:'missing'},project).items.length,0);
  assert.equal(resolveContractDocumentDraft({activityId:'a'}, {contractTemplates:[{...template,trashed:true}]}).items.length,0);
  assert.equal(resolveContractDocumentDraft({activityId:'a'}, {contractTemplates:[template,{...template,id:'other'}]}).items.length,0);
});
