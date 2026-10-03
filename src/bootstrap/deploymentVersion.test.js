import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { versionModuleSpecifiers } from '../../scripts/stampDeploymentVersion.mjs';

test('deployment stamper versions static, side-effect, and dynamic local imports',()=>{
  const source = [
    "import value from './value.js';",
    "import './side-effect.js';",
    "export { item } from '../item.js';",
    "const lazy = import('./lazy.js');",
    "import remote from 'https://example.com/remote.js';",
  ].join('\n');
  const stamped = versionModuleSpecifiers(source,'deploy-sha');
  assert.match(stamped,/from '\.\/value\.js\?v=deploy-sha'/);
  assert.match(stamped,/import '\.\/side-effect\.js\?v=deploy-sha'/);
  assert.match(stamped,/from '\.\.\/item\.js\?v=deploy-sha'/);
  assert.match(stamped,/import\('\.\/lazy\.js\?v=deploy-sha'\)/);
  assert.match(stamped,/https:\/\/example\.com\/remote\.js/);
  assert.doesNotMatch(stamped,/remote\.js\?v=/);
});

test('Arvan deploy stamps the complete module graph and removes stale app caches',async()=>{
  const [workflow,guard,worker] = await Promise.all([
    readFile(new URL('../../.github/workflows/deploy-arvan.yml',import.meta.url),'utf8'),
    readFile(new URL('./cacheGuard.js',import.meta.url),'utf8'),
    readFile(new URL('../../sw.js',import.meta.url),'utf8'),
  ]);
  assert.match(workflow,/on:\n  push:\n    branches: \[main\]/);
  assert.doesNotMatch(workflow,/workflow_run:/);
  assert.match(workflow,/node scripts\/stampDeploymentVersion\.mjs "\$\{DEPLOY_SHA\}"/);
  assert.doesNotMatch(guard,/window\.location\.reload/);
  assert.match(guard,/key\.startsWith\(CACHE_PREFIX\)/);
  assert.match(worker,/key\.startsWith\(CACHE_PREFIX\)/);
  assert.doesNotMatch(worker,/addEventListener\('fetch'/);
  assert.doesNotMatch(worker,/caches\.match|cache\.put/);
});
