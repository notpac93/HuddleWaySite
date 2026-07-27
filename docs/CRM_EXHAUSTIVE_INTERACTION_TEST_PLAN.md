# CRM Exhaustive Interaction Test Plan

Status: owner implementation qualification complete; independent/external release acceptance remains open

Review date: 2026-07-26
Site workspace: `/Users/kennygrimblejr./HuddleWaySite/HuddleWaySite`
Authoritative backend workspace: `/Users/kennygrimblejr./HuddleWay`

## Acceptance rule

Production acceptance requires a disposition for every row below. A native
control being syntactically bound is not enough. Each interaction must prove:

1. its idle, disabled, loading, success, empty, error, permission, and
   incomplete-projection states where applicable;
2. keyboard operation, modal focus containment/restoration, and mobile layout;
3. stable record identity through filtering, sorting, paging, and selection;
4. active-tenant capture and stale-response rejection;
5. authoritative backend validation and capability enforcement for mutations;
6. one logical mutation across double-click, authorization refresh, timeout,
   retry, and page refresh;
7. persisted readback, audit/correlation evidence, and cross-tenant denial;
8. truthful wording for intentionally unsupported behavior.

The source tree remains in motion. The final freeze must regenerate the exact
component/control counts and update the pinned inventory before these cases are
accepted.

## Evidence levels

| Level | Required evidence |
| --- | --- |
| `S` | Svelte parse/type check, exact control inventory, reachability, and placeholder/direct-write scan. |
| `C` | Deterministic component interaction test with mocked read/write boundaries and explicit adverse states. |
| `I` | Emulator or loopback-backend contract test proving authorization, idempotency, persistence, audit, and denial. |
| `E` | Playwright browser test for the real route, keyboard/focus behavior, responsive layout, and refresh persistence. |
| `P` | Production-provider evidence that cannot be safely reproduced locally, such as Stripe webhook/account behavior and release headers. |

## Every CRM component

All 40 current `src/components/crm/**/*.svelte` files and their 368 native
controls are assigned below.
The “Current automated evidence” column preserves the incremental checkpoint
history. The final disposition register immediately after the table supersedes
older “remains” wording in that column.

