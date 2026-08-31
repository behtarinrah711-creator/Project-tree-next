# C2 history/workspace/Contract ownership inventory

This inventory was completed against merge `432bd57` before implementation. Categories are those requested in C2. “Src callers” names the active production boundary; tests are named where a direct caller/assertion existed.

| Symbol/block (previous file) | Class and responsibility | Active src callers | Active test callers | Canonical owner before C2 | Target and disposition | Reason |
|---|---|---|---|---|---|---|
| `workspaceSubpage` (`workspacePresentationRuntime.js`) | C/H: selected child presentation | Chrome, Contract shell, feature composition, `applicationRuntime` | workspace/Chrome and activity ownership tests | workspace runtime shared lexical state | workspace runtime, **KEEP presentation only** | It selects titles/actions but no longer drives Browser History. |
| `menuRootMode`, `menuRootPage` | C/H: root-page presentation | drawer/project management, footer navigation, runtime diagnostics | workspace Chrome tests | workspace runtime | workspace runtime, **KEEP presentation only** | Visibility/context values remain UI state; history flags moved. |
| `menuRootHistoryPushed`, `pushMenuRootHistory`, root pop listener | B/H/K: menu child stack | profile/projects page open/close | footer navigation E2E | workspace runtime + feature composition | `childHistoryController`, **MOVE/DELETE listener and flag; thin open call** | The flag and second listener duplicated child Back ownership. |
| `createPageHistoryPushed`, create pop listener | B/I: create-project child stack | create page buttons | projects footer E2E | workspace runtime | `childHistoryController` + `workspaceFormPresentation`, **MOVE** | Form remains presentation-owned while stack state is canonical. |
| create-page, incomplete-exit, mini-prompt and numpad delegates | D/I/L: generic form/dialog presentation | project, Contact/Activity and Contract callers | form-exit tests | workspace runtime | `workspaceFormPresentation`, **MOVE** | Removes generic form bodies from workspace surface renderer without changing UI. |
| tabs, mode, surface, settings/reports/accounting rendering | C/L: workspace presentation | Chrome/router surface application | workspace Chrome/regression tests | workspace runtime/Chrome | workspace runtime, **KEEP** | These are DOM rendering and binding only. |
| `handleWorkspaceContextBack/Action` | C/L: UI toolbar dispatch | workspace Chrome callbacks | workspace Chrome tests | workspace runtime | workspace runtime, **KEEP** | Button dispatch is UI binding; Browser Back is not implemented here. |
| Contract template/domain helper functions (`contractCompatibility.js`) | J: classic facade | template form, app runtime legacy facade | Contract bridge/ownership tests | domain modules through compatibility | compatibility, **THIN DELEGATE** | Active classic callers require names while domain modules own implementation. |
| template form state/dirty/history and open/close/request-close | E/F: template lifecycle and child stack | template form module/context bar | Contract tests/E2E | compatibility | `contractFormLifecycle` + `contractHistoryController`, **MOVE** | Separates session/shell policy from history mechanics. |
| Contract shell/list/form functions | J | Contract module, Chrome, legacy facade | Contract bridge tests | shell/form modules via compatibility | compatibility, **THIN DELEGATE** | Preserves classic active callers without implementation bodies. |
| `requestCloseContractForm` and Back/Stay/Leave | E/F/J | child controller, context bar, real form | form-exit and Contract E2E | real form plus compatibility/pop listeners | real form + `contractHistoryController`; compatibility **THIN DELEGATE** | Real form retains exact dirty decision policy; history ownership is removed from it. |
| `formHistoryOwned` and direct `history.back` (`realContractFormModule`) | F | real form open/close/requestClose | Contract bridge/E2E | real form | `contractHistoryController`, **MOVE** | Browser-entry ownership belongs to the canonical child stack. |
| Search Template state/render/star/select/save block | G | Contract pickers and `KarhaSearchTemplate` API | Contract E2E | compatibility and duplicate `core/searchTemplate.js` | `searchTemplateModule`, **MOVE**; duplicate core file **DELETE** | One explicit owner replaces two implementations. |
| Search Template/search-mode flags, direct calls and pop listener | B/F/G/K | Search Template UI | Contract E2E | compatibility and duplicate core module | `childHistoryController` registration, **MOVE/DELETE** | Back closes search mode, then template, through one coordinator. |
| Jalali/numpad history flags, calls and pop listeners | B/I | UI primitive installers, Contract form | Contract E2E | each UI primitive | child registrations, **MOVE**; UI rendering **KEEP** | Feature UI registers close callbacks; controller owns Browser History. |
| Activity `historyPushed`/`history.back` | B/E | activity form open/close | activity ownership tests | activity form | child registration/controller, **MOVE** | Activity retains lifecycle only. |
| Contact/activity list pushes; menu pop listener (`featureComposition.js`) | B/K | people/activity/root page openers | ownership tests | feature composition | controller calls/listener **MOVE/DELETE** | Minimal C2-only edits remove ad-hoc history without composition refactoring. |
| Contract picker one-shot pop listener + timeout | B/K | project-item → activity picker chain | Contract E2E | Contract picker | controller `afterNextPop`, **MOVE/DELETE** | Removes duplicate listener and timing fallback while preserving sequencing. |
| `workspaceHistoryDepth` and monolithic child pop switch (`childHistoryController.js`) | B/K | all child surfaces | router same-route test | controller, but DOM/flag based | descriptor stack in controller, **REPLACE** | Registration, deduplication, top-only Back and Forward restore become explicit. |
| Router pop listener and route `replaceState` | A | app router/project workspace | router tests | Router | Router, **KEEP** | Route/project navigation is outside child ownership. |
| back gesture guard pop listener | B/K | startup | startup/Contract E2E | guard | **DELETE listener**, keep query/suppress UI API | Suppression no longer requires a competing popstate observer. |

## Previous owners discovered

Same-route Browser History was split across workspace presentation, feature composition, Contract compatibility, real Contract form, Search Template’s two implementations, Jalali, numpad, Activity form, Contract picker sequencing, the back gesture guard, and the old child controller. Router independently and correctly owned route history.

## Final model

* `router.js` owns route/project entries and route popstate.
* `childHistoryController.js` is the only same-route History API/popstate owner and exposes registration, open/consume/replace, deduplication and post-pop sequencing.
* features retain rendering/session state and register narrow close/restore callbacks.
* `workspacePresentationRuntime.js` contains workspace rendering/bindings only; generic form presentation is in `workspaceFormPresentation.js`.
* Contract lifecycle, Contract history policy, Search Template implementation, and compatibility delegation have separate owners.
