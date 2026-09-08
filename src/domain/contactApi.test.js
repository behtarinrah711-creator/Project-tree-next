import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { canDeleteContact, findContactReferences } from './deleteGuard.js';

function seed(){
  return [{
    id:'p1',
    name:'P',
    contacts:[{id:'c1',name:'علی'}],
    contracts:[{id:'rc1',contractorId:'c1',employerId:'c2'}],
    contractStatusReports:[{id:'csr1',contactId:'c1',contractId:'rc1'}],
  }];
}

test('contact guard only uses real schema ID references', () => {
  const kinds = findContactReferences(seed(), 'c1').map(r => r.kind).sort();
  assert.deepEqual(kinds, ['contract']);
  assert.equal(canDeleteContact(seed(), 'c1').ok, false);
  assert.equal(canDeleteContact(seed(), 'c9').ok, true);
});

test('trashed contract or status report does not block contact delete', () => {
  const projects = seed();
  projects[0].contracts[0].trashed = true;
  projects[0].contractStatusReports[0].trashed = true;
  assert.equal(canDeleteContact(projects, 'c1').ok, true);
});

test('an active Work Task assignee reference blocks contact deletion', () => {
  const projects = seed();
  projects[0].contracts[0].trashed = true;
  projects[0].tasks = [{ id:'w1', kind:'work', workTasks:[{
    id:'task-1', workId:'w1', title:'نصب', assigneeContactId:'c1',
  }] }];
  const references = findContactReferences(projects, 'c1');
  assert.equal(references.some(reference => reference.kind === 'work_task'), true);
  assert.equal(canDeleteContact(projects, 'c1').ok, false);
});

test('contactApi persist after write is cloud-only', async () => {
  const source = await readFile(new URL('./contactApi.js', import.meta.url), 'utf8');
  assert.match(source, /adapterPersist\(\{\s*local\s*:\s*false\s*\}\)/);
  assert.doesNotMatch(source, /KarhaLegacy\?\.persist/);
});
