# CRM accessibility and responsive audit

Audit date: 2026-07-26
Scope: all 40 release-tree CRM Svelte components and shared UI actions
Result: owner implementation evidence complete for UI-004/TST-004 local scope; independent assistive-technology and release acceptance remain open.

## Keyboard and focus contract

- All 16 rendered dialog/drawer surfaces use `role="dialog"`, `aria-modal="true"`, an accessible label, and the shared `modalFocus` action.
- `modalFocus` moves initial focus inside the panel, wraps forward and reverse Tab, invokes the real close path on Escape, and returns focus to the connected opener.
- Loading fieldsets and controls are disabled during mutations, so a second submit cannot be reached by mouse or keyboard.
- Global search opens with Command/Control+K, focuses its search field, closes with Escape, and restores focus to the search trigger.
- The mobile navigation drawer focuses its close button, traps focus, closes with Escape, and restores focus to the menu trigger.
- Horizontal table regions that remain tables on narrow viewports are named and keyboard-focusable. Shared `DataTable` renders mobile record cards.
- Native buttons, links, inputs, selects, and textareas are pinned by the exhaustive control inventory; every control has a handler, binding, destination, or explicit disabled/read-only disposition.

## Semantics

- Dialogs use a unique visible heading within their rendered scope through `aria-labelledby`.
- Icon-only controls have an accessible name; decorative SVGs/images are hidden from the accessibility tree or have an empty alt.
- Tables use column headers with `scope="col"`. Sort buttons announce their target and current direction; selection controls name the record or page scope.
- Loading and success updates use `role="status"`/polite live regions. Failures and validation use `role="alert"` or assertive live regions.
- Navigation and view selectors expose `aria-current`, `aria-expanded`, or `aria-pressed` as appropriate.
- Viewer mode removes write-capable modules and explains that the remaining Dashboard is read-only.

## Responsive behavior

| Surface | Narrow viewport behavior |
|---|---|
| CRM shell | Desktop rail is replaced by a modal drawer; the header retains the active section and search. |
| Shared tables | Desktop table becomes stacked record cards with the same cells, actions, selection, and page scope. |
| Financial, staff, registration-detail, season-detail, and season tables | Named, keyboard-focusable horizontal regions preserve every column without clipping. |
| Modals and drawers | Panels use full-width/mobile spacing, bounded viewport height, and internal scrolling; backdrops remain separate controls. |
| Forms and toolbars | Grid/flex layouts collapse to one column or wrap; in-flight disabled fieldsets preserve state. |
| Dashboard | KPI cards and quick actions collapse through one/two/four-column breakpoints. |

## Local browser evidence

`tests/e2e/authenticated-crm.spec.ts` creates a verified owner and tenant records in the Auth/Firestore emulators, signs in through the actual `/admin` form, and runs in both desktop Chrome and a Pixel 5 viewport. It proves:

- free-administration copy is visible before sign-in;
- the owner reaches the authenticated Dashboard;
- tenant-projected search returns the seeded stable-ID team;
- keyboard shortcut, initial focus, Escape, and focus return;
- mobile drawer content, initial focus, Escape, and focus return;
- owner-only Financials navigation is reachable;
- no document-level horizontal overflow.

`tests/e2e/setup-wizard.spec.ts` separately exercises the free setup steps and optional payment step at both viewports. `tests/e2e/crm-performance.spec.ts` checks local overflow and rendering metrics while blocking external traffic.

## Limits

This is deterministic owner evidence, not an independent screen-reader certification or production field measurement. VoiceOver/NVDA/TalkBack acceptance and staging device evidence belong to REL-007 and the external part of TST-004/BLK-008. The implementation does not claim WCAG conformance solely from automated checks.
