# Architecture Cleanup C3 inventory

Inventory date: 2026-08-25. Baseline: `3680bf9` (merged PR #85). This inventory was completed before C3 production edits. The search corpus was `src/` plus `tests/`; generated files and historical documentation were excluded when deciding whether a production caller exists.

## Classification key

A canonical runtime API; B feature-to-feature dependency; C compatibility-only facade; D bootstrap/install-order dependency; E presentation callback; F mutation callback; G obsolete transitional delegate; H duplicate canonical API; I test-only dependency; J classic-script global retained until C4.

## Composition/runtime inventory

| Symbol/API | Definition | Production callers | Test callers | Canonical owner / target | Class | Decision and reason |
|---|---|---|---|---|---|---|
| `window.KarhaApp` and `KarhaApp.modules` | `applicationStartup.js` / module registry | router, workspace runtime, reports, form runtimes, feature composition | module/router/startup tests | application + module registry | A,D,J | KEEP: canonical registry and C4 classic boundary. |
| `featureComposition.js` task UI factory | `featureComposition.js` | dashboard and task presentation globals | workspace/E2E | task runtime/UI | B,E,J | KEEP wiring; dependency bag remains deferred to C4 because the classic task renderer public API is not yet independently injectable. |
| project trash callbacks | `featureComposition.js` | project trash view | trash tests/E2E | task runtime, contact/activity APIs, project lifecycle | B,E,F | KEEP narrow wiring; remove unrelated dead/fallback implementations where proven. |
| project management callbacks | `featureComposition.js` | project management view | project management/E2E | project API/project lifecycle | B,E,F | KEEP wiring; cloud permanent-delete is still a classic runtime boundary. |
| contact/activity open/render delegates | `featureComposition.js` | DOM bindings/workspace presentation | workspace/E2E | `people` and `activities` registered modules | A,B,E | KEEP only route/shell coordination and direct module API calls. |
| profile/export forwarding and fallback stores | `featureComposition.js` | drawer/export actions | startup/E2E | `KarhaProfile`, `KarhaProfileView`, `KarhaExportNotes`, `KarhaExportView` | G,H,J | DELETE unused profile/export delegates and fallback persistence/formatting; retain only the export opener required by project-management wiring. |
| confirm DOM fallback | `featureComposition.js` | task/trash/project views | E2E | `KarhaUI` confirm primitive | G,H | DELETE implementation and mutable callback; retain thin calls only. |
| removed status/approval/status-test paths | `featureComposition.js` | no active route (two stale checks in workspace presentation only) | legacy architecture tests | condemned modules/dashboard route | G | DELETE dead bodies and stale checks; no product path exists. |
| service-worker registration | `featureComposition.js` | browser load/controllerchange | E2E | bootstrap (future) | D,J | KEEP unchanged to avoid startup changes; explicitly deferred to C4. |
| `window.KarhaChildHistory` | child history controller | workspace/forms/contracts/search/numpad/Jalali | child-history/contract tests | child history controller | A,B,J | KEEP: canonical history API, classic boundary. |
| `window.KarhaWorkspaceChrome` | workspace chrome | workspace presentation/composition | workspace/navigation tests | workspace chrome | A,E,J | KEEP: canonical presentation API, classic boundary. |
| `window.KarhaUI` | UI primitives installer | forms/contracts/profile/export/composition | UI/contract tests | UI primitives | A,E,J | KEEP: canonical presentation API, classic boundary. |
| `window.KarhaContract*`, `KarhaRealContract*`, `KarhaSearchTemplate*` | contract modules/controllers | contract compatibility/forms/pickers | contract tests | named contract owners | A,B,D,J | KEEP until C4 imports; these are explicit owner APIs rather than `KarhaLegacy`. |
| `window.KarhaProfile*`, `KarhaExport*`, `KarhaSoftDelete`, `KarhaApplicationRefresh` | named modular installers | classic composition/runtime | focused module/startup tests | named feature owners | A,B,D,J | KEEP until C4 imports. |
| `window.__commitContactDraft`, `__karha*` guards | contact/startup/runtime | footer/startup guards | E2E/startup | contact form/bootstrap | D,J | KEEP temporarily; internal classic callbacks/one-time guards, not public feature state. |

## Original `KarhaLegacy` surface (59 entries)

The original installer published the entries below. “Direct” means a caller explicitly reads that property; “dynamic fallback” means an ES-module helper probes `window[name]` first and the facade second.

| Entries | Active production callers | Owner | Class / decision |
|---|---|---|---|
| `getViewMode`, `renderAll`, `elFromHtml`, `formatCost`, `projectCostSum`, `isPendingDeleted`, `markDirty`, `persist`, `openConfirm`, `showToast`, `svgChevron`, `renderInlineAddRow`, `renderTaskBlock` | dashboard; soft-delete; persist adapter | Store/task UI/UI primitives | C/E/F/J KEEP thin |
| `applyRoutedSurface`, `getWorkspaceChromeState`, `navigateFooter`, `renderDrawerProjectList`, `clearWorkspaceSubpage`, `clearMenuRoot`, `handleWorkspaceContextBack`, `handleWorkspaceContextAction`, `getProjectsList`, `goHomeProjects` | startup route/workspace/recovery bridges | route surface/workspace chrome/recovery | C/D/E/J KEEP thin |
| `getProject` | task/contact/activity/contract domain live publication | AppDataStore/project repository | C/F/J KEEP thin pending C4 data identity cutover |
| `openContractForm`, `closeSearchTemplate`, `escapeHtml`, `findActivityTemplate`, `formatJalaliDisplay`, `getContacts`, `openNumpadGeneric`, `canDeleteProjectRecord`, `showRecordDeleteBlocked`, `showIncompleteFormExitChoice`, `requestAnimationFrame`, `svgGrip`, `svgPlus`, `toEnglishDigits`, `toPersianDigits`, `todayJalaliStr`, `renumberContractItems` | contract/dashboard/profile/export helpers and record delete UI | named contract/UI/domain owners | C/E/F/J KEEP thin |
| `suppressWorkspaceBack` | numpad and Jalali | back gesture guard | H DELETE; callers move to canonical `KarhaBackGestureGuard.suppress`. |
| `activityFormRuntime`, `contactFormRuntime` | form modules/form runtime getters | `KarhaApp.get*FormRuntime` | H DELETE; callers move to canonical getters. |
| `setActiveProject`, `selectProject`, `getActiveProjectId`, `getActiveProject`, `projectItemRuntime`, `openContractsPage`, `closeContractsPage`, `openRealContractFormShell`, `closeRealContractFormShell`, `findProjectRecordReferences`, `renderAccountingWorkspace`, `openActivityForm`, `openActivityEditForm`, `requestCloseActivityForm` | none (only `selectProject` had a test stub) | project workspace/contract shell/domain/registered activities | G/H/I DELETE: no active production property caller. |

## Temporary globals intentionally remaining for C4

`KarhaApp`/module registry, `KarhaAppData`, `KarhaUI`, `KarhaChildHistory`, `KarhaWorkspaceChrome`, the named `KarhaContract*`/`KarhaRealContract*`/`KarhaSearchTemplate*` owner APIs, `KarhaProfile*`, `KarhaExport*`, `KarhaSoftDelete`, `KarhaApplicationRefresh`, Firebase's classic SDK global, and classic function declarations consumed by separately loaded ES modules. They remain because scripts are intentionally not converted to imports/exports in C3. `KarhaLegacy` remains only for the enumerated compatibility callers above.

## Deferred scale/maintainability debt

* Task UI creation still receives a broad callback bag and exposes classic renderer functions. Splitting that API requires the C4 module boundary; C3 must not create a service locator to hide it.
* Project-trash permanent deletion still coordinates multiple canonical mutation owners and the cloud lifecycle. Backend batching/query redesign is out of scope.
* AppDataStore and repository live-object publication still has a compatibility identity bridge (`KarhaLegacy.getProject`); removing it safely belongs with C4 imports and store consumers.
* Named feature globals are immutable or owner APIs where practical, but remain install-order dependencies until C4.

## C3 result

* `featureComposition.js`: 371 lines / 17,733 bytes before; 265 lines / 11,624 bytes after.
* `KarhaLegacy`: 59 installer entries before; 43 allowlisted, frozen delegate entries after.
* Removed facade entries: `setActiveProject`, `selectProject`, `getActiveProjectId`, `getActiveProject`, `projectItemRuntime`, `openContractsPage`, `closeContractsPage`, `openRealContractFormShell`, `closeRealContractFormShell`, `suppressWorkspaceBack`, `findProjectRecordReferences`, `renderAccountingWorkspace`, `openActivityForm`, `openActivityEditForm`, `requestCloseActivityForm`, `activityFormRuntime`, and `contactFormRuntime`.
* `openJalaliPicker` was previously appended by startup after facade installation. It is now part of the single declared surface and remains a thin `KarhaUI` delegate, so the net surface changes from 59 installer entries plus one later mutation to 43 entries installed once.
