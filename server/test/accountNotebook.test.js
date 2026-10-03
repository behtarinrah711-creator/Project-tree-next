import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../src/app.js';
import {hashToken} from '../src/auth.js';
import {normalizeAccountNotebook} from '../src/accountNotebook.js';

const SECRET = 'test-secret';

function notebook(title = 'کارهای شخصی', text = ''){
  return {
    version: 1,
    activeListId: 'list-1',
    updatedAt: 10,
    sharedWith: ['09120000000'],
    projectId: 'should-not-persist',
    lists: [{id: 'list-1', title, items: text ? [{id: 'item-1', text}] : []}],
  };
}

test('account notebook keeps only the private document', () => {
  const normalized = normalizeAccountNotebook(notebook('دفتر من', 'یادداشت'));
  assert.equal(normalized.lists[0].items[0].text, 'یادداشت');
  assert.equal(Object.hasOwn(normalized, 'sharedWith'), false);
  assert.equal(Object.hasOwn(normalized, 'projectId'), false);
  assert.equal(normalizeAccountNotebook({lists: []}), null);
  assert.equal(normalizeAccountNotebook({projects: [{id: 'p'}]}), null);
});

function memoryPool(){
  const notebooks = new Map();
  const sessions = new Map();
  const client = {
    async query(sql, params = []){
      if(sql.includes('FROM sessions')){
        const accountId = sessions.get(params[0]);
        return {rows: accountId ? [{account_id: accountId}] : [], rowCount: accountId ? 1 : 0};
      }
      if(sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return {rows: [], rowCount: 0};
      if(sql.includes('SELECT revision FROM account_notebooks')){
        const row = notebooks.get(params[0]);
        return {rows: row ? [{revision: row.revision}] : [], rowCount: row ? 1 : 0};
      }
      if(sql.includes('SELECT payload, revision')){
        const row = notebooks.get(params[0]);
        return {rows: row ? [row] : [], rowCount: row ? 1 : 0};
      }
      if(sql.includes('INSERT INTO account_notebooks')){
        const [accountId, payload] = params;
        const previous = notebooks.get(accountId);
        const row = {
          payload: JSON.parse(payload),
          revision: previous ? previous.revision + 1 : 1,
          updated_at: '2026-10-03T00:00:00.000Z',
        };
        notebooks.set(accountId, row);
        return {rows: [{revision: row.revision, updated_at: row.updated_at}], rowCount: 1};
      }
      throw new Error(`unexpected sql: ${sql}`);
    },
    release(){},
  };
  return {
    notebooks,
    sessions,
    query: (sql, params) => client.query(sql, params),
    connect: async () => client,
  };
}

function response(){
  return {
    status: 0,
    body: null,
    writeHead(status){ this.status = status; },
    end(raw){ this.body = JSON.parse(raw); },
  };
}

async function call(app, {method, path, token, body}){
  const chunks = body == null ? [] : [Buffer.from(JSON.stringify(body))];
  const request = {
    method,
    url: path,
    headers: token ? {authorization: `Bearer ${token}`} : {},
    socket: {},
    async *[Symbol.asyncIterator](){
      for(const chunk of chunks) yield chunk;
    },
  };
  const res = response();
  await app(request, res);
  return res;
}

test('notebook API is private to the signed-in account and is not a project', async () => {
  const pool = memoryPool();
  pool.sessions.set(hashToken('mine', SECRET), 'account-1');
  pool.sessions.set(hashToken('other', SECRET), 'account-2');
  const app = createApp({pool, sessionSecret: SECRET, sendLoginCode: async () => {}});

  assert.equal((await call(app, {method: 'GET', path: '/api/v1/notebook'})).status, 401);

  const created = await call(app, {
    method: 'PUT',
    path: '/api/v1/notebook',
    token: 'mine',
    body: {notebook: notebook('دفتر من', 'خرید سیمان'), expectedRevision: 0},
  });
  assert.equal(created.status, 200);
  assert.equal(created.body.revision, 1);
  assert.equal(created.body.notebook.lists[0].items[0].text, 'خرید سیمان');
  assert.equal(Object.hasOwn(pool.notebooks.get('account-1').payload, 'sharedWith'), false);
  assert.equal(pool.notebooks.has('account-2'), false);

  const other = await call(app, {method: 'GET', path: '/api/v1/notebook', token: 'other'});
  assert.equal(other.status, 200);
  assert.equal(other.body.notebook, null);
  assert.equal(other.body.revision, 0);

  const mine = await call(app, {method: 'GET', path: '/api/v1/notebook', token: 'mine'});
  assert.equal(mine.body.notebook.lists[0].title, 'دفتر من');

  const conflict = await call(app, {
    method: 'PUT',
    path: '/api/v1/notebook',
    token: 'mine',
    body: {notebook: notebook('بازنویسی'), expectedRevision: 0},
  });
  assert.equal(conflict.status, 409);
  assert.equal(pool.notebooks.get('account-1').payload.lists[0].title, 'دفتر من');
});
