# Project-tree Next — isolated deployment

This build is intentionally isolated from the existing production site.

## Safety defaults

- Local app data uses the `ptnext-v1:` namespace.
- Production legacy storage keys are not read automatically.
- Cloud/Firebase is disabled by default in `src/config/deploymentConfig.js`.
- The old Firebase project is not referenced by runtime source.
- Service Worker cache cleanup only touches `project-tree-next-*` caches.
- The old cloud-recovery diagnostic is disabled.

## Enabling the new cloud later

Create a NEW Firebase project, then edit only `src/config/deploymentConfig.js`:

1. Set `cloudEnabled` to `true`.
2. Replace `firebase: null` with the NEW Firebase web-app config object.
3. Enable Google sign-in and Firestore in that NEW Firebase project.
4. Add the NEW deployment host to Firebase Authentication authorized domains.
5. Run Unit + Playwright before deployment.

Never paste the old `tree-d92af` config into this build.

## Separate GitHub Pages deployment

Create a new repository (recommended name: `Project-tree-next`), upload this full project, and push to `main`. The included `.github/workflows/pages.yml` tests and deploys the site independently.

The existing `Project-tree` repository/site does not need to be changed.
