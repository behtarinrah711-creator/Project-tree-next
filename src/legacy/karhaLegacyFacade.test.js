import test from 'node:test';
import assert from 'node:assert/strict';
import { KARHA_LEGACY_SURFACE, installKarhaLegacyFacade } from './karhaLegacyFacade.js';

const removed = [
  'setActiveProject', 'selectProject', 'getActiveProjectId', 'getActiveProject',
  'projectItemRuntime', 'openContractsPage', 'closeContractsPage',
  'openRealContractFormShell', 'closeRealContractFormShell',
  'suppressWorkspaceBack', 'findProjectRecordReferences',
  'renderAccountingWorkspace', 'openActivityForm', 'openActivityEditForm',
  'requestCloseActivityForm', 'activityFormRuntime', 'contactFormRuntime',
];

test('C3 facade surface is explicit, minimal, and excludes obsolete delegates', () => {
  assert.equal(KARHA_LEGACY_SURFACE.length, 43);
  assert.equal(new Set(KARHA_LEGACY_SURFACE).size, KARHA_LEGACY_SURFACE.length);
  removed.forEach(name => assert.ok(!KARHA_LEGACY_SURFACE.includes(name), name));
});

test('installer publishes only the documented frozen delegate surface', () => {
  const delegates = Object.fromEntries(KARHA_LEGACY_SURFACE.map(name => [name, () => name]));
  const windowRef = {};
  const facade = installKarhaLegacyFacade(delegates, { windowRef });
  assert.equal(windowRef.KarhaLegacy, facade);
  assert.ok(Object.isFrozen(facade));
  assert.deepEqual(Object.keys(facade), KARHA_LEGACY_SURFACE);
  assert.throws(() => installKarhaLegacyFacade({ ...delegates, obsolete: () => {} }, { windowRef }), /surface mismatch/);
  const { showToast, ...missing } = delegates;
  assert.throws(() => installKarhaLegacyFacade(missing, { windowRef }), /missing: showToast/);
});
