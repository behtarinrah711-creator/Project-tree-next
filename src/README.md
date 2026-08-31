# Modular Project-tree architecture

`index.html` is now a shell: it owns the static app containers and loads the extracted CSS/JavaScript bundles. The legacy runtime remains available while features are migrated module by module.

## Layers

- `src/bootstrap/` starts the app, cache guard, router, module registry, and shared services.
- `src/core/` contains route parsing, module registration, and `ProjectContextStore`.
- `src/data/` reads existing localStorage data without resetting or renaming legacy keys.
- `src/modules/<module>/` contains one independently registered project module.
- `src/styles/legacy.css` contains CSS extracted from the old monolithic file.
- `src/bootstrap/applicationRuntime.js` is the final startup/wiring fragment; the state-free `window.KarhaLegacy` publisher lives in `src/legacy/karhaLegacyFacade.js`.

## Migrated module boundaries

The following real capabilities are registered as project modules and receive the active `projectId` before delegating to their current legacy renderer:

| Module | Capability | Legacy entry point | Project-scoped data |
| --- | --- | --- | --- |
| `dashboard` | project task dashboard | `renderAll` | active project tasks |
| `contracts` | contracts and contract templates | `openContractsPage` / `renderContractsPage` | `contracts`, `contractTemplates`, contacts, activities |
| `statuses` | status reports | `openStatusList` / `renderStatusList` | `statusReports` |
| `minutes` | meeting minutes | `openMinutesPage` / `renderMinutesPage` | `minutes` |
| `letters` | letters and letter numbering | `openLettersPage` / `renderLettersPage` | `letters`, `letterCounters` |
| `accounting` | accounting workspace | `renderAccountingWorkspace` | tasks, contracts, status reports |
| `purchases` | purchases | `openPurchasesPage` / `renderPurchasesPage` | `purchases` |
| `reports` | reports workspace | `renderReportsWorkspace` | tasks, contracts, status reports |
| `people` | contacts, staff, contractors | `openContactsPage` / `renderContactsPage` | `contacts`, activity templates |

## Final L6 runtime boundaries

`src/legacy/legacyApp.js` no longer exists. Startup loads ordered, classic-script
fragments for the data foundation, workspace presentation, contract
compatibility, feature composition, child history, and final bootstrap. This
preserves the original browser execution semantics while giving each remaining
responsibility an explicit modular file. `src/legacy/karhaLegacyFacade.js` owns
only state-free publication of compatibility delegates.

## Navigation and workspace scope

Project selection is intentionally global and happens only through the top-right hamburger drawer. The drawer owns account/email display, project management, deleted records, and the selectable project list. The footer `Projects` tab is not a project switcher anymore; it renders only the working items for `data.activeTab`, which is synchronized to `#/projects/<projectId>/<module>` and `ProjectContextStore`.

When no project is selected, the reusable workspace renders an explicit empty state instead of falling back to the first or last project. Selecting a project calls the legacy bridge/selection helper, writes the route, updates the modular `projectContext`, refreshes the drawer active row, and then renders the active project's scoped workspace.


## Refactor step 281 — project data foundation

The project data layer now exposes a stable project-oriented API:
`getProjectsList()`, `getActiveProject(projectId)`, `scoped(projectId, collection)`,
`saveProjectsList(projects)`, and `updateProject(projectId, updater)`.

These methods continue to use the existing `gtasks-clone-v2` storage format and
preserve unrelated top-level data. No storage key was renamed or reset.

`src/core/projectScope.js` provides a reusable bridge from `ProjectContextStore`
to the active project and its scoped collections. Future modules should use this
layer instead of reading global project data directly.


## Refactor step 282 — project workspace selection

`src/core/projectWorkspace.js` is now the reusable boundary for project listing,
lookup and selection. The legacy runtime remains the compatibility implementation,
but exposes a stable bridge (`getProjectsList`, `getProject`, `selectProject`) so
the Workspace can use one project-selection contract without copying project HTML.

Project selection writes `#/projects/<projectId>/<module>` and updates
`ProjectContextStore`. The project drawer consumes the same workspace service,
while the Footer remains project-scoped and is not used for project selection.


