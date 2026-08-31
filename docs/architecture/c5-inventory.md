# C5 CSS / presentation inventory

## Baseline and method

This inventory was completed before CSS movement. The production application loaded one
stylesheet, `src/styles/legacy.css` (3,323 lines / 157,642 bytes), from `index.html`.
The audit searched all HTML, CSS, and production JavaScript for `<style>`, `style=""`,
`element.style`, `cssText`, `setAttribute('style', ...)`, dynamic `style` elements,
state classes, media queries, broad selectors, and `!important`. Export-document CSS in
`exportView.js` is a deliberately self-contained generated document and is not application
shell CSS. The diagnostic HTML is likewise outside the production application.

Baseline production counts: one CSS file; nine inline `style` attributes in `index.html`;
29 direct JavaScript style mutation sites (including runtime geometry and generated exports).

## Major block disposition

| Classification | Current selector/block and location | Active DOM callers | Owner | Target | Action | Reason |
|---|---|---|---|---|---|---|
| A | `:root`, dark-theme and PDF custom properties, `legacy.css:1-81` | Entire shell and exports | design system | `src/styles/tokens.css` | MOVE | One canonical token owner; values remain byte-for-byte equivalent. |
| B | `*`, `html`, `body`, `legacy.css:82-88` | Application document | application shell | `src/styles/base.css` | MOVE | Reset and document defaults are genuinely global. |
| D | `.topbar`, project context, tab bar, bottom navigation, `legacy.css:89-272` | `index.html`, workspace chrome controller | Workspace Chrome | `src/styles/workspace/chrome.css` | MOVE | Chrome is independent from feature content. |
| E/M | `.task-block`, `.row`, drag/completed/starred/add states, `legacy.css:273-372` | task view | Tasks | `src/styles/features/tasks.css` | MOVE | Task presentation and transient drag state. |
| K | `.overlay`, `.sheet`, shared detail fields, `legacy.css:373-409` | task detail and common sheets | dialog primitive | `src/styles/components/dialogs.css` | MOVE | Reusable sheet/dialog boundary. |
| K | `.numpad-*`, `legacy.css:410-448` | numpad widget | Numpad | `src/styles/widgets/numpad.css` | MOVE | Independently owned widget. |
| E | task detail/subtask/action rules, `legacy.css:449-486` | task view | Tasks | `src/styles/features/task-details.css` | MOVE | Task-specific continuation kept in original cascade position. |
| D | drawer/account/project/trash rows, `legacy.css:487-539` | global drawer and trash list | Workspace Chrome | `src/styles/workspace/drawer.css` | MOVE | Drawer is shell chrome; shared trash row stays here for visual compatibility. |
| K/M | mini dialogs, toast, undo animation, `legacy.css:540-591` | exit/confirm/undo surfaces | feedback primitives | `src/styles/components/feedback.css` | MOVE | Shared feedback UI and presentation-only visibility states. |
| D/J | page overlays, management/profile/workspace lists, activities, `legacy.css:592-691` | workspace pages | Workspace | `src/styles/workspace/workspace.css` | MOVE | Workspace page frame and existing management presentation remain grouped. |
| F/G | contact/activity picker and list/form selectors, `legacy.css:692-842` | Contact and Activity modules | Contacts / Activities | `src/styles/features/contacts.css` | MOVE | Removes these implementations from the global stylesheet. |
| J | statement, profile/settings/reports/accounting and trash blocks, `legacy.css:843-1012` | workspace feature pages | Accounting / Settings | `src/styles/features/accounting-settings.css` | MOVE | Existing closely coupled internal-page presentation. |
| C/K | internal form fields, buttons, save bars, visibility contract, `legacy.css:1013-1164` | multiple data-entry forms | shared forms | `src/styles/components/forms.css` | MOVE | Consolidated primitive; global scope retained only where reusable. |
| H/L | contract party responsive bridge, `legacy.css:1165-1166` | Contract form | Contracts | `src/styles/features/contracts.css` | MOVE | Feature responsive rule belongs with Contract. |
| E/J/D | project active tab, statement header, page/footer and inner-section bar, `legacy.css:1167-1254` | project/workspace internal pages | Project Management / Workspace | `src/styles/features/project-management.css` | MOVE | Removes late global patches while retaining their original cascade slot. |
| A | export token aliases, `legacy.css:1255-1265` | generated export roots | Export presentation | `src/styles/components/export.css` | MOVE | Explicit document-theme adapter, not application logic. |
| F/K | contact exit dialog/save bar, `legacy.css:1266-1277` | Contact form lifecycle UI | Contacts | `src/styles/features/contact-exit.css` | MOVE | Contact owns its exit presentation; lifecycle behavior remains in JS. |
| H/L/M | all `.contract-*`, `.real-contract-*`, `.ctf-*` blocks and responsive overrides, `legacy.css:1278-2980` | Contract form/status/template modules | Contracts | `src/styles/features/contracts.css` | MERGE | Large but cohesive feature implementation; splitting further would fragment its intentional override sequence. The embedded `.contact-custom-select*` block is extracted to `features/contact-custom-select.css`. |
| I/M | `.search-template-*`, `.stpl-*`, `legacy.css:2981-3117` | Search Template module | Search Template | `src/styles/widgets/search-template.css` | MOVE | Widget-owned overlay/search/selected states. |
| H | Contract specialization of `.stpl-field-trigger`, `legacy.css:3118-3137` | Contract form | Contracts | `src/styles/features/contract-search-trigger.css` | MOVE | Cross-feature selector is delivered by the Contract owner while retaining its cascade slot. |
| D | global inner/workspace back placement, `legacy.css:3138-3157` | Workspace Chrome | Workspace Chrome | `src/styles/workspace/back-navigation.css` | MOVE | Removes a chrome rule from the Search Template block. |
| C/K | `.form-template`, `.ft-*`, `legacy.css:3158-3255` | Contract and Contact forms | shared forms | `src/styles/components/form-template.css` | MOVE | Reusable form presentation contract; intentionally follows legacy contract overrides. |
| F | contact form-template specialization, `legacy.css:3256-3306` | Contact form | Contacts | `src/styles/features/contact-form-template.css` | MOVE | Feature specialization is no longer housed globally. |
| D | hamburger/drawer project switching, `legacy.css:3307-3323` | Workspace Chrome | Workspace Chrome | `src/styles/workspace/navigation.css` | MOVE | Late C4 chrome override retains deterministic final cascade position. |
| L | media queries at 560/640/620/520/600/430/380 px | respective contract/form blocks | declaring feature | same owner files | MOVE | Breakpoints are preserved exactly and colocated with their owners. |
| M | `.hidden`, `.active`, `.open`, `.checked`, `.starred`, drag states | view modules via `classList` | presenting component | declaring owner files | KEEP | Classes expose visual state only; Router/history/domain ownership is unchanged. |
| O | task textarea heights and `--item-depth`; export offscreen geometry | task/export modules | runtime geometry | JavaScript allowlist | KEEP | Values depend on content measurements or generated-document geometry. |
| P | late Contract/Search/Contact/Chrome patches inside global file | unrelated global stylesheet | respective features | owner files above | MOVE | Principal cross-feature ownership leakage removed. |
| N | none proven dead in this audit | n/a | n/a | n/a | KEEP | No selector is deleted without stronger caller/runtime evidence; cleanup prioritizes safe ownership movement. |

