import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));

test('notebook hashes are global and do not require projectId', async () => {
  globalThis.window = { location: { hash: '#/notebook' } };
  const { parseRoute } = await import('../../core/router.js');
  assert.deepEqual(parseRoute(), { projectId: null, moduleId: 'notebook', surface: 'global' });
  window.location.hash = '#/notebook/export';
  assert.deepEqual(parseRoute(), { projectId: null, moduleId: 'notebook-export', surface: 'global' });
});

test('notebook module does not import KarhaLegacy or Project.tasks', () => {
  const src = readFileSync(join(dir, 'notebookView.js'), 'utf8');
  assert.equal(src.includes('KarhaLegacy'), false);
  assert.equal(src.includes('Project.tasks'), false);
});