## Refactor step 283 — statuses module

`statuses` now has an independent module entry point and no longer imports
`legacyModule.js`. Its rendering, add/edit/delete flow, persistence, empty state,
and project scoping live under `src/modules/statuses/`. The legacy implementation
was removed only where the matching function bodies could be identified safely.


## Refactor step 284 — reports module

The actual `renderReportsWorkspace` implementation now lives in
`src/modules/reports/reportsModule.js` and is registered as the reports module.
It reads the active project through `ProjectContext`/`ProjectRepository` and routes
the contracts option through the modular hash router.

`applicationRuntime.js` retains only a compatibility bridge named `renderReportsWorkspace`
so existing legacy navigation call sites continue to work; the renderer itself is
no longer implemented there.


## Refactor step 285 — reports completion

The reports module now preserves the application's current Reports scope exactly:
the Reports page currently contains only **Contractor Contracts**. No additional
report categories were invented.

The module receives the active `projectId`, validates the project through the
project repository, shows an empty state when no valid project is active, and
routes the existing Contractor Contracts item through the modular project route.
It has no dependency on `legacyModule.js` or a legacy renderer.


## Refactor step 286 — people module

The People/Contacts list renderer is now independent under
`src/modules/people/peopleModule.js`. It is project-scoped through
`ProjectContext` and `ProjectRepository`, includes the existing search,
activity labels, pending state, edit and soft-delete actions, and does not use
`legacyModule.js`.

The full contact form runtime now lives in
`src/modules/people/contactFormModule.js`. It owns form state, drafts, dirty and
validation behavior, activity selection, and create/edit persistence through
`ContactRepository`; the remaining legacy bridge only exposes shared workspace
UI services and synchronizes the existing in-memory/cloud persistence runtime.


## Refactor step 287 — activities module

The Activities list/search renderer is now independent under
`src/modules/activities/activitiesModule.js`. It is project-scoped through
`ProjectContext` and `ProjectRepository`, preserves the existing contract-template
and real-contract counts, search, edit and soft-delete behavior, and no longer
uses `legacyModule.js`.

The Activity create/edit form runtime now lives in
`src/modules/activities/activityFormModule.js`. It owns form state, dirty state,
rendering, validation, save, cancel, and browser-back handling, and persists both
new and existing records through `ActivityRepository`. The legacy runtime retains
only workspace UI and in-memory/cloud synchronization services behind the
`activityFormRuntime` compatibility bridge; the form itself does not access
`localStorage` or mutate `project.activityTemplates`.


## Refactor step 288 — contracts workspace

The Contracts module now has an independent project-scoped workspace entry point.
It reads the existing `contractTemplates` and `contracts` collections through the
project repository and exposes the two current contract surfaces: contract templates
and real contracts.

The existing complex contract lists/forms remain temporarily behind explicit legacy
bridges because they are coupled to project activities, contacts, drafts, and other
legacy workspace state. No contract data or existing form behavior was rewritten or
removed in this step.


## Refactor step 289 — contracts lists

The real contractor-contract and contract-template list renderers have now been
moved into `src/modules/contracts/contractsModule.js`. Both lists are project
scoped, searchable, and use the existing project repository data without changing
storage keys. Soft-delete behavior is preserved.

The complex contract/template forms, item editing, drag/drop, party picker,
save workflow, status and approval screens remain in legacy for the moment behind
explicit compatibility calls. This avoids duplicating or rewriting the large
coupled form state in this production-use migration step.


## Refactor step 290 — contract persistence boundary

The contract migration now introduces a project-scoped persistence boundary in
`src/modules/contracts/contractPersistence.js`. It uses the existing
`ProjectContext` and `ProjectRepository` APIs and does not rename storage keys.

The large contract/template form renderers remain in legacy in this step. The
goal here is to establish the safe data boundary before moving form state and
save handlers, avoiding a simultaneous rewrite of rendering and persistence.


## Refactor step 291 — contract-template domain helpers

