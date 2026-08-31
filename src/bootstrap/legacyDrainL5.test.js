import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('legacy has no Firebase/Auth/recovery implementation bodies',async()=>{
  const source=(await Promise.all([
    readFile(new URL('../core/applicationFoundation.js',import.meta.url),'utf8'),
    readFile(new URL('../modules/runtime/featureComposition.js',import.meta.url),'utf8'),
  ])).join('\n');
  for(const forbidden of ['firebase.initializeApp','onAuthStateChanged','collectionGroup(','function recoverLegacyTasksForProject','function migrateGuestDataToCloud'])
    assert.doesNotMatch(source,new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.match(source,/cloudRuntime\.lifecycle\.permanentlyDelete\(p\)/);
});
