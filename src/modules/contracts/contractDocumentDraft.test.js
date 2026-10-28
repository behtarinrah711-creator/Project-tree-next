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

test('document heading uses stacked metadata and one continuous introduction with filled values',()=>{
  const html=contractDocumentMarkup({contractNo:'C-17',contractDate:'1405/08/06',contractPlace:'شیراز',employerName:'کارفرما',contractorName:'پیمانکار',projectItemPath:'محوطه',amount:100000,retentionPercent:10,startDate:'1405/08/07',endDate:'1405/09/07',retentionBasis:'تحویل موقت',retentionDuration:'یک سال'},'فونداسیون');
  const intro=html.match(/<p class="doc-parties doc-introduction">(.*?)<\/p>/s)[1];
  assert.ok(!intro.includes('...'));
  assert.ok(!intro.includes('<div'));
  for(const value of ['کارفرما','پیمانکار','شیراز','محوطه','فونداسیون','۱۰۰٬۰۰۰','۱۰٬۰۰۰','تحویل موقت','یک سال'])assert.ok(intro.includes(value),value);
  assert.ok(html.indexOf('شماره قرارداد:')<html.indexOf('تاریخ قرارداد:'));
  assert.ok(html.indexOf('تاریخ قرارداد:')<html.indexOf('doc-title'));
  assert.ok(!html.includes('doc-line'));
});
test('missing values get dots while zero values remain populated and user text is escaped',()=>{
  const html=contractDocumentMarkup({employerName:'  ',contractorName:'<نام>',amount:0,retentionPercent:0},'کار');
  const intro=html.match(/<p class="doc-parties doc-introduction">(.*?)<\/p>/s)[1];
  assert.ok(intro.includes('فی‌مابین ................................................ به‌عنوان کارفرما'));
  assert.ok(intro.includes('&lt;نام&gt; به‌عنوان پیمانکار'));
  assert.ok(intro.includes('مبلغ کل ۰ تومان'));
  assert.ok(intro.includes('۰٪ از مبلغ قرارداد، معادل ۰ تومان'));
  const emptyIntro=contractDocumentMarkup({},'').match(/<p class="doc-parties doc-introduction">(.*?)<\/p>/s)[1];
  assert.ok(!emptyIntro.includes('معادل ۰ تومان'));
});