| Component | Controls and handler/read-write contract | Required adverse and persistence cases | Current automated evidence |
| --- | --- | --- | --- |
| `ActivityManager.svelte` | Refresh/retry -> paged authenticated audit projection. | no tenant, 403, network error, stale tenant response, malformed timestamp, 50+ truncation/cursor, retry. | Direct `C` proves cursor paging/deduplication, support-safe initial-load failure/retry, and stale-tenant response rejection. Malformed timestamp and browser `E` remain. |
| `CommunicationsManager.svelte` | Composer, cancel, search, retry, recall confirmation -> message list/send/recall APIs. | Publish boundary must be truthful; owner/editor denial, empty audience, double submit, partial delivery, recall retry/readback, tenant switch. | Direct `C` proves reason gating, exact tenant/message/reason/key, one in-flight submit, close denial, success refresh, safe correlated failure, unchanged retry payload/key, and truthful disabled publication. Backend/rules/Flutter `I/C` prove owner/editor/viewer, recipient, outsider, cross-tenant, failure, and replay boundaries; browser `E` remains. |
| `CrmApp.svelte` | Auth/role gate, lazy tab loading, module retry, team/result routing, tenant switch. | viewer/editor/owner/platform-admin matrices, rejected membership, lazy-import failure, rapid tab/tenant switch, child teardown before tenant publication. | `C` viewer case only. |
| `CrmShell.svelte` | Desktop/mobile navigation, organization switch, team exit, global search, sign-out dialog. | keyboard-only desktop tenant/sign-out access, Escape/focus restoration, sign-out error/retry, mobile open/close, rapid tenant switch. | Partial `C` search/mobile. |
| `DataTable.svelte` | Search, optional filter, sort, stable selection, row target, paging, export, bulk action. | duplicate/missing IDs, hidden selection, filtered empty state, CSV safety, page boundary, loading/403/error/truncation. | Direct `C` plus CSV unit tests. |
| `DocumentsManager.svelte` | List, access URL, add-disabled boundary, delete confirmation -> document APIs. | viewer/owner capability, secure URL rejection, popup blocked, in-flight close, deletion failure/readback, 100+ truncation, stale tenant response. | Direct `C` for deletion and popup fallback; no `I/E`. |
| `EventScheduler.svelte` | Tab/row expand, create/edit/duplicate, registrants, lifecycle selector, series update. | draft-to-published capability, unsupported consumer sync, invalid dates/times, native-alert removal, partial series update, tenant switch, refresh readback. | Direct `C` proves deliberate publication confirmation, identifier-less-record omission, missing-schedule refusal, truncated-series refusal, editor locking, support-safe failures, payload-stable retry, and stale-tenant update rejection. Authoritative mutation/readback/audit `I` and browser refresh/keyboard/mobile `E` remain. |
| `FinancialPeriodManager.svelte` | Refresh, preview, close confirmation, reopen confirmation -> period APIs. | half-open boundary, overlap, stale preview, exact-limit/truncated preview, stable retry key, concurrent close, last-write/readback/audit. | Direct `C`; backend `I` still required. |
| `Financials.svelte` | Owner gate, paged financial reads, views, filters, date range, sort, columns, saved views, selection, invoice export/details/create, period manager. | every projection state; 5,000+ direct invoices; malformed currency/minor units; corrupt URL/local storage; filtered selection; export failure/readback; team-scope exclusions; stale tenant response. | Direct `C` proves viewer non-fetch/late owner authorization, paged reads, refresh retention, safe correlated failure/retry, stale-tenant rejection, team-scope drawer invalidation, stable-ID paging/selection, column control, debounced search, status/URL/sort behavior, tenant-local save/apply/delete plus storage-write failure, exact selected export IDs, unchanged retry-key reuse, changed-scope key rotation, and one download. Strict API unit evidence rejects wrong-tenant/malformed overview, invoice, ledger, and export envelopes. Backend contract/`I` now proves normalized tenant/actor/key idempotency, lost-response replay, changed-payload conflict, role/cross-tenant denial, persisted readback, one job, one payload, and one deterministic audit. The 5,000-record route ceiling, broader malformed projection matrix, and browser `E` remain. |
| `GlobalDashboard.svelte` | Operational and financial projections; owner/editor quick actions; viewer read-only surface. | per-projection load/error/truncation, invalid amounts/currency, role matrix, quick-action modal success/cancel. | Direct `C` proves 500-record truncation labels for all three operational projections, partial-revenue refusal, projection-error KPI masking, and owner/viewer quick-action boundaries. Unit evidence proves each listener requests at most 501 and exposes at most 500. Quick-action lazy-load failure and browser `E` remain. |
| `GlobalSearch.svelte` | Search loaded players/teams/events and route with preserved result ID. | load/error/truncation, malformed labels, no results, keyboard result activation, target consumption. | Direct partial `C`. |
| `InviteStaffModal.svelte` | Name/email/role/cancel/submit -> create invite API with payload-stable key. | invalid/duplicate invite, timeout retry same key, tenant switch, App Check/auth refresh, in-flight close denial, readback. | Direct `C` proves required-field gating, exact trimmed payload/role, single submit, in-flight close denial, safe correlated failure, unchanged-payload retry key, corrected-payload key rotation, and explicit retry label. Backend `I` exists for invite authorization/delivery/replay; browser readback remains. |
| `Login.svelte` | Sign-in, sign-up, email-verification, forgot-password view, reset submit, and view navigation. | duplicate submit, verified/unverified/no-tenant routing, non-enumerating errors, network/rate limit, success navigation, keyboard and password-manager behavior. | Direct `C`; no full signup/setup `E`. |
| `MediaManager.svelte` | Category filters and search -> tenant `program_images` subscription. | stale tenant callback, 500+ bounded/incomplete state, permission/network error, malformed name/category/URL, image failure, approved/available invariant or corrected copy. | Direct `C` proves category/search filtering, unsafe-URL rejection, 101-record incomplete scope, stale-tenant callback rejection, safe subscription failure, and tenant removal. Browser image-failure and availability semantics remain. |
| `MyAppStudio.svelte` | Configuration tabs, module toggles, brand inputs, publish -> app configuration APIs; live roster/event previews. | tenant-switch stale preview, arbitrary/draft/deleted event prevention, malformed colors/config, upload boundary, publish timeout same key, server readback. | Direct tenant-switch `C`; no publish `I/E`. |
| `SettingsManager.svelte` | Display name and guarded submit -> Firebase Auth profile update. | unauthenticated state, invalid length, recent-login/network failure, duplicate submit, user switch, readback. | Direct `C` proves normalized single submit, read-only email, loading lock, invalid-name denial, safe recent-login failure, and user rebind. Unauthenticated/network and browser readback remain. |
| `SetupWorkflow.svelte` | Five-step program/brand/team/payment-boundary flow -> bootstrap API. | Back/edit from steps 4/5, slug collision, invalid color/name, stable timeout retry, readiness blockers, auth/App Check failure, refresh after creation. | Direct `C` proves free/no-activation copy and payload, exact single-submit, stable retry key, corrected-input key rotation, auth loss, safe correlated conflict, mismatched-tenant denial, and readiness rendering; backend `I` proves verified-email denial/success/replay/conflict. Refresh completion `E` remains. |
| `StaffManager.svelte` | Tabs/search/role filter/retry/invite; membership role/status and invite-revoke confirmation -> owner APIs. | 403, last-owner protection, self-demotion, stale directory, 100+ truncation, timeout retry same key, tenant switch, readback/audit. | Direct partial `C` proves unchanged membership retry-key reuse and exact invite-revocation payload. Permission, owner invariants, safe errors, stale tenant, truncation, readback, and `I/E` remain. |
| `TeamsManager.svelte` | Create and open team -> bounded team projection and team modal. | loading/error/truncation, search target consumption, create persistence, tenant switch. | Direct `C` proves loading, safe error, truncation, empty state, create modal, stable-ID row opening, and one-time search-target consumption. Create readback, tenant switch, and `I/E` remain. |
| `TransactionDetails.svelte` | Direct-invoice draft/lines; ledger refresh; issue/remind/offline payment/refund/void; core refund; hosted links -> financial APIs. | every capability denial, malformed money, excessive/refunded balance, stale ledger, payload edit after failed attempt, timeout retry same key, duplicate submit, safe URL, period lock, refresh/audit. | Eleven direct `C` cases now prove real prefixed-row ledger loading/truncation, issue/remind/void, offline payment, direct/core refund, dispute independence, exact draft minor-unit math, generic correlated failures, duplicate-submit suppression, in-flight field locking, stale-tenant mutation rejection, unchanged retry-key reuse, changed-payload rotation, and unsafe hosted/PDF URL rejection. Remaining: exhaustive validation/capability-denial permutations, stale/error ledger retry, period-lock response, emulator persistence/readback/audit, refresh, and browser `E`. |
| `events/CreateEventForm.svelte` | Step navigation, dates/times/media/form/recurrence/cancel/submit -> event-series API. | draft/publish boundary, invalid ranges and DST, tenant switch, in-flight close, partial series, timeout retry, readback. | Direct `C` proves the backend exact-key request without rejected `publishAt`, duplicate-slot and 200-occurrence validation, one locked in-flight submit, payload/scope-bound retry identity, and stale-tenant rejection. Recurrence has separate DST `C`; denial, authoritative readback/audit `I`, and browser `E` remain. |
| `events/DuplicateEventModal.svelte` | Date selection, time editor, audit reason, duplicate/cancel -> duplicate API. | empty/duplicate dates, invalid ranges, series media wording, stable retry, in-flight close, readback. | Direct `C` proves original-end-time inheritance, exact duplicate request, one locked submit, and duplicate-slot validation. Denial, failure/retry/stale-tenant permutations, authoritative readback/audit `I`, and browser `E` remain. |
| `events/EditEventModal.svelte` | Identity/media/date/status/series-scope/reason/save/cancel -> event update API. | draft-to-published capability, series image contract, invalid dates, stable retry, in-flight close, readback. | Direct `C` proves deliberate publication confirmation, support-safe failure, and unchanged retry identity; shared event cases cover locking and scope invalidation. Denial, authoritative readback/audit `I`, and browser `E` remain. |
| `events/EventRegistrantsModal.svelte` | Close plus shared DataTable search/export. | projection load/error/truncation, malformed records, export scope and close/focus. | Direct `C` proves incomplete/truncated wording; shared table `C` covers search/export. Authoritative projection and browser close/focus `E` remain. |
| `events/RecurrenceSelector.svelte` | Rule inputs, weekdays, apply/clear, calendar navigation/day selection, remove/done. | DST, inclusive boundary, invalid/past end, empty weekdays, duplicate dates, keyboard calendar behavior. | Direct DST `C`; keyboard `E` absent. |
| `registration/CreateRegistrationForm.svelte` | Step navigation, metadata, field toggles, cancel/submit -> registration-form APIs. | create/edit distinction, no-field/duplicate field, tenant switch, in-flight close, stable retry, readback. | Direct `C` proves normalized create/update payloads, exact archived preservation, unsupported-status denial, one in-flight submit, locked controls, safe correlated failure, unchanged retry key, edited-payload key rotation, and stale-tenant rejection. Backend readback and browser `E` remain. |
| `registration/FormsTable.svelte` | Open form detail through shared table. | stable target after sort/filter/page; unavailable metadata. | Shared table `C`. |
| `registration/RegistrationDetail.svelte` | Edit/retry, search/clear, select page/row, filtered/selected CSV, paging. | hidden selection, finance/event incomplete state, malformed registration, CSV safety, form update readback. | Direct `C` proves stable-ID paging/selection/export, hidden-selection clearing, incomplete-scope labels, derived-payment refusal, malformed/missing-ID handling, and loading/error/empty states. Edit readback and browser download remain. |
| `registration/RegistrationManager.svelte` | Create/edit, active/retired/needs-review tabs, search, current-view CSV, list/detail retry. | projection load/error/truncation, empty vs no-results, form status, create/edit readback. | Direct `C` proves exact lifecycle grouping/export, one scoped toolbar, truncation, safe list/detail permission errors, explicit retry, stale same-tenant listener rejection, live selected-form update/removal, and cross-tenant stale-detail rejection. Create/edit readback and `I/E` remain. |
| `roster/ImportCsv.svelte` | Team/file selection, preview, commit -> roster preview/commit APIs. | same-file reselection, drag/drop claim, new file after success, team change after preview, malformed/large CSV, partial commit, stable retry, tenant switch/readback. | Direct `C` proves normalized exact preview/commit payloads, single submit, reviewed-field locking, local row validation/reset, safe correlated commit failure, stable reviewed-key retry, and stale-tenant preview rejection. Strict API-envelope unit evidence covers tenant/hash/commit validation; large-file, team-change after preview, partial-result, backend readback, and `E` remain. |
| `roster/PlayerTable.svelte` | Search/team filter, stable selection, bulk add/remove/move -> roster preview/commit APIs. | atomic cross-team move or explicit partial result, hidden selection, stale preview, duplicate submit, 403, readback. | Direct `C` proves exact atomic cross-team preview/commit, duplicate-submit suppression, tenant-change stale-preview rejection, field locking, malformed registration omission, support-safe correlated failure, and unchanged-key retry. Capability denial, authoritative readback/audit `I`, hidden-selection permutations, and browser `E` remain. |
| `roster/RosterManager.svelte` | Player/team/import tabs -> roster projection service. | load/error/permission/truncation, refresh timing, background-tab pause, team switch. | Direct `C` proves one current tenant/team subscription, prior-scope callback rejection, cleanup, safe correlated error, truncation, parent-team filtering, and all three accessible tabs. Permission distinction, fake-timer visibility refresh, team-switch permutations, and browser `E` remain. |
| `roster/TeamTable.svelte` | Create/open/edit team through shared table/modal. | missing member count, projection states, update retry/readback. | Direct `C` proves stable-ID/malformed-row handling and create/open/edit/cancel routing; shared DataTable covers projection states and shared team-form cases cover update retry/locking. Authoritative readback/audit `I` and browser `E` remain. |
| `seasons/CreateSeasonModal.svelte` | Name/dates/form/reason/cancel/create -> season API plus form projection. | invalid date range, form load/error/truncation, tenant switch, in-flight close, stable retry, readback. | Modal source/focus only. |
| `seasons/EditSeasonModal.svelte` | Identity/media/dates/status/description/reason/cancel/save -> season API. | stale selected season, invalid range, stable retry, in-flight close, tenant switch/readback. | Modal source/focus only. |
| `seasons/LinkEventModal.svelte` | Search, link, create-new, close -> event projection/update API. | projection states/truncation, malformed title, already-linked event, stable retry, tenant switch/readback. | Modal source/focus only. |
| `seasons/SeasonDetail.svelte` | Back/edit/tabs/search/export/add-link/unlink; scoped participant/event/financial reads. | Authoritative component cases cover incomplete export, malformed registration/event IDs, tab routing, and typed-confirmation unlink; broader emulator readback and browser matrices remain. | Direct `C`; `I/E` open. |
| `seasons/SeasonsManager.svelte` | Card/table views, search, create/open/edit, projection notices, tenant-scoped detail. | Authoritative component cases cover loading/truncation/malformed scope, card/table editor routing, and tenant-switch detail invalidation. | Direct `C`; `I/E` open. |
| `teams/CreateTeamForm.svelte` | Name/description/reason/cancel/submit -> create/update team API. | stable timeout retry, in-flight cancel, tenant switch, duplicate name, validation/readback/audit. | Direct `C` proves normalized create/update, one in-flight submit, full close/edit lock, safe correlated failure, unchanged retry key, edited-payload key rotation, no-tenant denial, and in-flight tenant-switch invalidation. Duplicate-name/readback/audit `I/E` remain. |
| `ui/StatusButton.svelte` | Shared native button forwarding and state labels. | duplicate loading click, disabled forwarding, every label/state. | Direct `C`. |

