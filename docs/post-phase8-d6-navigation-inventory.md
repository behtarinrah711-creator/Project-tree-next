# Post-Phase 8 D6 — main surface and navigation ownership

## Baseline inventory

Before D6, `legacyApp.js` was 3,388 lines and was still the effective navigation state machine despite the modular Router existing.

| Responsibility | Pre-D6 owner / classification | D6 disposition |
| --- | --- | --- |
| `activeTab` | AppDataStore canonical state; legacy producer | Remains Store-only; Router and projectWorkspace use Store APIs. |
| Project route parsing, push/replace/pop | Router plus duplicate legacy route helpers | Router is canonical; legacy helpers delegate to projectWorkspace. |
| Current project context | Router/projectContext consumer plus legacy active-project helpers | Router synchronizes context and Store in one route transaction. |
| Project selection | Legacy `setActiveProject` and `KarhaLegacy.selectProject` | `projectWorkspace.selectProject` is canonical; legacy APIs delegate. |
| Drawer project selection | Legacy UI producer | Calls canonical projectWorkspace selection directly. |
| Footer navigation | Four legacy handlers combining route, state, visibility, and rendering | Handlers are UI producers only and call the same canonical projectWorkspace path. |
| Route-to-module mapping | Router/moduleRegistry plus legacy footer/startup decisions | Router/moduleRegistry is canonical. |
| Route-to-surface/footer mapping | Partial `projectRouteSurface` plus legacy conditionals | Centralized in `PROJECT_ROUTE_SURFACES`. |
| Workspace mount/remount | Router plus legacy `renderAll`/startup | Router mounts registered modules; same-route child entries remain guarded. |
| Startup restoration | Legacy rewrote most deep routes to dashboard before Router start | Existing project/module deep route is left intact for Router startup; Store fallback uses replace navigation. |
| Contracts project selection | Module explicit route project plus legacy shell fallback | Contracts route mounts with Router project; Reports entry uses projectWorkspace. |
| Dashboard/tasks selection | Router context and Store-backed repositories | Unchanged canonical read path. |
| Page visibility | Legacy helpers and modular DOM adapters | Modular route surface owns routed page/footer selection; legacy keeps thin internal-page/form adapters. |
| `mainSurface` | Contradictory legacy state/render gate | Removed; refresh gates consume `KarhaRoute.moduleId`. |
| `workspaceSubpage` | Legacy child-page/form state | Retained only for non-routed internal pages/forms and compatibility context rendering. |
| `menuRootMode` / `menuRootPage` | Legacy drawer-root page state/history | Retained for profile/project-management pages outside project routes. |
| `managementProjectTab` | Legacy project-management UI state | Retained; it is not selected-project routing. |
| Context bar updates | Legacy UI render callback | Retained as a view callback invoked after modular surface application. |
| Form/overlay Back | Legacy and extracted form/history helpers | Preserved; Router ignores same-hash child history entries. |
| Cloud recovery route restore | Legacy-first selection | Store/projectWorkspace-first, with Router compatibility fallback for isolated harnesses. |
| `KarhaLegacy` navigation facade | Compatibility owner | Reduced to delegation/view adaptation. |

## D6 ownership model

- **AppDataStore** remains the sole owner and writer API for `activeTab`.
- **projectWorkspace** validates a project and performs the Store selection + Router navigation transaction.
- **AppRouter** owns push/replace/pop, startup route restoration, project context synchronization, module resolution, and module mounting.
- **projectRouteSurface** owns the centralized module-to-page/footer surface map and applies routed DOM visibility.
- **Modules** render against the explicit routed project or canonical project context/repository.
- **Legacy** retains only UI callbacks and compatibility delegates where extracting form/menu internals would cross the Final Legacy Audit/Cleanup boundary.

## Legacy paths removed or delegated

- Removed legacy History API/hash fallbacks from `setWorkspaceRoute` and `replaceWorkspaceRoute`; both delegate to projectWorkspace.
- Removed legacy-first dispatch from `projectWorkspace.selectProject`.
- Removed legacy project selection from module mounting.
- Removed drawer calls to legacy `setActiveProject`.
- Removed footer route/surface decision sequences in favor of a shared canonical navigation producer.
- Removed route-event mutation of active project and route-event reopening of Contracts.
- Removed startup deep-route rewriting to dashboard and the contracts-only startup visibility branch.
- Removed `mainSurface` and its render decisions.
- Changed Reports → Contracts entry to the canonical projectWorkspace route.
- Changed cloud recovery selection to prefer AppDataStore/projectWorkspace.

## Navigation/surface responsibilities intentionally remaining in legacy

- `workspaceSubpage` for child pages and forms that deliberately share a parent route.
- `menuRootMode`, `menuRootPage`, and menu-root history for profile/project-management overlays.
- `managementProjectTab` for active/deleted/archive management presentation.
- Context-bar rendering and its Back/action callbacks.
- Internal form mode, footer hiding during forms, and form/overlay `popstate` behavior.
- Thin visibility delegates (`showOnlyWorkspacePage`, `closeBottomPages`, workspace entry helpers).
- Contract form/list shell callbacks required by existing extracted contract modules.
- Drawer open/close rendering and footer active CSS rendering as view behavior.

These are explicit Final Legacy Audit/Cleanup candidates; they are not alternate project/module routing owners.

## Non-navigation legacy work reserved for final audit

Auth and Firebase session UI, Firestore compatibility and recovery helpers, task rendering widgets, project-management CRUD UI, contact/activity form bridges, contract/template shell callbacks, export/status remnants, confirm/toast compatibility, formatting/icon helpers, and other classic DOM rendering remain out of D6 scope.
