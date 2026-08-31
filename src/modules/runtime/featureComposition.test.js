import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./featureComposition.js', import.meta.url), 'utf8');

test('feature composition cannot reacquire data, history, auth, or sync ownership', () => {
  for(const forbidden of [
    /localStorage\s*\./, /sessionStorage\s*\./, /firebase\s*\./,
    /firestore\s*\(/, /history\s*\.(?:pushState|replaceState|back)/,
    /onAuthStateChanged/, /schemaVersion/, /STORAGE_KEY/,
  ]) assert.doesNotMatch(source, forbidden);
});

test('feature composition has no removed status facade or presentation fallback', () => {
  for(const removed of [
    'openContractStatusPageLegacyDisabled', 'openContractApprovalPage',
    'openStatusTestPage', 'openStatusForm', 'openStatusList',
    'confirmCallback', 'PROFILE_KEY', 'EXPORT_NOTES_KEY',
  ]) assert.doesNotMatch(source, new RegExp(`\\b${removed}\\b`));
  assert.match(source, /KarhaApp\?\.modules\?\.get\('people'\)/);
  assert.match(source, /KarhaApp\?\.modules\?\.get\('activities'\)/);
  assert.match(source, /projectWorkspace\?\.selectProject/);
});
