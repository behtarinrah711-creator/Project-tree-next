import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source=await readFile(new URL('./applicationFoundation.js',import.meta.url),'utf8');
const startup=await readFile(new URL('../bootstrap/applicationStartup.js',import.meta.url),'utf8');

test('startup installs AppDataStore before loading the classic foundation',()=>{
  assert.ok(startup.indexOf('installAppDataStore(')<startup.indexOf('await loadRuntime()'));
  assert.match(source,/AppDataStore must be installed before applicationFoundation/);
});
test('foundation has one Store-owned load and navigation state path',()=>{
  assert.doesNotMatch(source,/localStorage\s*\.|data\s*\.\s*(?:activeTab|viewMode)/);
  assert.match(source,/data=store\.loadFromStorage\(\)/);
  assert.match(source,/function getActiveTab\(\)\{ return window\.KarhaAppData\.getActiveTab\(\); \}/);
  assert.match(source,/function setViewMode\(value\)\{ return window\.KarhaAppData\.setViewMode\(value\); \}/);
});
test('foundation cannot reacquire extracted ownership',()=>{
  assert.doesNotMatch(source,/FLOATING_CONFIRM_WHITELIST|gmail\.com/);
  assert.doesNotMatch(source,/JSON\.parse|function migrateLegacyGlobalWorkspaceData/);
  assert.doesNotMatch(source,/String\(str\)\.replace\(\/\[0-9\]/);
  assert.doesNotMatch(source,/getElementById\(['"]toast['"]\)/);
});
