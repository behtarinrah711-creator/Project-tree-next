# Post-Phase 8 D3 — Projects sole path

## Inventory and classification

The pre-edit inventory covered every `data.projects` access and every call to
`projectRepository.all/find/getActiveProject/saveProjectsList/updateProject`,
plus the `findProject`, `getProjectsList`, `getCurrentProject`, contract shell,
cloud apply, project lifecycle, soft-delete, and E2E seed paths.

| Classification | Paths found | D3 ownership |
| --- | --- | --- |
| Navigation | `core/router.js`, `core/projectWorkspace.js`, `core/drawerProjectList.js`, legacy `selectProject`/route/open functions | Resolve through repository methods backed by `KarhaAppData.getProjects()`; legacy `findProject` reads the same snapshot. |
| Render | workspace modules (dashboard, tasks, people, activities, reports, statuses, contracts), export view, and legacy workspace renderers | Repository and legacy render reads share `snapshot.projects`; workspace and drawer merge/fallback reads were removed. |
| Persistence | `data/projectRepository.js`, domain/repository updates, legacy `persist`, project create/rename/archive/trash and scoped collection writes | Repository writes replace/update `snapshot.projects` and invoke AppDataStore persistence. Legacy mutations already operate on that same array and use legacy `persist`. |
| Cloud apply | `sync/applyCloudSnapshot.js`, legacy merge/hydrate/listener paths, recovery retention | Repository cloud upserts now mutate the canonical snapshot. Legacy hydrate assigns `data.projects` on the AppDataStore snapshot and therefore remains the canonical cloud-apply path, not another store. |
| Soft-delete | `core/softDelete.js`, legacy project/task/contact/activity undo and permanent removal, domain `trash` methods | Lookups and mutations target canonical project objects; D4 dirty/pending ownership is unchanged. |
| Test seed | repository unit fixtures, router/drawer/cloud recovery fixtures, `tests/e2e/contract-form.spec.js`, and `tests/e2e/projects-footer-navigation.spec.js` localStorage seeds | Browser seeds hydrate AppDataStore once; subsequent repository and UI reads use its project list. |

## Design decision

**Design A** is the smallest safe cutover: runtime `ProjectRepository` methods
delegate to `KarhaAppData` whenever the store is installed, while its existing
storage adapter behavior remains available only outside the application runtime
(unit tests and pre-bootstrap compatibility). This avoids changing every module
API, keeps cloud/scoped repositories intact, and changes no Auth, Sync, schema,
storage key, dirty-set, or pending-write ownership.

Design B would require replacing repository list/find calls throughout domain,
module, and sync layers. That is broader and risks crossing into later migration
slices without providing a stronger invariant than A: in the browser both the
repository and legacy `data` now reference `KarhaAppData.snapshot.projects`.

## Dual-source paths removed

- Project workspace no longer merges repository projects with a live legacy list
  or falls back from repository lookup to legacy lookup.
- Drawer resolution no longer falls back to `KarhaLegacy.getProjectsList()`.
- Router and dashboard no longer prefer a legacy project over a repository
  project.
- Real Contract no longer uses `repository || legacy findProject` lookup.
- Project create/update no longer copies repository results into a separate
  legacy list/object.
- Activity/contact form persistence no longer copies fields between repository
  and legacy project objects.

No D3.1 fallback remains in the browser runtime. Storage reads in an explicitly
standalone `ProjectRepository` are a persistence/test boundary, not a second
runtime source.
