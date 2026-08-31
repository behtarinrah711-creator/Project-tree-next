# Post-Phase 8 — D5 Store-backed synchronization glue

## Architecture

D5 keeps `AppDataStore` as the state owner and makes extracted `src/sync` code the orchestration owner. Sync modules receive the Store itself rather than loose dirty/pending Set references. Firestore and Auth remain runtime dependencies and are not moved into the Store.

The extracted boundaries now own:

- debounced local persistence and canonical dirty-project consumption (`persistAdapter`);
- pending-write add/acknowledgement access (`storeSyncState`);
- owned project metadata merge, canonical project-list apply, and listener apply-before-task-hydrate sequencing (`cloudHydration`);
- project and task writes/listeners using Store-backed D4 state (`cloudSyncProject`, `taskCloud`, `docToProject`, `mergeCloudSnapshots`).

The legacy `persist`, full-project sync and metadata-merge functions are thin dependency/delegation boundaries. Project create and guest migration now call Store pending APIs directly rather than mutating captured Sets.

## Responsibilities deliberately remaining in legacy

- Firebase Auth callback and current-user/cloud-mode acquisition: moving these would redesign Auth, outside D5.
- Firestore collection factories and optional same-name/collectionGroup task recovery: these depend on classic Firebase globals and preserve existing recovery behavior.
- Task-repair verification and login guest-project migration: retained to avoid changing schema, owner semantics, or safeguards; all state guards now use AppDataStore APIs.
- UI refresh/toast callbacks after listener/hydrate work: retained because moving them is D6 Main Surface/navigation work.
- Project create/rename/delete direct adapters and project-status context bridge: retained to preserve lifecycle/schema behavior; they no longer own independent dirty/pending state.

## Invariants

No schema version, storage key, Firestore collection/subcollection, `sharedWith`, owner, Auth, offline persistence, Contract Back/Stay/History, or navigation behavior was changed. D6 remains untouched.

## Size

`src/legacy/legacyApp.js`: 3,435 lines before D5; 3,388 lines after D5.
