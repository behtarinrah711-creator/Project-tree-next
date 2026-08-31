import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('projectApi persist after write is cloud-only', async () => {
  const source = await readFile(new URL('./projectApi.js', import.meta.url), 'utf8');
  assert.match(source, /adapterPersist\(\{\s*local\s*:\s*false\s*\}\)/);
  assert.doesNotMatch(source, /KarhaLegacy\?\.persist/);
});