## Final component disposition register

Acceptance here closes owner implementation testing under TST-002. It does not
replace REL-007 independent review, SEC-005 provider attestation, OPS-002 field
evidence, or clean-revision provenance. `E-smoke` means the real authenticated
route mounted the module at desktop and mobile widths; adverse interaction
branches remain proven at `C/I`, where they can be made deterministic without
production data.

| Component | Final disposition | Final evidence |
| --- | --- | --- |
| `ActivityManager.svelte` | Accepted `S/C/I/E-smoke` | Four direct cases cover cursor paging, dedupe, initial/load-more failure, 403 masking, request ID, stale tenant, malformed timestamp, and retry; audit route denial/readback is in the authoritative tranche. |
| `CommunicationsManager.svelte` | Accepted `S/C/I/E-smoke` | Three direct cases plus authoritative message send/recall tests cover reason, audience, capability denial, single submit, payload-stable retry, safe correlation, refresh, recall, and tenant scope. |
| `CrmApp.svelte` | Accepted `S/C/E` | Five access/shell cases cover verified/unverified/no-tenant, viewer/editor/owner, lazy failure/retry, rapid tab state, and teardown-before-tenant switch; authenticated E2E mounts all tabs. |
| `CrmShell.svelte` | Accepted `S/C/E` | Five shell cases plus authenticated E2E cover desktop/mobile navigation, search, result ID, organization switch, sign-out error, Escape, focus restoration, and all lazy modules. |
| `DataTable.svelte` | Accepted `S/C/E-smoke` | Three direct cases and table-audit tests cover ID rejection, search/sort/page selection, row target, truncation/states, responsive cards, and formula-safe filtered/selected CSV. |
| `DocumentsManager.svelte` | Accepted `S/C/I/E-smoke` | Two direct cases cover delete confirmation/failure/readback and popup fallback; document route/rules tests cover role, stable retry, audit, URL/path, and cross-tenant denial. |
| `EventScheduler.svelte` | Accepted `S/C/I/E-smoke` | Eleven event-family plus publication cases cover malformed IDs/schedule, publication confirmation, edit/duplicate/series scope, in-flight lock, stale tenant, safe retry; authoritative event routes cover denial/readback/audit/replay. |
| `FinancialPeriodManager.svelte` | Accepted `S/C/I/E-smoke` | Three direct cases plus 29 period/backend cases cover validation, complete/truncated preview, close/reopen, overlap/half-open boundaries, locks, retry, denial, audit, and readback. |
| `Financials.svelte` | Accepted `S/C/I/E-smoke` | Seven direct cases, strict API tests, five finance unit cases, table audit, and authoritative finance routes cover every retained view/filter/page/selection/export/state/tenant boundary. |
| `GlobalDashboard.svelte` | Accepted `S/C/E` | Three direct cases plus query-bound tests cover all projection loading/error/truncation combinations, currency-safe revenue refusal, role boundaries, and quick actions; real route is the authenticated E2E landing view. |
| `GlobalSearch.svelte` | Accepted `S/C/E` | Three direct cases plus E2E cover loading, all-or-nothing failure, truncation, malformed-ID omission, no results, keyboard shortcut, stable-ID navigation, Escape, and focus return. |
| `InviteStaffModal.svelte` | Accepted `S/C/I/E-smoke` | Three direct cases and invite backend tests cover validation, exact trimmed payload, single submit, close lock, stable retry/key rotation, auth/role/tenant denial, delivery/readback/audit. |
| `Login.svelte` | Accepted `S/C/E` | Four direct cases plus setup/authenticated E2E cover sign-in, sign-up, reset, safe non-enumerating failures, single submit, verification/no-tenant routing, and free-account wording. |
| `MediaManager.svelte` | Accepted `S/C/E-smoke` | Three direct cases cover filtering, safe URL/image boundary, 101+ incomplete state, permission/network failure, stale tenant, and cleanup; no unsupported upload control remains. |
| `MyAppStudio.svelte` | Accepted `S/C/I/E-smoke` | Four direct cases plus strict app-config API/backend tests cover valid load/publish/readback, logo URL, module state, payload-stable retry, mismatch, stale preview, and tenant reset. |
| `SettingsManager.svelte` | Accepted `S/C/E-smoke` | Three direct cases cover normalized name, read-only email, validation, single submit, recent-login-safe failure, user rebind, and Auth profile readback. |
| `SetupWorkflow.svelte` | Accepted `S/C/I/E` | Five direct cases, free-onboarding unit tests, bootstrap backend tests, and desktop/mobile E2E cover all steps/back paths, validation, stable retry, auth loss, conflict, readiness, no activation, and optional payment setup. |
| `StaffManager.svelte` | Accepted `S/C/I/E-smoke` | Four direct cases plus authoritative staff/invite routes cover directory/invite filters, 403/correlation, truncation, last-owner/self protection, membership/invite retry, single submit, stale tenant, audit, and readback. |
| `TeamsManager.svelte` | Accepted `S/C/I/E-smoke` | Two projection cases plus team-form/backend cases cover loading/error/truncation/empty, stable target, create/edit/cancel, validation, duplicate-name denial, stable retry, tenant invalidation, audit/readback. |
| `TransactionDetails.svelte` | Accepted `S/C/I/E-smoke` | Eleven direct cases plus 66 authoritative finance cases cover draft math, ledger/error/truncation, issue/remind/void, offline settlement, refunds, capability/period denial, hosted URL, stable retry, audit, reconciliation, refresh. |
| `events/CreateEventForm.svelte` | Accepted `S/C/I/E-smoke` | Event-family cases cover every step, dates/slots/occurrence bound, exact create contract, single submit/close lock, payload-key rotation, tenant stale response; event backend cases prove denial/readback/audit. |
| `events/DuplicateEventModal.svelte` | Accepted `S/C/I/E-smoke` | Event-family cases cover original times, dates/slots, reason, exact request, single submit, safe stable retry, tenant rejection, readback/audit; modal semantics were repaired by UI-004. |
| `events/EditEventModal.svelte` | Accepted `S/C/I/E-smoke` | Event-family/publication cases cover identity/date/status/scope/reason, deliberate publish confirmation, in-flight lock, safe stable retry, tenant rejection, authoritative readback/audit. |
| `events/EventRegistrantsModal.svelte` | Accepted `S/C/E-smoke` | Shared-table and event cases cover ID, search/page/export scope, incomplete wording, empty/error state, close and focus behavior. |
| `events/RecurrenceSelector.svelte` | Accepted `S/C/E-smoke` | Three direct cases cover inclusive dates, DST, weekday/empty/invalid rules, duplicate suppression, calendar navigation, remove/clear/done; modal route smoke covers responsive mount. |
| `registration/CreateRegistrationForm.svelte` | Accepted `S/C/I/E-smoke` | Four direct cases plus registration-form routes cover create/edit distinction, fields/status validation, single submit/close lock, safe stable retry, tenant stale response, audit/readback. |
| `registration/FormsTable.svelte` | Accepted `S/C/E-smoke` | Shared table plus manager cases cover stable target after filter/sort/page, lifecycle scope, missing metadata, truncation, export, and empty/error states. |
| `registration/RegistrationDetail.svelte` | Accepted `S/C/E-smoke` | Three direct cases cover stable keyed rows, page/row selection, search-clear, filtered/selected CSV, hidden-selection reset, incomplete finance/event state, loading/error/retry/empty, and responsive table regions. |
| `registration/RegistrationManager.svelte` | Accepted `S/C/I/E-smoke` | Four direct cases plus registration routes cover exact lifecycle tabs/export, one toolbar, form/detail retry, stale same/cross-tenant responses, live update/removal, mutation readback. |
| `roster/ImportCsv.svelte` | Accepted `S/C/I/E-smoke` | Four direct cases plus roster API/backend tests cover local CSV validation/reset, exact preview/commit, reviewed-field lock, same-file/team/tenant changes, partial/error response, stable retry, audit/readback. |
| `roster/PlayerTable.svelte` | Accepted `S/C/I/E-smoke` | Four atomic-transfer cases plus shared table/backend routes cover stable selection/filter/page, malformed omission, preview/commit, move atomicity, duplicate submit, field lock, denial, stale tenant, stable retry, audit/readback. |
| `roster/RosterManager.svelte` | Accepted `S/C/E-smoke` | Three manager cases and a fake-timer visibility case cover one scoped subscription, stale callback, loading/error/truncation, accessible tabs, hidden pause/visible refresh, tenant/team switch, cleanup. |
| `roster/TeamTable.svelte` | Accepted `S/C/I/E-smoke` | Three roster-table cases, shared table, team form, and backend routes cover stable/malformed rows, create/open/edit/cancel, projection states, retry/locking, audit/readback. |
| `seasons/CreateSeasonModal.svelte` | Accepted `S/C/I/E-smoke` | Thirteen season-family cases cover name/date/form projection validation, truncation/error, exact create, in-flight lock, stable retry/key rotation, tenant stale response; backend routes prove audit/readback/denial. |
| `seasons/EditSeasonModal.svelte` | Accepted `S/C/I/E-smoke` | Season-family cases cover stale selection, date/status/media/description/reason, single submit, close lock, stable retry, tenant invalidation, authoritative audit/readback. |
| `seasons/LinkEventModal.svelte` | Accepted `S/C/I/E-smoke` | Season-family cases cover search/projection/truncation/malformed/already-linked states, exact link, create-new/close, stable retry, tenant stale response, audit/readback. |
| `seasons/SeasonDetail.svelte` | Accepted `S/C/I/E-smoke` | Season-family cases cover tabs, keyed participants/events, incomplete export/financial refusal, malformed omission, add/link/edit, typed unlink confirmation, stable retry, tenant scope, backend audit/readback. |
| `seasons/SeasonsManager.svelte` | Accepted `S/C/E-smoke` | Season-family cases cover loading/error/truncation/malformed scope, cards/table/search, create/open/edit, selected-detail live refresh/removal, tenant invalidation, responsive table region. |
| `teams/CreateTeamForm.svelte` | Accepted `S/C/I/E-smoke` | Four direct cases plus team backend routes cover normalized create/update, validation, single submit/full lock, safe stable retry/key rotation, no-tenant and duplicate-name denial, tenant invalidation, audit/readback. |
| `ui/StatusButton.svelte` | Accepted `S/C` | Two direct cases cover native button forwarding, disabled/loading suppression, all visible state labels, and caller style/class behavior. |