## Inline and JavaScript presentation audit

Static inline shell declarations on avatars, spacers, metadata labels, and numpad direction
are candidates for semantic classes. Static JavaScript declarations in Contact, Activity,
Profile, Auth avatar visibility, Contract grip visibility, Search Template FAB visibility,
and workspace confirmation presentation are candidates for CSS-visible state classes.

Intentional mutations to retain are: task depth custom properties; textarea auto-grow
heights; numpad text direction based on entered value; undo animation restart; generated
export markup/styles and off-screen render geometry. These are runtime values or isolated
print-document presentation rather than static feature CSS injection.

`contractFormExitBridge.js` dynamically injects a static feature `<style>` block and is the
only production application instance found; it must be replaced by the Contract owner CSS.

## Original architecture risks

* One 157 KB global file combined tokens, reset, shell, widgets, all features, transient
  states, and years of late cascade patches.
* Ownership was communicated by comments rather than delivery boundaries.
* Contract rules occupied more than half the file and were interleaved with shared and
  cross-feature overrides.
* Static inline and JS presentation bypassed feature styles.
* Repeated `!important` patches are still necessary for current cascade/visual compatibility;
  C5 moves them to owners but does not redesign or opportunistically alter specificity.

## Planned deterministic delivery

`src/styles/index.css` will be the sole application link and will import owner files in the
same sequence as the original blocks. This preserves cascade behavior without a bundler.
Tokens remain defined only in `tokens.css`; no styling file may contain application state,
Auth, Sync, Data Store, Repository, or Router logic.
