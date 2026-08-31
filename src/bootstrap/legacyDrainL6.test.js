import assert from 'node:assert/strict';
import test from 'node:test';
import { access, readFile } from 'node:fs/promises';

const read = relative => readFile(new URL(relative, import.meta.url), 'utf8');

test('L6 removes the classic legacy implementation and all startup references', async () => {
  await assert.rejects(access(new URL('../legacy/legacyApp.js', import.meta.url)));
  const startup = await read('./applicationStartup.js');
  const loader = await read('./applicationRuntimeLoader.js');
  const html = await read('../../index.html');
  assert.doesNotMatch(startup + loader + html, /legacyApp\.js/);
  assert.match(loader, /applicationRuntime\.js/);
});

test('KarhaLegacy facade is a state-free delegate publisher', async () => {
  const source = await read('../legacy/karhaLegacyFacade.js');
  for (const forbidden of [
    'addEventListener', 'history.', 'popstate', 'localStorage', 'firestore',
    'firebase', 'auth', 'querySelector', 'getElementById',
  ]) assert.doesNotMatch(source, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  assert.match(source, /Object\.freeze\(\{ \.\.\.delegates \}\)/);
  assert.doesNotMatch(source, /\b(?:let|var)\s+[A-Za-z_$]/);
});
