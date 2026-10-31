import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { canDeleteContract, findContractReferences } from './deleteGuard.js';
import { appendContractChild } from '../modules/contracts/contractTemplateItems.js';

test('contract delete is not blocked by retained contractStatusReports (phase 5 inactive)', () => {
  const projects = [{
    id:'p1',
    name:'P',
    contracts:[{id:'rc1'}],
    contractStatusReports:[{id:'csr1', contractId:'rc1'}],
  }];
  assert.deepEqual(findContractReferences(projects, 'rc1'), []);
  assert.equal(canDeleteContract(projects, 'rc1').ok, true);
});

test('contractApi persist after write is cloud-only', async () => {
  const source = await readFile(new URL('./contractApi.js', import.meta.url), 'utf8');
  assert.match(source, /adapterPersist\(\{\s*local\s*:\s*false\s*\}\)/);
  assert.doesNotMatch(source, /KarhaLegacy\?\.persist/);
});

test('contractApi owns template save and trash methods', async () => {
  const source = await readFile(new URL('./contractApi.js', import.meta.url), 'utf8');
  assert.match(source, /saveTemplate\s*\(/);
  assert.match(source, /trashTemplate\s*\(/);
  assert.match(source, /listTemplatesPage\s*\(/);
});

test('contract list is sorted by createdAt descending before pagination with stable legacy fallback', async () => {
  const source = await readFile(new URL('./contractApi.js', import.meta.url), 'utf8');
  assert.match(source, /newestFirst\(contractRepository\.list\(projectId\)/);
  assert.match(source, /b\.createdAt-a\.createdAt/);
  assert.match(source, /a\.index-b\.index/);
});


test('contract clauses append without replacing previous clauses and stay numbered', () => {
  const items=[{id:'material-1',text:'ماده',children:[]}];
  const makeItem=text=>({id:'child-'+(items[0].children.length+1),text,children:[]});
  const renumber=list=>list.forEach((item,i)=>item.children.forEach((child,j)=>child.number=(i+1)+'-'+(j+1)));
  assert.ok(appendContractChild(items,'material-1','بند اول',makeItem,renumber));
  assert.ok(appendContractChild(items,'material-1','بند دوم',makeItem,renumber));
  assert.deepEqual(items[0].children.map(child=>child.text),['بند اول','بند دوم']);
  assert.deepEqual(items[0].children.map(child=>child.number),['1-1','1-2']);
});

test('template saving requires an independent title rather than an activity', async () => {
  const source = await readFile(new URL('./contractApi.js', import.meta.url), 'utf8');
  assert.match(source, /const title = String\(draft\.title \|\| ''\)\.trim\(\)/);
  assert.match(source, /delete record\.activityId/);
  assert.doesNotMatch(source, /duplicate_activity/);
});

test('contract template form uses module save actions and exposes inline clause confirmation', async () => {
  const source = await readFile(new URL('../modules/contracts/contractTemplateFormModule.js', import.meta.url), 'utf8');
  assert.match(source, /save\.onclick=\(\)=>contractTemplateFormModule\.save\(null,false\)/);
  assert.match(source, /confirm\.textContent='ثبت'/);
  assert.doesNotMatch(source, /save\.onclick=\(\)=>saveContractTemplateClean/);
  assert.match(source, /actions\.append\(grip,del\)/);
  assert.match(source, /rowActions\.append\(grip2,rm\)/);
  assert.match(source, /rowActions\.className='ctf-row-actions ctf-material-actions'/);
  assert.doesNotMatch(source, /e\.key==='Enter'.*handleCommit/);
  assert.doesNotMatch(source, /insertLineBreak/);
  assert.match(source, /saveDraft\(null,false\)/);
  assert.match(source, /ctfCommitChild\(parentId,input\.value,false\)/);
  assert.match(source, /appendContractChild\([\s\S]*st\.items,[\s\S]*parentId,[\s\S]*v,[\s\S]*makeContractItem[\s\S]*renumberContractItems/);
  assert.match(source, /عنوان قالب قرارداد را وارد کنید/);
  assert.match(source, /inlineAddState\?\.parentId===item\.id[\s\S]*ctf-add-material/);
});


test('contract template drafts persist as project records and list rerenders after closing', async () => {
  const api = await readFile(new URL('./contractApi.js', import.meta.url), 'utf8');
  const compatibility = await readFile(new URL('../modules/contracts/contractCompatibility.js', import.meta.url), 'utf8');
  const list = await readFile(new URL('../modules/contracts/contractsModule.js', import.meta.url), 'utf8');
  assert.match(api, /record\.status = status/);
  assert.match(api, /record\.isDraft = status === 'draft'/);
  assert.match(compatibility, /function renderContractTemplatesPage\(\)/);
  assert.match(list, /t\.isDraft\|\|t\.status==='draft'\?'پیش‌نویس'/);
});

test('contract template mobile styles keep row actions together and remove resize grip', async () => {
  const css = await readFile(new URL('../styles/features/contracts.css', import.meta.url), 'utf8');
  assert.match(css, /\.ctf-row-actions\{[^}]*position:absolute;left:12px[^}]*direction:ltr/);
  assert.match(css, /\.ctf-row\{[^}]*padding:0 12px 0 110px/);
  assert.match(css, /\.ctf-material-row\{[^}]*padding-left:110px !important/);
  assert.match(css, /\.ctf-material-row \.ctf-material-actions\{left:12px/);
  assert.match(css, /\.ctf-material-row \.ctf-text\{[^}]*font-size:12px[^}]*resize:none!important/);
  assert.match(css, /textarea\.ctf-text::\-webkit-resizer\{display:none/);
  assert.match(css, /\.ctf-inline-input\{[^}]*resize:none/);
  assert.match(css, /font-family:IRANSansX,IRANSans,Arial,sans-serif/);
  assert.match(css, /\.ctf-preview\{[^}]*width:794px;min-height:1123px;height:auto[^}]*padding:53px/);
  assert.match(css, /\.contract-sheet\{[^}]*width:794px;height:1123px[^}]*padding:76px/);
  assert.match(css, /\.contract-sheet-content\{height:971px/);
  assert.match(css, /\.ctf-preview-title\{[^}]*font-size:21px/);
  assert.match(css, /\.ctf-preview-band\{[^}]*font-size:13px/);
  const form = await readFile(new URL('../modules/contracts/contractTemplateFormModule.js', import.meta.url), 'utf8');
  assert.match(form, /const scale=Math\.min\(1,available\/794\)/);
  assert.match(form, /viewport\.style\.height=Math\.ceil\(Math\.max\(1123,page\.scrollHeight,page\.offsetHeight\)\*scale\)/);
});
