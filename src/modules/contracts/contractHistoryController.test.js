import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('Contract history uses reusable guarded-form registration without timing workaround',async()=>{
  const source=await readFile(new URL('./contractHistoryController.js',import.meta.url),'utf8');
  assert.match(source,/registerGuardedForm\('contract-form'/);
  assert.match(source,/shouldPreflightExit/);
  assert.match(source,/requestClose\?\.\(false,null\)/);
  assert.doesNotMatch(source,/traversalExitPending/);
  assert.doesNotMatch(source,/setTimeout\(/);
  assert.match(source,/closeContractFormPage/);
  assert.match(source,/requestCanonicalBack/);
});
