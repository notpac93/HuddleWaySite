# CRM Control Inventory

Status: UI-002 implementation evidence

Reviewed source: `src/components/crm/**/*.svelte`

Review date: 2026-07-26

## Scope and method

The shared worktree contained 45 Svelte CRM components and 305 native controls
when the UI-002 pass began. The current release tree contains 75 components and
609 native controls. Controls were not accepted by sampling:

1. every Svelte file was enumerated recursively;
2. every native `button`, `a`, `input`, `select`, and `textarea` was parsed from
   the Svelte AST;
3. every native control was required to have an event handler, binding, real
   link, or explicit disabled/read-only disposition;
4. every non-native click handler was listed and manually traced to state,
   navigation, modal close, sorting, or a real operation;
5. placeholder/no-op patterns were scanned across the full component tree;
6. shared privileged controls were re-reviewed after the SEC-002 owner moved
   them to the authenticated backend client;
7. every CRM modal backdrop/panel pair was checked for explicit stacking, and
   live-audit regressions were covered for interior clicks, backdrop close, and
   multi-step form navigation.

`tests/unit/crm-control-inventory.test.ts` pins the complete file list and
per-file control count. A newly added component or control fails the inventory
until it is deliberately reviewed. It also rejects bare native controls,
`href="#"`, coming-soon copy, placeholder alerts, fake action menus, and the
specific inert controls found by the baseline audit.

This is UI-002 evidence, not a substitute for TST-002. Success, denial,
double-submit, refresh, persistence, and tenant-scope behavior still require
the deterministic component/integration/E2E coverage owned by TST-002.

The focused interaction follow-up is pinned by
`tests/unit/crm-interaction-source.test.ts` and
`tests/component/crm-modal-navigation.test.ts`. It covers accessible Media
Manager upload/subscription errors, named My App module toggles, modal
backdrop/panel stacking, event and registration step advancement, backdrop
close, and player/team/event global-search navigation with result-ID
preservation.

## Reviewed component register

