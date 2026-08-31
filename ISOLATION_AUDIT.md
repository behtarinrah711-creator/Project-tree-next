# Isolation audit — Project-tree Next

Status: ready for a separate repository/deployment. Cloud remains intentionally disabled until a new Firebase project is supplied.

## Verified safeguards

- App data key: `ptnext-v1:app-data`.
- All new local app keys use prefix `ptnext-v1:`.
- Production legacy keys are not auto-read by `ProjectRepository`.
- Logout clears only the `ptnext-v1:` namespace; it does not clear unrelated local/session storage.
- Firebase production project identifiers are absent from runtime code.
- Firebase is disabled by default and a local no-op runtime is installed instead.
- Service Worker cache prefix: `project-tree-next-`.
- Service Worker activation deletes only caches with that prefix.
- Service Worker update guard only updates the registration for the current app scope.
- Old cloud recovery diagnostic is disabled.
- E2E seed storage keys were changed to `ptnext-v1:app-data`.
- New GitHub Pages workflow is included at `.github/workflows/pages.yml`.

## Tests run here

`node --test $(find src -name '*.test.js' -print)`

Result: **236 pass / 0 fail**.

Playwright could not be re-run in this execution environment because installing the Playwright npm dependency timed out. The included Pages workflow runs Unit + Playwright before deployment, so deployment will not proceed if those tests fail.

## External account step still required

Create a new Firebase project before enabling cloud. Then put only its web config in `src/config/deploymentConfig.js` and change `cloudEnabled` to `true`.
