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