The reusable contract-template data/domain helpers were migrated into
`src/modules/contracts/contractTemplatesDomain.js`: template collection access,
lookup, item creation/defaults, normalization, numbering, draft normalization,
and draft storage-key generation.

`applicationRuntime.js` now contains only compatibility wrappers for these helpers; the
implementation/source of truth is the modular domain file. Storage keys and data
shape are unchanged.


## Refactor step 292 — contract-template form UI

The contract-template form state and UI renderer, including inline item/material
editing, preview, activity selection, add-row behavior and drag interactions,
were moved into `src/modules/contracts/contractTemplateFormModule.js`.

`applicationRuntime.js` now keeps only the surrounding workspace/navigation compatibility
entry point and delegates the actual form UI to the module. Contract-template
save/persistence remains in the existing legacy handler until the next migration
step, so the current save behavior is not duplicated or rewritten.


## Refactor step 293 — contract-template persistence

The project-scoped save/delete persistence for contract templates is now available
in `src/modules/contracts/contractTemplatePersistence.js`. It uses the existing
`ProjectRepository` and preserves the existing `contractTemplates` collection and
storage keys.

The legacy save handler remains temporarily as the active compatibility path; no
existing save behavior was removed or duplicated in the UI. The next step can
switch the migrated form's Save action to this modular persistence service after
verifying its exact data-shape compatibility.


## Refactor step 294 — contract-template save cutover

The migrated contract-template form now saves through
`contractTemplatePersistence.saveContractTemplate()`. The old
`saveContractTemplateClean` implementation in `applicationRuntime.js` has been replaced
by a compatibility bridge only.

The modular save preserves the existing data-shape behavior: activity-based title,
removal of empty items/children, empty `paymentItems`, `updatedAt`, `trashed`,
existing project collection, and existing storage key. Draft cleanup and existing
close/toast behavior remain compatible through the bridge.


## Refactor step 295 — real-contract domain

The reusable real-contractor-contract domain logic is now modular in
`src/modules/contracts/realContractDomain.js`: project-scoped contract access,
lookup, draft normalization/creation, template cloning, item renumbering, and
item movement.

The real-contract form renderer, event wiring, and save workflow remain legacy
for now. `applicationRuntime.js` contains compatibility wrappers for the migrated domain
functions rather than duplicate implementations.


## Refactor step 296 — real-contract form renderer

The real contractor contract form renderer and its item renderers were moved into
`src/modules/contracts/realContractFormModule.js`. The form is now initialized
through the module using the active project and the modular real-contract domain.

Legacy retains only navigation/compatibility wrappers. The existing save handler,
picker/search surfaces, payment-stage renderer and approval/status pages remain
legacy for subsequent isolated migration steps.


## Refactor step 297 — real-contract save cutover

The real contractor contract save workflow is now implemented in
`src/modules/contracts/realContractPersistence.js` and called by the modular
real-contract form.

The existing validation and data-shape rules were preserved: contract date,
project item, employer, contractor, activity, start/end dates, amount,
retention, contractor/contact compatibility, activity title, item normalization,
retention amount calculations, timestamps, and the existing `contracts`
collection.

`applicationRuntime.js` now retains only a compatibility bridge for `saveRealContract`.


## Refactor step 298 — contract pickers

Contract selection logic was moved into `src/modules/contracts/contractPickers.js`.
This covers employer, contractor, contractor activity, project item, and static
choice selections. The selection mutations now live in the modular service and
remain project-scoped.

The existing search-template UI is reused through a compatibility bridge so its
current appearance/behavior is preserved. Contact creation remains connected to
the existing Contacts form.


## Refactor step 299 — contract payment stages

The contractor contract payment-stage logic is now modular in
`src/modules/contracts/paymentStagesModule.js`: normalization, add/remove,
progress/payment percentage updates, descriptions, and rendering.

The existing numpad and form re-render behavior is preserved through explicit
callbacks. The legacy `renderPaymentStages` function is now only a compatibility
wrapper.


## Refactor step 300 — contract status reports

The contractor contract status/progress report screen was migrated to
`src/modules/contracts/contractStatusModule.js`. It preserves the current
project-scoped contract selection, cumulative progress calculation, stage amount,
remaining amount, report history, accounting-pending status, and progress timeline
updates.

