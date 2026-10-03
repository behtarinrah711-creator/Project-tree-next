import assert from 'node:assert/strict';
import test from 'node:test';
import {createNotebookItem, createNotebookRepository} from '../data/notebookRepository.js';
import {createSaosaNotebookLifecycle} from './saosaNotebookSync.js';

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

function storage(initial = {}){
  const values = new Map(Object.entries(initial));
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
}

function jsonResponse(status, payload){
  return {ok: status >= 200 && status < 300, status, json: async () => payload};
}

test('signed-in Saosa notebook loads from the account API and ignores projects', async () => {
  const requests = [];
  const remote = {
    version: 1,
    activeListId: 'kept',
    updatedAt: 50,
    lists: [{id: 'kept', title: 'دفتر سرور', items: [{id: 'n1', text: 'سیمان', children: []}]}],
  };
  const local = storage({
    'saosa:v1:sms-session': JSON.stringify({phone: '09120000000', token: 'token', accountId: 'acc-1', expiresAt: Date.now() + 60_000}),
  });
  const windowRef = {
    location: {hostname: 'saosa.ir'},
    localStorage: local,
    fetch: async (url, options = {}) => {
      requests.push({url, options});
      assert.equal(url, '/api/v1/notebook');
      assert.match(options.headers.authorization, /^Bearer token$/);
      return jsonResponse(200, {notebook: remote, revision: 3});
    },
  };
  const guest = createNotebookRepository({storage: storage(), storageKey: 'guest'});
  const lifecycle = createSaosaNotebookLifecycle({
    windowRef,
    guestRepository: guest,
    accountStorage: storage(),
    consoleRef: {warn(){}},
  });
  await tick();
  await tick();
  assert.equal(lifecycle.get().lists[0].title, 'دفتر سرور');
  assert.equal(lifecycle.get().lists[0].items[0].text, 'سیمان');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].options.method, undefined);
});

test('first sign-in uploads the existing browser notebook once and does not attach it to a project', async () => {
  const requests = [];
  let stored = null;
  const local = storage({
    'saosa:v1:sms-session': JSON.stringify({phone: '09120000000', token: 'token', accountId: 'acc-1', expiresAt: Date.now() + 60_000}),
  });
  const guestStorage = storage();
  const guest = createNotebookRepository({storage: guestStorage, storageKey: 'guest'});
  guest.mutate(notebook => notebook.lists[0].items.push(createNotebookItem('یادداشت قبلی')));
  const windowRef = {
    location: {hostname: 'saosa.ir'},
    localStorage: local,
    fetch: async (url, options = {}) => {
      requests.push({url, body: options.body ? JSON.parse(options.body) : null, method: options.method || 'GET'});
      if(options.method === 'PUT'){
        stored = JSON.parse(options.body).notebook;
        assert.equal(Object.hasOwn(stored, 'projectId'), false);
        assert.equal(requests.at(-1).body.expectedRevision, 0);
        return jsonResponse(200, {notebook: stored, revision: 1});
      }
      return jsonResponse(200, {notebook: null, revision: 0});
    },
  };
  const lifecycle = createSaosaNotebookLifecycle({
    windowRef,
    guestRepository: guest,
    accountStorage: storage(),
    consoleRef: {warn(){}},
  });
  await tick();
  await tick();
  await tick();
  assert.equal(stored.lists[0].items[0].text, 'یادداشت قبلی');
  assert.equal(lifecycle.get().lists[0].items[0].text, 'یادداشت قبلی');
  assert.equal(guest.get().lists[0].items.length, 0);

  lifecycle.mutate(notebook => notebook.lists[0].items.push(createNotebookItem('مورد جدید')));
  await tick();
  await tick();
  const puts = requests.filter(item => item.method === 'PUT');
  assert.equal(puts.at(-1).body.expectedRevision, 1);
  assert.equal(puts.at(-1).body.notebook.lists[0].items.at(-1).text, 'مورد جدید');
});

test('logged-out notebook stays on this browser and is not sent to Arvan', async () => {
  let called = false;
  const windowRef = {
    location: {hostname: 'saosa.ir'},
    localStorage: storage(),
    fetch: async () => { called = true; throw new Error('should not fetch'); },
  };
  const lifecycle = createSaosaNotebookLifecycle({
    windowRef,
    guestRepository: createNotebookRepository({storage: storage(), storageKey: 'guest'}),
    accountStorage: storage(),
    consoleRef: {warn(){}},
  });
  lifecycle.mutate(notebook => notebook.lists[0].items.push(createNotebookItem('فقط محلی')));
  await tick();
  assert.equal(called, false);
  assert.equal(lifecycle.get().lists[0].items[0].text, 'فقط محلی');
});
