import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeTaskSnapshot } from './taskCloud.js';
import { buildProjectCloudPayload, cloudSyncProjectFull } from './cloudSyncProject.js';
import { createAppDataStore } from '../data/appDataStore.js';

test('empty incoming does not wipe non-empty local tasks', () => {
  const norm = t => ({ ...t, id: String(t.id) });
  const merged = mergeTaskSnapshot([], [{ id: 't1', title: 'A' }], [], norm);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, 't1');
});

test('buildProjectCloudPayload prefers store over empty live collection', () => {
  const policy = {
    shouldUploadCollection(store, live){
      return !(store.length > 0 && live.length === 0);
    },
  };
  const p = { name: 'P', ownerUid: 'u', contacts: [], activityTemplates: [], contractTemplates: [], contracts: [] };
  const store = { contacts: [{ id: 'c1' }], activityTemplates: [], contractTemplates: [], contracts: [] };
  const payload = buildProjectCloudPayload(p, store, policy, e => String(e || ''), 2);
  assert.equal(payload.contacts.length, 1);
});

test('cloud acknowledgement clears the canonical pending-write owner', async () => {
  const appData = createAppDataStore({ storage: null });
  const project = { id: 'p1', name: 'P', ownerUid: 'u1', tasks: [] };
  const ctx = {
    cloudMode: true,
    currentUser: { uid: 'u1' },
    appDataStore: appData,
    normalizeEmail: value => String(value || ''),
    normalizeProjectScopedData(){},
    projectRepositoryFind(){ return project; },
    DATA_SCHEMA_VERSION: 8,
    db: {
      collection(){
        return { doc(){ return { set(){ return Promise.resolve(); } }; } };
      },
    },
    getRecoveredLocalTasks(){ return []; },
    normalizeTaskRecord: task => task,
    rememberProjectTasks(){},
    writeTaskRecordsNormalized(){ return Promise.resolve(); },
  };

  cloudSyncProjectFull(ctx, project);
  assert.equal(appData.isCloudWritePending('p1'), true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(appData.isCloudWritePending('p1'), false);
  assert.equal(ctx.appDataStore.getPendingCloudWrites(), appData.getPendingCloudWrites());
});