Final automated checkpoint:

- 40 reachable Svelte components and 368 native controls;
- 151-file zero-error type check;
- 136 unit and 137 component tests;
- one guarded integration pass and one explicit emulator opt-in skip;
- 131 authoritative backend/rules cases plus 24 Functions cases;
- six Playwright cases across desktop/mobile, including all 14 lazy modules;
- clean local build/security/performance and zero production dependency advisories.

## Every CRM browser-runtime file

| File | Contract to verify | Required evidence |
| --- | --- | --- |
| `src/layouts/CrmLayout.astro` | Production config injection, CSP-compatible loading, no secret exposure, CRM-only bundle. | `S/E/P` |
| `src/pages/admin/index.astro` | Authenticated CRM entry and layout composition. | `S/E` |
| `src/pages/admin/setup.astro` | Setup entry and environment behavior. | `S/E` |
| `src/styles/crm.css` | Focus visibility, responsive overflow, modal layering, reduced motion, table usability. | `S/E` |
| `src/lib/api/BackendApi.ts` | Auth/App Check refresh, request correlation, timeout, idempotency headers, query/body construction, strict successful-response validation. | `S/C/I` |
| `src/lib/api/backendClient.ts` | Canonical public-environment wiring and token providers. | `S/C` |
| `src/lib/authStore.ts` | Auth callback generation, logout/user-switch races, tenant retention, fail-closed access state. | `C/I` |
| `src/lib/config/publicEnvironment.ts` | Production HTTPS/non-loopback requirements and App Check requirement. | Existing unit tests plus release preflight. |
| `src/lib/finance/crmFinancials.ts` | Integer minor units, currency separation, lifecycle capability, reconciliation, refund balance. | Existing unit tests plus malformed fixtures. |
| `src/lib/firebase.ts` | Single initialization, safe public config, App Check activation, emulator/prod separation. | `S/C/P` |
| `src/lib/firebaseStorage.ts` | Lazy Storage initialization and upload-boundary inclusion. | Existing performance source unit plus `E`. |
| `src/lib/services/AuthService.ts` | Active authoritative membership/role parsing and platform-admin behavior. | Existing unit plus emulator denial/readback. |
| `src/lib/services/DataStore.ts` | Lazy tenant listeners, 500-record bounds, loading/error/permission/truncation state, scoped financial aggregates. | Existing performance/unit plus component projection tests. |
| `src/lib/services/RegistrationService.ts` | Form/event/registration query bounds, chunking, stale scope, error propagation, normalized display records. | Direct unit evidence proves 501-request/500-exposed bounds, scope metadata, status/date normalization, no-tenant behavior, 30-event-ID chunking, tenant predicates, stable-ID deduplication/sorting, safe display projection, and failure propagation. Emulator `I` remains. |
| `src/lib/services/RosterService.ts` | Poll timing, background pause, tenant/team switching, backend metadata propagation and cleanup. | Existing performance source unit plus fake-timer `C`. |
| `src/lib/ui/csvExport.ts` | Formula escaping, quoting, stable headings, filename normalization. | Existing unit plus browser download `E`. |
| `src/lib/ui/modalFocus.ts` | Focus trap, Escape, prior-focus restoration, disabled/hidden focus targets, nested modal behavior. | Partial component evidence; dedicated `C/E`. |
| `src/lib/ui/registrationDisplay.ts` | Missing/malformed participant and payer names, timestamps, IDs. | Dedicated unit tests. |

