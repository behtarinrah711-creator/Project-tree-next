import test from 'node:test';
import assert from 'node:assert/strict';
import {createAppDataStore, APP_DATA_STORAGE_KEY} from '../data/appDataStore.js';
import {prepareSaosaWorkspace, SAOSA_SESSION_KEY, clearSaosaWorkspaceSession} from './saosaWorkspaceSync.js';

function storage(initial = {}){
  const values = new Map(Object.entries(initial));
  return {
    get length(){ return values.size; },
    key(index){ return [...values.keys()][index] ?? null; },
    getItem(key){ return values.has(key) ? values.get(key) : null; },
    setItem(key, value){ values.set(key, String(value)); },
    removeItem(key){ values.delete(key); },
  };
}

function response(status, payload){
  return {ok:status >= 200 && status < 300, status, json:async () => payload};
}

function windowWith({localStorage, fetch}){
  return {
    location:{hostname:'saosa.ir'}, localStorage, sessionStorage:storage(), fetch,
    setTimeout, clearTimeout,
  };
}

const session = JSON.stringify({phone:'09120000000', token:'token', expiresAt:Date.now() + 60_000});

test('guest startup clears project cache on saosa.ir', async () => {
  const local = storage({[APP_DATA_STORAGE_KEY]:JSON.stringify({schemaVersion:8, projects:[{id:'ip1'}]})});
  const store = createAppDataStore({storage:local});
  await prepareSaosaWorkspace({windowRef:windowWith({localStorage:local, fetch:async()=>{throw new Error('unused');}}), store});
  assert.equal(local.getItem(APP_DATA_STORAGE_KEY), null);
  assert.deepEqual(store.getProjects(), []);
});

test('authenticated startup hydrates only the account workspace', async () => {
  const local = storage({[SAOSA_SESSION_KEY]:session});
  const remote = {schemaVersion:8, projects:[{id:'iremote', name:'remote'}], viewMode:'simple', activeTab:null, starredOrder:[]};
  const win = windowWith({localStorage:local, fetch:async()=>response(200, {accountId:'account-a', snapshot:remote})});
  const store = createAppDataStore({storage:local});
  const prepared = await prepareSaosaWorkspace({windowRef:win, store});
  assert.equal(prepared.authenticated, true);
  assert.deepEqual(store.getProjects(), remote.projects);
  assert.equal(local.getItem(`${APP_DATA_STORAGE_KEY}:account-id`), 'account-a');
});

test('first signed-in startup imports an existing unowned browser project once', async () => {
  const cached = {schemaVersion:8, projects:[{id:'ilocal', name:'local'}], viewMode:'simple', activeTab:null, starredOrder:[]};
  const local = storage({[SAOSA_SESSION_KEY]:session, [APP_DATA_STORAGE_KEY]:JSON.stringify(cached)});
  const requests = [];
  const win = windowWith({localStorage:local, fetch:async (_url, options = {}) => {
    requests.push(options);
    if(options.method === 'PUT') return response(200, {accountId:'account-a', snapshot:cached});
    return response(200, {accountId:'account-a', snapshot:{...cached, projects:[]}});
  }});
  const store = createAppDataStore({storage:local});
  await prepareSaosaWorkspace({windowRef:win, store});
  assert.equal(requests.filter(item => item.method === 'PUT').length, 1);
  assert.deepEqual(store.getProjects(), cached.projects);
});

test('logout removes token and all workspace cache', () => {
  const local = storage({
    [SAOSA_SESSION_KEY]:session,
    [APP_DATA_STORAGE_KEY]:'{}',
    [`${APP_DATA_STORAGE_KEY}:account-id`]:'account-a',
  });
  const win = windowWith({localStorage:local, fetch:async()=>response(200,{})});
  clearSaosaWorkspaceSession(win);
  assert.equal(local.getItem(SAOSA_SESSION_KEY), null);
  assert.equal(local.getItem(APP_DATA_STORAGE_KEY), null);
  assert.equal(local.getItem(`${APP_DATA_STORAGE_KEY}:account-id`), null);
});
