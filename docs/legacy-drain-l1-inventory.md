# Legacy Drain L1 — safe-purge inventory

Inventory date: 2026-08-24. Baseline is merged D6 commit `28a08b3` (PR #76):
`src/legacy/legacyApp.js` was 3,339 lines. Searches covered `src/`, `tests/`, and
`index.html`; documentation mentions are not runtime callers.

## Candidate inventory

| Symbol/block | `src/` callers | Test callers | Canonical owner/evidence | Action and reason |
|---|---|---|---|---|
| `openCollabPage`, `closeCollabPage`, `renderCollabPage` | zero | zero | `collab` is condemned; no collaboration DOM | **DELETE:** toast/empty removed-feature stubs had no route, facade, inline handler, or caller. |
| `openShareForm`, `submitShareForm`, `closeShareForm`, `requestCloseShareForm`, `openShareDialog`, `closeShareDialog`, `removeShare` | zero | zero | `share`/`shareForm` are condemned; no share DOM | **DELETE:** no-op removed-feature stubs had zero callers. |
| `.collab-*`, `#collabPage` CSS | zero selector producers | zero | no collaboration DOM | **DELETE:** orphan styles belong only to removed collaboration UI. |
| Status/letter stubs (`openStatusForm` through `generateNextLetterNo`) | `navigateFooter` still calls `openStatusForm`; other stubs have zero direct callers | zero | statuses/letters are condemned | **KEEP:** the block has an active production caller and piecemeal removal is not justified; drain with its navigation contract later. |
| `.bottom-nav.starred-disabled` CSS | zero; code only removes the class | zero | Global Starred navigation was removed | **DELETE:** orphan state is never produced. |
| `refreshStarredPartial` | passed to and called by `taskRuntimeModule` | zero direct | no replacement callback | **KEEP:** no-op body nevertheless has active production callers. |
| `removeFromStarredOrder`, `starredOrder` normalization | `taskRuntimeModule` and load/task flows | zero direct | stored-data compatibility | **KEEP:** active caller and persisted compatibility. |
| remaining `'starred'` guards/sentinels | startup/render/navigation/management/trash | E2E indirectly | later navigation/history drain | **KEEP:** intertwined with active selection and deletion behavior. |
| UI bridges: `showToast`, confirm, numpad, incomplete-exit choice | legacy flows and migrated modules/facade | contract/workspace coverage | `KarhaUI` | **KEEP / THIN DELEGATE:** active contracts; UI primitives install after classic legacy evaluation, so universal availability is not proven. |
| digit/cost helpers (`toPersianDigits`, `toEnglishDigits`, `formatCost`, `groupWithCommas`, `formatCostDisplay`, sums) | drawer/dashboard/task UI/facade | E2E indirectly | digits only: `KarhaUI`; no equivalent cost owner | **KEEP / THIN DELEGATE:** active APIs and distinct cost semantics. |
| SVG/icon helpers | task/search/legacy UI | E2E indirectly | no modular icon owner | **KEEP:** active; extraction is L3. |
| `KarhaLegacy.escapeHtml` and Jalali delegates | export/contracts | unit/E2E | `KarhaHtmlEscape` / `KarhaUI` | **KEEP / THIN DELEGATE:** facade consumers remain; Jalali UI installs after legacy. |
| AppDataStore load/persist/dirty/tab/view bridges and defensive branches | broad runtime/persist adapter | store/startup tests | `AppDataStore`, installed before legacy | **KEEP / THIN DELEGATE:** active D1/D2 bridge; recovery/catch simplification is excluded. |
| D3–D5 project/task/sync/cloud delegates and fallbacks | broad project/auth/hydration flows | unit/E2E | `KarhaApp` modular APIs | **KEEP / THIN DELEGATE:** active; fallbacks touch excluded cloud recovery safeguards. |
| D6 route/workspace delegates | drawer/footer/router startup | router/navigation/E2E | Router/projectWorkspace | **KEEP / THIN DELEGATE:** active navigation contracts; history/workspace are excluded. |
| all `KarhaLegacy` facade entries | static and string-key dynamic consumers across core/modules | startup/router/contracts/recovery tests | compatibility boundary | **KEEP:** no entry is safely unused after dynamic dispatch is included. |
| Auth/Firebase/recovery/history/workspace/task/trash/project/contact/activity/form blocks | many | many | reserved L2–L6 | **KEEP:** explicitly outside L1 regardless of thinness. |

## Install-order proof

`startApplication` publishes `KarhaApp`, installs `KarhaAppData` and
`KarhaHtmlEscape`, and then awaits the classic runtime. Router startup occurs
after `KarhaLegacy` exists. `KarhaUI` deliberately installs after legacy, which
is why active UI bridges and their fallbacks remain. The L1 focused test locks
this order and the absence of deleted remnants.

## Reserved work

- **L2:** workspace chrome/context/footer/drawer rendering.
- **L3:** task UI, trash, and project-management rendering.
- **L4:** contact/activity UI, forms, bridges, and exit guards.
- **L5:** Firebase/Auth/current-user/cloud hydration, repair, and recovery.
- **L6:** final facade and contract Back/Stay/history, popstate,
  `workspaceSubpage`, menu-root, and historical contract drain.
