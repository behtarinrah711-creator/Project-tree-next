/**
 * Machine-readable C3 compatibility boundary. Every name has a production
 * caller documented in docs/architecture/c3-inventory.md. Additions require an
 * architecture review; feature owners belong on KarhaApp or their named API.
 */
export const KARHA_LEGACY_SURFACE = Object.freeze([
  'getViewMode', 'renderAll', 'elFromHtml', 'formatCost', 'projectCostSum',
  'isPendingDeleted', 'markDirty', 'persist', 'openConfirm', 'showToast',
  'svgChevron', 'renderInlineAddRow', 'renderTaskBlock', 'applyRoutedSurface',
  'getWorkspaceChromeState', 'navigateFooter', 'renderDrawerProjectList',
  'clearWorkspaceSubpage', 'clearMenuRoot', 'handleWorkspaceContextBack',
  'handleWorkspaceContextAction', 'getProjectsList', 'getProject',
  'openContractForm', 'closeSearchTemplate', 'escapeHtml',
  'findActivityTemplate', 'formatJalaliDisplay', 'getContacts',
  'openNumpadGeneric', 'openJalaliPicker', 'canDeleteProjectRecord',
  'showRecordDeleteBlocked', 'showIncompleteFormExitChoice',
  'pushWorkspaceHistory', 'requestAnimationFrame', 'svgGrip', 'svgPlus',
  'toEnglishDigits', 'toPersianDigits', 'todayJalaliStr',
  'renumberContractItems', 'goHomeProjects',
]);

const allowedSurface = new Set(KARHA_LEGACY_SURFACE);

/** Thin, state-free compatibility publication for remaining global callers. */
export function installKarhaLegacyFacade(delegates, { windowRef = window } = {}) {
  if (!delegates || typeof delegates !== 'object') {
    throw new TypeError('KarhaLegacy delegates are required');
  }
  const keys = Object.keys(delegates);
  const unexpected = keys.filter(key => !allowedSurface.has(key));
  const missing = KARHA_LEGACY_SURFACE.filter(key => !keys.includes(key));
  if (unexpected.length || missing.length) {
    throw new TypeError(`KarhaLegacy surface mismatch (unexpected: ${unexpected.join(', ') || 'none'}; missing: ${missing.join(', ') || 'none'})`);
  }
  const facade = Object.freeze({ ...delegates });
  windowRef.KarhaLegacy = facade;
  return facade;
}

export function exposeKarhaLegacyInstaller({ windowRef = window } = {}) {
  windowRef.KarhaInstallLegacyFacade = delegates =>
    installKarhaLegacyFacade(delegates, { windowRef });
  return windowRef.KarhaInstallLegacyFacade;
}
