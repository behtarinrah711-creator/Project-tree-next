# Navigation and Back inventory

## Scope and method

This inventory was completed before the broad correction. A portable Node scanner walked every production `.js`, `.mjs`, and `.html` file and searched history methods, `popstate`, hashes, Back/close handlers, child/modal/picker stacks, restoration state, and suppression/lock flags. Tests and generated dependencies were excluded from production counts.

## Original mechanisms

| File | Function/module | Operation | Surface | Owner and reason | Kind / competing owner | Decision | Canonical API |
|---|---|---|---|---|---|---|---|
| `src/core/router.js` | `AppRouter.start` | `popstate` listener | all hash routes | Router synchronized route changes | route; competed with child listener | CONSOLIDATE | `KarhaBrowserHistory.register('route', …)` |
| `src/core/router.js` | `navigate`, condemned-route correction | `pushState` / `replaceState` | project modules/footer/drawer | Router created and corrected routes | route; entries lacked version, entry identity, and child position | REPLACE | `push/replace(stateForRoute())` |
| `src/core/childHistoryController.js` | controller IIFE | second `popstate` listener | every same-route child | child owner unwound an in-memory `layers` shadow | child; the same event also reached Router | CONSOLIDATE | `register('child', …)` |
| `src/core/childHistoryController.js` | `open` | `pushState({karhaChild})` | forms, menu roots, overlays, pickers | made child surfaces Back-dismissable | child; copied arbitrary current state | REPLACE | `push(stateForChild())` |
| `src/core/childHistoryController.js` | `consume` | `back` / `go(-steps)` | visible application Back/close controls | tried to make UI close follow browser traversal | child; direct browser ownership | REPLACE | canonical `go()` request |
| `src/core/childHistoryController.js` | `replace` | `replaceState` | menu-root/footer transition | mutated the current synthetic entry | child; could leave a stale menu entry | REPLACE | canonical `replace(stateForChild())` |
| `src/core/workspaceHistory.js` | `createWorkspaceHistory` | independent `pushState`, manual `depth` | workspace | transitional legacy helper duplicated child depth | same-route; parallel shadow stack | DELETE | child controller |
| `src/core/backGestureGuard.js` | `installBackGestureGuard` | 180ms suppression timer/global flag | Contract overlays | prevented one event cascading between competing Back owners | event guard; hid double dispatch | DELETE | single dispatcher |
| `src/modules/contracts/searchTemplateModule.js` | suppression hooks | one-shot global/manual flag | Search Template, numpad, Jalali | swallowed workspace Back after child close | event guard; competed with workspace handler | DELETE | child restoration |
| `src/modules/contracts/searchTemplateModule.js` | open/close/search mode | child open/consume, multi-step `go` | Search Template/search mode | represented two meaningful nested screens | child; close could consume two entries | KEEP through boundary | child controller |
| `src/modules/contracts/contractHistoryController.js` | form/template registration | child register/open/consume | Contract forms | feature policy adapter described Contract child state | child; no physical listener | KEEP / ADAPT | child controller transitions |
| `src/modules/contracts/realContractFormModule.js` | `requestClose` | re-pushed consumed form entry | dirty Contract | repaired history immediately after a pop so Stay was possible | child; created repair loop/double-Back risk | REPLACE | transition `restore()` (Forward traversal) |
| `src/modules/contracts/contractPickers.js` | nested activity callback | after-next-pop queue | Project Item → Activity | delayed opening parent picker until one history pop completed | child coordination | KEEP | child controller callback |
| `src/ui/jalali.js` | open/close/register | child entry plus suppression | Jalali picker | substantial picker expected to dismiss on Back | child; suppression also affected workspace | KEEP entry / DELETE guard | child controller |
| `src/ui/numpad.js` | open/close/register | child entry plus suppression | numeric editor | substantial overlay expected to dismiss on Back | child; suppression also affected workspace | KEEP entry / DELETE guard | child controller |
| `src/ui/workspaceFormPresentation.js` | create/menu registrations | child open/consume | create project, drawer root pages | full-screen same-route pages | child | KEEP | child controller |
| `src/ui/workspacePresentationRuntime.js` | context Back/close functions | manual close then child consume | settings/contracts/menu roots | selected close routine from mutable `workspaceSubpage` | child; could fight pop restoration | CONSOLIDATE | child controller / route Back |
| `src/ui/workspaceChrome.js` | footer handlers | route navigation plus extra child entry | Reports/Accounting/Settings | footer navigation was both a route and a workspace synthetic child | route and child duplicated one transition | REPLACE | Router route entry only |
| `src/modules/activities/activityFormModule.js` | form open/close | child open/consume | Activity form | full-screen nested form | child | KEEP | child controller |
| `src/modules/people/contactFormModule.js` | `backToList`, `discardAndBack` | local close/dirty dialog | Contact form | preserved contact dirty/draft semantics | UI close had no restorable child entry in some paths | CONSOLIDATE | owning child registration |
| `src/modules/reports/reportsModule.js` | report link | hash assignment | Reports | built an external Telegram share URL, not application navigation | non-navigation | KEEP | none |
| `src/core/applicationFoundation.js` | route lookup | reads hash | startup/project recovery | discovers direct-entry project only | route read, no Back ownership | KEEP | Router parser |

