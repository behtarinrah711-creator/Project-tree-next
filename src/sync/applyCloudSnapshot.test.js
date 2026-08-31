import test from 'node:test';
import assert from 'node:assert/strict';
import { ProjectRepository } from '../data/projectRepository.js';
import { applyCloudSnapshot, applyCloudProjectList } from './applyCloudSnapshot.js';
import { projectRepository } from '../data/projectRepository.js';

function memory(initial){
  const entries = new Map(Object.entries(initial || {}));
  return {
    getItem(k){ return entries.has(k) ? entries.get(k) : null; },
    setItem(k,v){ entries.set(k, String(v)); },
    removeItem(k){ entries.delete(k); },
  };
}

test('applyCloudSnapshot upserts into projectRepository singleton-compatible API', () => {
  const storage = memory({
    'ptnext-v1:app-data': JSON.stringify({ projects: [] }),
  });
  const repo = new ProjectRepository(storage);
  repo.saveProjectsList([{ id:'p1', name:'A', contacts:[] }]);
  const updated = repo.updateProject('p1', p => ({ ...p, name:'B', contacts:[{ id:'c1' }] }));
  assert.equal(updated.name, 'B');
  assert.equal(repo.find('p1').contacts.length, 1);
});

test('applyCloudProjectList keepMissing retains local-only projects', () => {
  const storage = memory({
    'ptnext-v1:app-data': JSON.stringify({
      projects: [
        { id:'local-only', name:'L' },
        { id:'shared', name:'S' },
      ],
    }),
  });
  const repo = new ProjectRepository(storage);
  const incoming = [{ id:'shared', name:'S2' }];
  const byId = new Map(repo.getProjectsList().map(p => [String(p.id), p]));
  incoming.forEach(p => byId.set(String(p.id), { ...(byId.get(String(p.id)) || {}), ...p }));
  repo.saveProjectsList(Array.from(byId.values()));
  assert.deepEqual(repo.getProjectsList().map(p => p.id).sort(), ['local-only', 'shared']);
  assert.equal(repo.find('shared').name, 'S2');
});

test('applyCloudSnapshot module exports callable functions', () => {
  assert.equal(typeof applyCloudSnapshot, 'function');
  assert.equal(typeof applyCloudProjectList, 'function');
  assert.equal(typeof projectRepository.find, 'function');
});
