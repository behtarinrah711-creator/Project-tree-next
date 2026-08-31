import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const removed = [
  'openCollabPage','closeCollabPage','renderCollabPage','openShareForm','submitShareForm',
  'closeShareForm','requestCloseShareForm','openShareDialog','closeShareDialog','removeShare',
];

test('canonical surfaces install in the required startup order', async () => {
  const source = await read('./applicationStartup.js');
  const positions = [
    'windowRef.KarhaApp = application', 'installAppDataStore({ windowRef', 'await loadRuntime()',
    'installUiPrimitives({ windowRef', 'router.start()',
  ].map(token => source.indexOf(token));
  assert.ok(positions.every(position => position >= 0));
  assert.deepEqual([...positions].sort((a,b)=>a-b), positions);
  assert.doesNotMatch(source, /windowRef\.KarhaLegacy\s*=/);
  assert.match(source, /await loadRuntime\(\)/);
  assert.match(source, /projectWorkspace: Object\.freeze\(\{ listProjects, getProject, getActiveProject, selectProject \}\)/);
});

test('removed legacy remnants have no production caller or facade entry', async () => {
  const production = (await Promise.all([
    read('./applicationRuntime.js'), read('./applicationStartup.js'), read('../modules/legacyModule.js'),
  ])).join('\n');
  removed.forEach(symbol => assert.doesNotMatch(production, new RegExp(`\\b${symbol}\\b`), symbol));
});

test('store, normal project, contract and routed-surface paths remain wired', async () => {
  const source = await read('./applicationStartup.js');
  for(const contract of [
    /projectRepository,/, /installAppDataStore/, /projectWorkspace: Object\.freeze/,
    /installProjectRouteSurfaceSync/, /installContractShellView/, /router\.start\(\)/,
  ]) assert.match(source, contract);
});
