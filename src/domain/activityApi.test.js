import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ActivityRepository } from '../data/activityRepository.js';
import { ProjectRepository } from '../data/projectRepository.js';
import { canDeleteActivity, findActivityReferences } from './deleteGuard.js';

function seedProjects(){
  return [{
    id:'p1',
    name:'P',
    activityTemplates:[{id:'a1',name:'بتن'},{id:'a2',name:'آرماتور'}],
    contacts:[{id:'c1',activities:['a1']}],
    tasks:[{id:'t1',activities:[],subtasks:[{id:'s1',activities:['a2']}]}],
    contractTemplates:[{id:'ct1',activityId:'a2'}],
    contracts:[{id:'rc1',activityId:'a1',trashed:false}],
    contractStatusReports:[{id:'csr1',activityId:'a1',contractId:'rc1'}],
  }];
}

test('activity guard only uses real schema ID references', () => {
  const refs = findActivityReferences(seedProjects(), 'a1');
  const kinds = refs.map(r => r.kind).sort();
  assert.deepEqual(kinds, ['contact', 'contract']);
  assert.equal(canDeleteActivity(seedProjects(), 'a1').ok, false);
  assert.equal(canDeleteActivity(seedProjects(), 'unused').ok, true);
});

test('trashed contract does not block activity delete', () => {
  const projects = seedProjects();
  projects[0].contacts = [];
  projects[0].contracts[0].trashed = true;
  projects[0].contractStatusReports[0].trashed = true;
  assert.equal(canDeleteActivity(projects, 'a1').ok, true);
});

test('activity repository listPage is cursor-based', () => {
  const storage = {
    store: { 'ptnext-v1:app-data': JSON.stringify({
      projects:[{ id:'p1', activityTemplates:[
        {id:'a1',name:'A'},{id:'a2',name:'B'},{id:'a3',name:'C',trashed:true},
      ] }],
    }) },
    getItem(k){ return this.store[k]; },
    setItem(k,v){ this.store[k]=v; },
    removeItem(k){ delete this.store[k]; },
  };
  const repo = new ActivityRepository(new ProjectRepository(storage));
  const page = repo.listPage('p1', { cursor:0, limit:1 });
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].id, 'a1');
  assert.equal(page.cursor, 1);
});

test('activityApi persist after write is cloud-only', async () => {
  const source = await readFile(new URL('./activityApi.js', import.meta.url), 'utf8');
  assert.match(source, /adapterPersist\(\{\s*local\s*:\s*false\s*\}\)/);
  assert.doesNotMatch(source, /KarhaLegacy\?\.persist/);
});