| Component | Native controls | Reviewed disposition |
| --- | ---: | --- |
| `ActivityManager.svelte` | 3 | Refresh and error-state retry execute the authenticated, scoped activity projection reload; loading, empty, and load-error copy are explicit. |
| `CommunicationsManager.svelte` | 40 | Announcement create/edit/recall, association filters, one-off and bulk email, registration outreach, allowance retry, sender-identity configuration/verification, and confirmation dialogs are wired. Email preview is authenticated, deduplicated, preference-aware, quota-aware, and blocks delivery until the administrator confirms the eligible recipient count and remaining monthly allowance. |
| `CrmApp.svelte` | 1 | The generic coming-soon branch was removed; every declared tab maps to a concrete lazily loaded component, with an actionable retry if a module fails to load. |
| `CrmShell.svelte` | 15 | Navigation, accessible tenant switch, global search, and logout controls are wired. Search navigation preserves the selected result ID. The unsafe global browser-import entry point was removed. |
| `DataTable.svelte` | 9 | Search, optional filtering, stable-ID selection, sorting, paging, row actions, and CSV export operate on the current view; empty export is explicitly disabled. |
| `DocumentsManager.svelte` | 7 | Add/cancel/save/view/delete controls execute the resource workflow and deletion confirmation. |
| `EventScheduler.svelte` | 19 | Tabs, expand/edit, publish, registrant view, duplicate-date, create, validation, and save controls have concrete state or persistence paths. Inline mutations bind replay identity to tenant, event, scope, and payload; reject missing IDs, missing schedules, and truncated series; lock the active editor in flight; mask backend details; and discard stale tenant responses. Decorative chevrons are no longer buttons. |
| `FinancialOperationsWorkspace.svelte` | 6 | Owner-scoped deposits, transactions, scheduled balances, overdue balances, and invoices load through the authenticated summary API with tenant-safe refresh, filtering, export, responsive tables, incomplete-projection warnings, and tenant-themed navigation. Payment Setup remains a separate view backed by the current installment components. Retired legacy billing components are prohibited by a source-boundary test. |
| `GlobalDashboard.svelte` | 2 | Quick actions open real create/invite workflows. Metric labels now describe the records actually counted. |
| `GlobalSearch.svelte` | 5 | The search field drives scoped results; player, team, and event rows are accessible buttons that route to the concrete CRM tab while preserving the result ID. |
| `InviteStaffModal.svelte` | 6 | Submit uses the authenticated, idempotent invite API; role/team inputs, cancellation, validation, and progress are wired. |
| `Login.svelte` | 13 | Sign-in, sign-up, email verification, reset, view changes, validation, loading, and error/success states are wired to Firebase Auth. |
| `MediaManager.svelte` | 2 | Category filters and search are wired to a bounded tenant projection; subscription failure uses accessible inline status instead of browser alerts. |
| `MyAppStudio.svelte` | 9 | Configuration tabs, named/stateful module toggles, colors, logo boundary, and publish operate on tenant branding/runtime configuration. |
| `SettingsManager.svelte` | 2 | Profile inputs and guarded save submit persist the authenticated profile. |
| `SetupWorkflow.svelte` | 11 | Five-step navigation and onboarding bootstrap are wired. Free setup explicitly skips payment activation; the command is auth/App-Check protected, stable-idempotent, strict about its response tenant/readiness envelope, single-submit, and correlated on failure. |
| `StaffManager.svelte` | 14 | Directory/invite tabs, search, role filter, retry, invite launch, and membership/invite lifecycle confirmations use backend data and operations; legacy edit stubs are gone. |
| `TeamsManager.svelte` | 3 | Create and open-team actions are real. The fake report and inert row-menu buttons were removed. |
| `events/CreateEventForm.svelte` | 19 | Multi-step event creation, media boundary, recurrence, dates/times, registration binding, validation, back/cancel, and submit controls are wired. The request now matches the backend exact-key contract, rejects duplicate slots and more than 200 occurrences, locks the modal in flight, binds retry identity to tenant and payload, rejects stale scope responses, and validates strict success evidence. The unbacked payment-plan configuration trigger was removed. |
| `events/DuplicateEventModal.svelte` | 10 | Date/time editing, reason, close/cancel, validation, and duplicate submission are wired. The modal inherits the original end time, rejects duplicate/invalid local slots and more than 200 occurrences, locks in flight, and uses tenant/event/payload-bound retry and stale-response guards. |
| `events/EditEventModal.svelte` | 13 | Event/media fields, lifecycle scope, reason, deliberate publication confirmation, close/cancel, validation, and save are wired. The modal locks in flight, binds retry identity to tenant/event/payload, discards stale scope responses, and validates strict update evidence. |
| `events/EventRegistrantsModal.svelte` | 2 | The modal is read-only plus reviewed DataTable search/export. It labels an incomplete/truncated projection instead of presenting a sampled count as exact. Unsafe registration rewrites and placeholder messaging were removed. |
| `events/RecurrenceSelector.svelte` | 13 | Rule generation, calendar navigation/selection, clear/apply, selected-date removal, and close/done controls are wired. |
| `registration/CreateRegistrationForm.svelte` | 18 | Step navigation, field toggles, cancel, validation, and create/edit submit are wired. Create/update preserves the exact supported lifecycle, locks the modal in flight, binds idempotency to tenant and payload, rejects stale tenant responses, and renders support-safe retry state. |
| `registration/FormsTable.svelte` | 2 | The row action opens concrete form details and is labeled accurately; exact lifecycle filtering is shared with the manager and its duplicate search/export toolbar plus the unproven signup-count metric were removed. |
| `registration/RegistrationDetail.svelte` | 10 | Edit, search, clear, stable-ID selection, selected/scoped CSV export, pagination, and explicit detail-load retry are wired. Empty/loading selection is disabled and malformed registration IDs render safely. Fake actions, filters, manage-columns UI, ellipses, and metrics were removed or corrected. |
| `registration/RegistrationManager.svelte` | 7 | Create/edit, exact-lifecycle active/retired/needs-review tabs, search, current-view CSV export, and failed-subscription retry are wired; the duplicate inner table toolbar and floating help stub were removed. Subscription generations prevent stale same-tenant retries from replacing current state. |
| `roster/ImportCsv.svelte` | 2 | Stable team selection and CSV input feed backend preview, followed by a separately locked idempotent commit control and explicit correlated result state; malformed team IDs are omitted. |
| `roster/PlayerTable.svelte` | 5 | Search/filter and stable-ID selection are wired; bulk team changes use a locked atomic backend preview/commit with support-safe stable retry instead of registration-row writes. Malformed registration/team IDs are omitted explicitly. |
| `roster/RosterManager.svelte` | 3 | Accessible player, team, and secure CSV-import tabs route to concrete reviewed components; one tenant/team subscription owns loading, error, correlation, truncation, refresh, and stale-scope invalidation. |
| `roster/TeamTable.svelte` | 3 | Create/open/edit actions are wired through the guarded team form; unstable rows are omitted and an absent member count renders unavailable rather than a fabricated zero. |
| `seasons/CreateSeasonModal.svelte` | 7 | Name/dates/form binding/reason/cancel/create controls are wired. Ambiguous float pricing and pseudo-installment configuration were removed. |
| `seasons/EditSeasonModal.svelte` | 10 | Media, identity, dates, status, description, reason, cancel, and guarded save are wired. Misleading “publish” language and ambiguous float pricing were removed. |
| `seasons/LinkEventModal.svelte` | 6 | Search, create-new, link, and close/done controls are wired. |
| `seasons/SeasonDetail.svelte` | 13 | Back/edit, tabs, participant search/export, add/link-event, and confirmed unlink controls are wired. Unlinking is audited, idempotent, in-flight locked, tenant guarded, and support-safe; incomplete/malformed projections are explicit. |
| `seasons/SeasonsManager.svelte` | 8 | Card/table view, search, create, open, and edit controls route to the authoritative modals/detail surface. The duplicate inline editor/event table was consolidated into those guarded paths; projections and revenue limitations are explicit. |
| `teams/CreateTeamForm.svelte` | 5 | Name/description/reason, cancel, and guarded create/edit submit are wired. |
| `ui/StatusButton.svelte` | 1 | Shared button forwards events while enforcing loading disablement and accurate idle/loading/success/error labels. |