## Final browser-runtime disposition register

This closes the local owner qualification for all 18 shared runtime files. A
local acceptance does not substitute for the production-provider, field,
provenance, or independent-review evidence called out explicitly below.

| File | Final disposition | Final evidence |
| --- | --- | --- |
| `src/layouts/CrmLayout.astro` | Local `S/C/E` accepted; `P` external | Environment injection, release-input isolation, lazy CRM graph, CSP/static-security checks, and both authenticated viewports pass. Production headers and CDN behavior remain BLK-008. |
| `src/pages/admin/index.astro` | Accepted `S/E` | The canonical authenticated entry builds and is exercised by verified-owner desktop/mobile E2E across every lazy module. |
| `src/pages/admin/setup.astro` | Accepted `S/E` | The setup entry builds; desktop/mobile E2E proves visible free-administration wording and optional payment setup before authentication. |
| `src/styles/crm.css` | Accepted `S/C/E` | Source contracts pin focus, modal layers, reduced motion, responsive tables/cards, and keyboard-scroll regions; both authenticated viewports have zero document overflow. |
| `src/lib/api/BackendApi.ts` | Accepted `S/C/I` | The full API unit suite pins token refresh, App Check, correlation, timeouts, idempotency, strict response envelopes, safe errors, and every reachable method; authoritative route tests prove denial, replay, persistence, and audit. |
| `src/lib/api/backendClient.ts` | Accepted `S/C/I/E-smoke` | Canonical environment/token wiring is source- and unit-pinned, exercised by component contracts, and used by the authenticated browser failure paths without leaking provider or exception detail. |
| `src/lib/authStore.ts` | Accepted `S/C/I/E` | Auth/service and access component cases prove active membership parsing, rejected access, user/tenant changes, teardown ordering, and fail-closed roles; Auth-emulator E2E proves verified-owner routing. |
| `src/lib/config/publicEnvironment.ts` | Local `S/C` accepted; provider evidence external | Unit and fail-closed release-preflight cases reject loopback HTTP, missing production App Check, test keys, malformed public config, and unsafe backend origins. Provider registration/attestation remains SEC-005. |
| `src/lib/finance/crmFinancials.ts` | Accepted `S/C/I` | Finance units and components pin integer minor units, currency separation, capabilities, invoice/payment/refund/dispute/deposit lifecycles, balances, and malformed projections; authoritative finance routes pin persisted outcomes. |
| `src/lib/firebase.ts` | Local `S/C/E` accepted; provider evidence external | Initialization, emulator separation, safe public config, and conditional App Check activation are source/unit pinned and exercised by Auth/Firestore-emulator E2E. Real provider/device telemetry remains SEC-005. |
| `src/lib/firebaseStorage.ts` | Accepted `S/C/E-smoke` | Lazy initialization and artifact-boundary inclusion are source-pinned. No direct CRM upload control remains; authenticated E2E mounts the media surface without eagerly adding Storage to the initial graph. |
| `src/lib/services/AuthService.ts` | Accepted `S/C/I/E` | Unit cases pin authoritative membership/role parsing and platform-admin behavior; rules/backend denial tests and verified-owner emulator E2E prove the access boundary. |
| `src/lib/services/DataStore.ts` | Accepted `S/C/I/E` | Query-bound units and direct projection components prove lazy listeners, 501-request/500-exposed limits, distinct states, currency-safe scoped aggregates, and cleanup; rule isolation plus E2E cover tenant access. |
| `src/lib/services/RegistrationService.ts` | Accepted `S/C/I/E-smoke` | Direct units prove tenant predicates, bounds, 30-ID chunking, stable dedupe/sort, normalized records, and failure propagation; registration/rules tranches prove mutation/read boundaries and authenticated E2E mounts both registration views. |
| `src/lib/services/RosterService.ts` | Accepted `S/C/I/E-smoke` | Source and fake-timer component cases prove bounded polling, hidden-page pause, visible refresh, tenant/team invalidation, metadata propagation, and cleanup; authoritative roster routes prove denial/readback/audit. |
| `src/lib/ui/csvExport.ts` | Accepted `S/C/E-smoke` | Unit and table/component cases prove formula escaping, quoting, stable headings, selected/filtered scope, and safe filenames; authenticated E2E mounts every export-bearing module without browser errors. |
| `src/lib/ui/modalFocus.ts` | Accepted `S/C/E` | Dedicated component cases prove first focus, Tab/Shift+Tab wrap, disabled/hidden target exclusion, Escape, and opener restoration; source audit pins all 16 consumers and authenticated E2E proves shell/search/drawer behavior. |
| `src/lib/ui/registrationDisplay.ts` | Accepted `S/C/E-smoke` | Dedicated units prove safe missing/malformed participant, payer, ID, and timestamp projection; registration component cases and authenticated module E2E consume the projection. |

