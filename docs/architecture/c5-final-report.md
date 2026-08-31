# Architecture Cleanup C5 final report

## A–K: presentation architecture outcome

The complete pre-movement inventory and disposition table is in
[`c5-inventory.md`](./c5-inventory.md). Originally, `index.html` linked one 157,642-byte
`legacy.css` file containing tokens, base rules, Workspace Chrome, every feature, widgets,
responsive rules, and late cascade patches. C5 replaces that delivery with a deterministic
`src/styles/index.css` manifest and 26 owner modules (27 CSS files including the manifest).

The final architecture has canonical tokens/base/utilities, shared dialog/form/feedback/export
primitives, Workspace Chrome/workspace/drawer/navigation owners, Task/Contact/Contract/Project
Management/Accounting-Settings feature owners, and Numpad/Search Template widget owners.
Token values reproduce the prior palette and now include colors, surfaces, text, borders,
semantic states, and the existing workspace top offset in one `tokens.css` owner. Existing
form, dialog, overlay, feedback, export, and state-class primitives were extracted without a
framework or build migration.

Static application inline styles were replaced by semantic classes for avatars, sheet/page
spacers, captions, and the numpad. Static JavaScript presentation was replaced by classes for
Auth avatar visibility, Activity empty state, Contact layouts/conditional fields, Contract
edit/drag-handle state, Search Template FAB visibility, Profile hints/validation/upload input,
and non-draggable Task rows. The Contract edit rule is no longer injected through a dynamic
`<style>` element. Feature-specific responsive rules retain their existing breakpoints and
remain with their owner. No selector was claimed dead and deleted without proof; the obsolete
global `legacy.css` delivery and dynamic Contract style-injection selector were proven and
removed.

Intentional JavaScript styling remains only for undo-animation restart, numeric text direction,
task depth custom properties, textarea auto-grow measurements, and isolated generated-export
geometry/CSS. These are runtime-computed or generated-document concerns, and the architecture
test maintains an explicit file allowlist.

The one large owner remaining is `features/contracts.css` (approximately 78 KB). It contains
the sequential Contract form, clause/material editor, status, picker, retention, dates, and
responsive overrides accumulated by the current pixel-compatible UI. Further splitting this
override sequence would obscure rather than improve ownership; a future visual redesign can
replace this single cohesive feature owner without touching Contract lifecycle/history logic.

## L–M: files and tests

Changed production delivery and presentation files are `index.html`, the `src/styles/` tree,
and the small presentation-only JS call sites listed above. Architecture documentation was
added under `docs/architecture/`. `src/styles/cssArchitecture.test.js` adds portable Node-only
guards for the manifest, embedded/inline CSS, canonical token owner, forbidden application
logic in styles, feature selector ownership, static CSS injection, intentional JS mutation
allowlisting, and deleted legacy delivery.

## N–Q: verification

* Full Node unit/static suite: **164 passed, 0 failed**.
* Syntax checks for every changed JavaScript file: **passed**.
* `git diff --check`: **passed**.
* Playwright Mobile and Desktop requested specs: **blocked before browser startup** because the
  Chromium executable was absent. Installing it was attempted, but every official CDN request
  returned HTTP 403 (`Domain forbidden`). Consequently no page loaded and no page-error or
  screenshot result could be produced in this environment. No timeout/assertion/configuration
  was weakened.

## R–U: measured before/after

| Metric | Before | After |
|---|---:|---:|
| CSS files | 1 | 27 (26 owner modules + manifest) |
| Total CSS bytes | 157,642 | 161,188 |
| Inline style attributes in `index.html` | 9 | 0 |
| Production JS direct style-mutation lines | 29 | 13 |
| Dynamically injected application feature styles | 1 | 0 |

The small byte increase is ownership headers, the deterministic manifest, shared utility/state
rules, and the static presentation moved out of HTML/JS—not a visual redesign.

## V–Y: debt, blockers, revision

Remaining debt is the intentionally cohesive large Contract owner, existing high-specificity
and `!important` declarations required for visual compatibility, and generated export HTML/CSS
that remains isolated in its document generator. The only verification blocker is unavailable
Playwright Chromium plus CDN denial. Branch:
`cleanup/c5-css-presentation-architecture`. Commit SHA is recorded in the delivery response
after commit creation. C1–C4 data, repository, Router/history, Workspace, Auth, Sync, Recovery,
and ES-module ownership were not changed.
