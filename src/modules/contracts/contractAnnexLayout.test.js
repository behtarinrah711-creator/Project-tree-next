import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {contractDocumentMarkup} from './contractDocument.js';
globalThis.window={location:{hash:'',search:''}};
const {resolveContractDocumentDraft}=await import('./realContractDomain.js');

for(const count of [0,1,2,3,4,7]){
  test(`${count} document photos use fixed three-row A4 groups without losing order`,()=>{
    const photos=Array.from({length:count},(_,index)=>'data:image/jpeg;base64,'+Buffer.from(String(index)).toString('base64'));
    const html=contractDocumentMarkup({contractorDocuments:photos,projectName:'کشتارگاه',contractNo:'CTR-7',contractorName:'جواد قریشی',contractDate:'1405/08/12'},'آرماتوربندی');
    const groups=[...html.matchAll(/<section class="contract-document-attachment"[\s\S]*?<\/section>/g)].map(match=>match[0]);
    assert.equal(groups.length,Math.ceil(count/3));
    assert.equal((html.match(/class="contract-document-photo"/g)||[]).length,count);
    groups.forEach((group,index)=>{
      assert.equal((group.match(/class="contract-document-photo"/g)||[]).length,Math.min(3,count-index*3));
      for(const text of ['کشتارگاه','CTR-7','جواد قریشی','آرماتوربندی','تاریخ قرارداد:'])assert.ok(group.includes(text),text);
      assert.ok(group.includes('data-contract-number="CTR-7"'));
    });
    const numbers=[...html.matchAll(/<figcaption>تصویر مدرک ([^<]+)<\/figcaption>/g)].map(match=>match[1]);
    assert.deepEqual(numbers,Array.from({length:count},(_,index)=>new Intl.NumberFormat('fa-IR').format(index+1)));
    for(const photo of photos)assert.ok(html.includes('src="'+photo+'"'));
  });
}
test('annex metadata reads project name and escapes printed identification fields',()=>{
  const draft=resolveContractDocumentDraft({contractorId:'c',contractorDocuments:['data:image/jpeg;base64,YQ=='],contractorDocumentsContactId:'c',contractNo:'<CTR>'},{name:'پروژه <الف>',contacts:[{id:'c',name:'<نام>'}]});
  assert.equal(draft.projectName,'پروژه <الف>');
  const html=contractDocumentMarkup(draft,'<فعالیت>');
  assert.ok(html.includes('پروژه &lt;الف&gt;'));assert.ok(html.includes('&lt;نام&gt;'));assert.ok(html.includes('&lt;فعالیت&gt;'));
  assert.ok(html.includes('data-contract-number="&lt;CTR&gt;"'));
});
test('fixed row geometry, proportional images and the shared frame fit inside the A4 content height',()=>{
  const css=readFileSync(new URL('../../styles/features/contracts.css',import.meta.url),'utf8');
  assert.match(css,/\.contract-document-photo-grid\{[^}]*grid-template-rows:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css,/\.contract-document-photo img\{[^}]*object-fit:contain;/);
  assert.match(css,/\.contract-sheet:before\{[^}]*border:1px solid #777;/);
  const rule=selector=>css.match(new RegExp(selector.replaceAll('.','\\.')+'\\{([^}]+)\\}'))[1];
  const pixels=(declaration,property)=>Number(declaration.match(new RegExp('(?:^|;)'+property+':([0-9.]+)px'))[1]);
  const header=rule('.contract-document-annex-header'),grid=rule('.contract-document-photo-grid');
  assert.ok(pixels(header,'height')+pixels(header,'margin-bottom')+pixels(grid,'height')<=pixels(rule('.contract-sheet-content'),'height'));
});