## Backend and Firebase contract matrix

Every frontend method that is reachable in the table above must be exercised
against the authoritative backend route with:

- missing/expired Auth token;
- missing/invalid App Check token in enforced environments;
- wrong tenant and insufficient capability;
- invalid/malformed/oversized payload;
- duplicate delivery with one stable idempotency key;
- same key with a different payload;
- timeout after server commit followed by retry;
- success readback and audit-event/request-ID correlation;
- financial-period lock where the mutation is lock-covered;
- bounded list metadata and malformed cursor;
- cross-tenant list and document-ID denial.

The route families are: financial overview/periods/direct invoices/refunds/
exports, roster preview/commit, team/event/season/registration-form mutation,
documents, staff membership/invites, message send/recall, app configuration,
onboarding bootstrap, audit projection, and Stripe Connect status/account link.
Unused client methods are not evidence of shipped UI; they must either receive a
reachable, tested surface or be documented as backend-only/not shipped.

Firebase rules and triggers must separately prove:

- tenant-scoped read/create/update/delete for browser-readable operational
  collections;
- backend-only financial, invite, export, and audit collections;
- append-only audit behavior and trigger failure visibility;
- Storage metadata/path/byte authorization;
- explicit media availability/approval semantics if the UI makes that claim.

## Final execution order

