# Post-Phase 8 D5 synchronization inventory (pre-edit)

Baseline: merge commit `d7cf64d` (PR #74/D4). `src/legacy/legacyApp.js` is 3,435 lines.
This inventory was completed before the D5 cutover.

| Path / symbol | Pre-D5 role | Classification |
|---|---|---|
| `legacyApp.persist`, `markDirty` and `sync/persistAdapter` registration | Debounced local persistence, iterates dirty projects and starts full cloud writes; domain APIs call the adapter | sync orchestration owner / producer / consumer |
| `sync/cloudSyncProject.cloudSyncProjectFull` plus legacy wrapper/context | Extracted project metadata/task writer, but legacy creates its complete context and owns retry hookup | sync orchestration owner / Firestore adapter / acknowledgement / compatibility facade |
| `sync/applyCloudSnapshot` / `applyCloudProjectList` | Canonical ProjectRepository/AppDataStore cloud upsert/list apply | hydrate/apply |
| `sync/mergeCloudSnapshots.mergeOwnedCloudSnapshots` plus legacy `mergeCloudSnapshots` | Pure anti-empty/dirty/pending merge is extracted; legacy gathers Store state, applies result and persists | hydrate/apply / consumer / sync orchestration owner |
| `sync/docToProject` plus legacy wrapper | Converts Firestore project docs, retains cached/recovered tasks, observes dirty/pending | Firestore adapter / recovery/repair / consumer |
| `sync/cloudListeners` plus legacy start/stop wrappers | Extracted owned-project query lifecycle; legacy callback sequences merge then hydrate | listener / sync orchestration owner |
| `sync/taskCloud` plus legacy task context/listener registry | Extracted task writes/listener merge; legacy builds context and owns unsubscribe registry/UI callbacks | listener / producer / acknowledgement / recovery/repair |
| `legacyApp.hydrateProjectTasksFromCloud`, `hydrateAllCloudProjects`, `recoverLegacyTasksForProject` | Reads task subcollections, same-name documents and collectionGroup; merges and verifies repairs without destructive empty replacement | hydrate/apply / recovery/repair / Firestore adapter / sync orchestration owner |
| `legacyApp.migrateGuestDataToCloud` | Login migration of guest projects, pending guard, metadata/task upload | hydrate/apply / producer / acknowledgement / Firestore adapter |
| Firebase auth observer and `startCloudListeners` call | Login sets cloud session, migrates guest data, starts owned hydrate/listen | sync orchestration owner (Auth boundary retained) |
| `legacyApp.addProject`, rename/delete/status helpers | Direct project lifecycle Firestore operations; create uses pending state and task write | producer / acknowledgement / Firestore adapter |
| `sync/projectStatusSync` plus legacy context wrappers | Extracted retry queue/status verification; legacy supplies Auth/Firestore context | sync orchestration owner / compatibility facade / recovery/repair |
| `AppDataStore` dirty and pending APIs/Sets | Canonical D4 runtime synchronization state | producer / consumer / acknowledgement |
| `ProjectRepository` calls in cloud apply, payload lookup and project resolution | Canonical D3 project reads/writes | consumer / hydrate/apply |
| `core/cloudProjectRecovery` and `projectRecoveryRetention` | Migration listeners and guards retain/restore valid projects/tasks against empty or stale snapshots | listener / recovery/repair / compatibility facade |
| `KarhaLegacy.persist`, `markDirty`, project getters, project item persistence | Compatibility entry points used by remaining UI/runtime modules | compatibility facade |
| `sync/*.test.js`, AppDataStore/repository tests, cloud recovery/lifecycle tests and contract/footer Playwright specs | Existing merge, task, ownership, recovery and UI-contract coverage | test only |

## Pre-D5 ownership finding

Although Firestore primitives were already extracted, legacy still owned the sequencing and built multiple ad-hoc context objects containing raw Set references. D5 should introduce one extracted Store-backed orchestration boundary, while leaving Auth state acquisition, recovery algorithms requiring legacy Firebase globals, and UI refresh callbacks behind narrow injected callbacks. No Firestore implementation belongs in AppDataStore.