## Removed unsafe or duplicate surfaces

- `ScheduleManager.svelte` was removed. It was a second event editor with
  malformed direct writes and hard deletes. Team navigation now uses the
  validated `EventScheduler`.
- `roster/AddPlayerForm.svelte` was removed. It wrote legacy registration rows
  to simulate roster membership; roster changes now use server preview/commit.
- `events/ImportEventsModal.svelte` was removed after its dead trigger path was
  eliminated. It performed an unaudited browser batch import; normal event
  creation remains available and a future import requires a canonical server
  operation.
- `registration/MonthlyPaymentConfig.svelte` was removed with its event-form
  trigger. Its local toggle/count state had no canonical installment contract;
  recurring subscriptions are not presented as installment invoices.

## Reproducible checks

Run from the site repository:

```sh
npm run test:type
npx vitest run --config vitest.config.ts tests/unit/crm-control-inventory.test.ts
npx vitest run --config vitest.config.ts tests/unit/crm-interaction-source.test.ts
npx vitest run --config vitest.component.config.ts tests/component/crm-modal-navigation.test.ts
npm run test:unit
PUBLIC_FIREBASE_APP_CHECK_SITE_KEY=test-enterprise-site-key npm run build
```

The App Check value above is intentionally test-only and must never be used by
the production release environment.