## Defects and root causes

1. **Duplicate listeners and competing owners:** Router and child controller both received every physical `popstate`; correctness depended on hash comparisons and suppression flags.
2. **Insufficient state:** route entries held only `{projectId,moduleId}`; child entries used `{karhaChild}` with no application/version/entry contract. The initial entry was commonly `null`.
3. **Shadow state:** child `layers` and workspace `depth` could diverge from browser Forward history after refresh, replacement, or multi-step consumption.
4. **Non-navigation without entries:** some contact/trash/detail transitions only changed DOM, so Back skipped them or left the app.
5. **Over-recorded transitions:** footer routing could create both a route entry and a same-route workspace entry.
6. **Direct calls:** child history and workspace history directly invoked browser methods outside one boundary.
7. **Close/pop conflict:** close handlers changed DOM and then traversed; the resulting pop handler could close a parent again.
8. **Repair behavior:** dirty Contract Back consumed an entry and immediately pushed a replacement, truncating Forward history and producing double-Back behavior.
9. **Stale synthetic entries:** menu-root replacement and workspace depth could retain entries whose UI no longer existed.
10. **Forward gaps:** unknown child state after reload had no stable schema/dispatcher contract, and re-pushed dirty forms destroyed the forward branch.

## Navigation graphs

### Before

```text
browser popstate
  +--> Router listener --hash guard--> route sync
  +--> childHistory listener --> in-memory layers --> feature close
                                      +--> suppression flags/timers
                                      +--> dirty form push repair

UI Back --> feature close --> child history.back/go --> both listeners
footer  --> Router.pushState + optional child pushState
```

### After

```text
browser session history (source of truth)
  --> browserHistory (only popstate listener and History API caller)
       +--> route registration --> Router --> projectWorkspace/presentation
       +--> child registration --> childHistoryController --> feature restore/exit policy

UI Back --> browserHistory.back/go --> the identical restoration path
```

## Canonical state and classification

The serializable state is `{app:'karha', version:1, entryId, route:{projectId,moduleId,hash}, child}`. `child` is either `null` or `{id,key,payload}`. It contains presentation position only—never project/domain snapshots, DOM, functions, credentials, or Auth state. Startup uses `replaceState` to make the initial entry restorable.

Full-screen forms, Search Template and its search mode, Project Item/Activity nesting, Jalali, numpad, create-project, and drawer/menu root pages are navigable children. Confirmations, alerts, dirty-form Leave/Stay choices, toasts, and the drawer's purely transient open/closed chrome are local presentation and do not receive entries.

## Counts

Portable scanner counts over production JavaScript:

| Mechanism | Before | After |
|---|---:|---:|
| `popstate` listeners | 2 | 1 |
| `history.back()` calls | 1 | 1 (canonical boundary) |
| `history.go()` calls | 1 | 1 (canonical boundary) |
| `history.pushState()` calls | 1 | 1 (canonical boundary) |
| `history.replaceState()` calls | 2 | 1 (canonical boundary) |
| manual Back/navigation suppression/restoration flags | 23 textual occurrences | 0 |
| production files directly owning browser history outside the boundary | 2 | 0 |

The retained exception is the canonical boundary itself. Hash reads remain in Router/startup; the Reports URL assignment is outbound sharing rather than SPA navigation.
