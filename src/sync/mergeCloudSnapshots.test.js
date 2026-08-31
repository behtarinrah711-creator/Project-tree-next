import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeOwnedCloudSnapshots } from './mergeCloudSnapshots.js';
import { createAppDataStore } from '../data/appDataStore.js';

test('merge keeps dirty local over cloud map entry', () => {
  const dirty = new Set(['p1']);
  const local = [{ id: 'p1', name: 'Local', ownerUid: 'u1' }];
  const ownedDocs = [{ id: 'p1', data: () => ({ name: 'Cloud', ownerUid: 'u1' }) }];
  const result = mergeOwnedCloudSnapshots({
    ownedDocs,
    localProjects: local,
    appDataStore: Object.assign(createAppDataStore({storage:null}), { getDirtyProjectIds(){ return dirty; } }),
    currentUser: { uid: 'u1' },
    docToProject: (doc) => ({ id: doc.id, name: doc.data().name, ownerUid: 'u1' }),
  });
  assert.equal(result.projects.find(p => p.id === 'p1').name, 'Local');
});

test('merge keeps guest project without ownerUid', () => {
  const local = [{ id: 'g1', name: 'Guest' }];
  const result = mergeOwnedCloudSnapshots({
    ownedDocs: [],
    localProjects: local,
    appDataStore: createAppDataStore({storage:null}),
    currentUser: { uid: 'u1' },
    docToProject: () => null,
  });
  assert.equal(result.projects.some(p => p.id === 'g1'), true);
});
