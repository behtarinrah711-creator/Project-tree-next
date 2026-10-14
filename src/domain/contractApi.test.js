import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { canDeleteContract, findContractReferences } from './deleteGuard.js';

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


test('contract template save keeps a required activity id', async () => {
  const source = await readFile(new URL('./contractApi.js', import.meta.url), 'utf8');
  assert.match(source, /const activityId = String\(draft\.activityId \|\| ''\)\.trim\(\)/);
  assert.match(source, /\.\.\.draft, id, activityId/);
});

test('contract template form uses module save actions and exposes inline clause confirmation', async () => {
  const source = await readFile(new URL('../modules/contracts/contractTemplateFormModule.js', import.meta.url), 'utf8');
  assert.match(source, /save\.onclick=\(\)=>contractTemplateFormModule\.save\(null,false\)/);
  assert.match(source, /confirm\.textContent='ثبت'/);
  assert.doesNotMatch(source, /save\.onclick=\(\)=>saveContractTemplateClean/);
  assert.match(source, /actions\.append\(grip,del\)/);
  assert.match(source, /rowActions\.append\(grip2,rm\)/);
  assert.doesNotMatch(source, /e\.key==='Enter'.*handleCommit/);
  assert.doesNotMatch(source, /insertLineBreak/);
  assert.match(source, /saveDraft\(null,false\)/);
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
  assert.match(css, /\.ctf-inline-input\{[^}]*resize:none/);
  assert.match(css, /font-family:IRANSansX,IRANSans,Arial,sans-serif/);
  assert.match(css, /\.ctf-preview\{[^}]*width:min\(100%,210mm\)[^}]*aspect-ratio:210\/297/);
  assert.match(css, /\.ctf-preview\{[^}]*padding:6\.667%/);
});