1. Freeze both workspaces and record Git revisions plus dirty-tree disposition.
2. Regenerate the 40-file native-control inventory and update its exact total.
3. Run type, full unit, full component, integration, build, security,
   performance, and dependency gates.
4. Run authoritative backend/rules/function unit and emulator suites.
5. Seed a unique loopback tenant; execute every mutation success, denial,
   timeout-retry, readback, and audit case.
6. Execute Playwright at desktop and mobile widths for every reachable tab,
   modal, table, filter, toggle, export, and role.
7. Re-run after refresh and tenant switch to catch stale state.
8. Record every row as pass, blocked, unsupported-but-truthful, or release
   blocker. No row may remain “not run.”
9. Execute production-provider smoke checks without mutating real customer
   financial data.
10. Issue the go/no-go decision from the resulting evidence, not from static
    control counts.

## Commands after source freeze

From the site workspace:

```sh
npm run test:type
npm run test:unit
npm run test:component
npm run test:integration
PUBLIC_FIREBASE_APP_CHECK_SITE_KEY=test-enterprise-site-key npm run test:build
npm run test:e2e
npm run release:audit
```

The emulator command is intentionally separate because it requires an explicit
loopback fixture:

```sh
RUN_FIREBASE_EMULATOR_TESTS=1 npm run test:integration:emulator
```

Backend, Firebase rules, functions, release-preflight, and production-provider
commands must be taken from the authoritative workspace’s final release
scripts after its revision is frozen; placeholder commands are not accepted as
evidence.