The legacy `renderContractStatusPage` is now only a compatibility bridge.


## Refactor step 301 — contract approval

The contractor contract approval/payment review screen was migrated to
`src/modules/contracts/contractApprovalModule.js`. It preserves the existing
approval/rejection/payment rules and writes to the existing
`contractStatusReports` records without renaming storage fields.

The legacy `renderContractApprovalPage` is now only a compatibility bridge.


## Refactor step 302 — contract legacy audit cleanup

An audit of the remaining contract-related code in `applicationRuntime.js` found several
small domain helpers still implemented there despite the larger migrations.
`makeRealContractDraft`, real-contract item renumbering/movement, and
contract-party data synchronization are now delegated to
`realContractDomain.js`. Drag/drop event wiring and page navigation remain in
legacy intentionally because they are UI compatibility concerns.

The audit found no need to rename existing storage keys or change the contract
data collections.


## Refactor step 303 — contract item interactions

Contract item movement and inline-add interaction primitives are now isolated in
`src/modules/contracts/contractItemInteractions.js`. Pointer drag movement,
target positioning, renumbering, persistence callback, and inline-add row creation
are modularized. Existing CSS classes and visible behavior are retained.

Legacy keeps only compatibility event wrappers; the larger form renderer remains
the owner of form-specific state.


## Refactor step 304 — real-contract inline add

The real contractor-contract inline add workflow is now owned by
`realContractFormModule`: adding root items and child clauses, renumbering,
dirty state, repeated Enter/focus behavior, and cancellation state are handled
inside the module.

The corresponding `applicationRuntime.js` implementation is now a compatibility bridge.


## Refactor step 305 — contract item mutation API

Real-contract item text updates and deletion are now delegated to the modular
`contractItemInteractions.js` API. The form renderer keeps only DOM/event
orchestration and re-rendering. Existing item IDs, nesting, numbering and
dirty-state behavior are preserved.


## Refactor step 306 — dashboard renderer

The project dashboard renderer (`renderProjectView`) has been moved to
`src/modules/dashboard/dashboardModule.js`. The module resolves the active
`projectId` through `ProjectContext`/`projectRepository`, preserves the existing
task-list markup/behavior, and keeps task interaction helpers behind explicit
legacy compatibility calls for now.

`renderAll` remains responsible only for global navigation/tab orchestration and
delegates the actual project dashboard rendering to the dashboard module.


## Audit step 307 — Project Item → Activity → Contract Template

The existing project-item schema was verified: project tasks and subtasks store
their activity relation in `item.activities` (an array of activity IDs).
`activityTemplates` stores activities by `id`, while `contractTemplates` stores
the prepared contract form by `activityId`.

The contract picker now treats `Project Item.activities` as the primary link.
When an item has exactly one activity, the activity and its unique contract
template are resolved automatically. When an item has multiple activities, the
code preserves all IDs and deliberately does not guess which template to use.


## Refactor step 308 — shared Search Template component

The existing Search Template UI was extracted from `applicationRuntime.js` into
`src/core/searchTemplate.js` without changing its visual contract or its
selection/add/search behavior. The component owns its UI state and history
layers. Legacy data persistence for per-context stars remains behind an
explicit bridge, so localStorage/project data behavior is unchanged.

`applicationRuntime.js` now contains only compatibility wrappers for the Search Template
API and the existing persistence hooks; the actual renderer and interaction
logic live in the shared component.


## Refactor step 309 — real contract selection flow

The real-contract flow now follows the production domain relationship:
Project Item → Activity Search → Contract Template → Contractor Search → Real Contract.

Activity is no longer independently selected from a contractor in the contract
form. Selecting a Project Item always opens the Activity Search, even when there
is only one linked Activity. Contractor Search is filtered to contractors linked
to the selected Activity.

The Search Template `+` actions now carry creation context: a new Activity
created from the contract flow is linked back to the selected Project Item, and
a new Contractor created from the contract flow is initialized with the current
Activity. Existing storage fields remain unchanged.
