# CRM table and projection audit

Audit date: 2026-07-26
Release boundary: the Svelte CRM under `src/components/crm` and its authoritative reads from `/Users/kennygrimblejr./HuddleWay`
Result: owner implementation evidence complete for UI-003; independent release acceptance remains open.

## Release standard

Every retained record collection must satisfy the following rules:

1. The active tenant is part of the authoritative query or backend authorization boundary.
2. A row used for selection, navigation, mutation, or keyed rendering has a non-empty stable identifier. Malformed or duplicate identifiers fail closed instead of being assigned a positional identity.
3. A bounded result is described as a loaded projection. When the bound is reached, the UI says that search, counts, selection, and exports may be incomplete.
4. Search, filters, sorting, pagination, selection, and export operate on the same stated scope. A client-side export never claims to be a server-wide export.
5. Loading, empty, no-results, permission, error, and truncation states are distinct where the authority can return them.
6. Derived financial totals are hidden or labeled unavailable when any required projection is loading, failed, mixed-currency, malformed, or truncated.
7. A horizontally scrollable desktop table is keyboard-focusable and named. Shared `DataTable` consumers use mobile record cards instead of forcing a table viewport.

## Native table inventory

| Surface | Source and bound | Stable identity | Controls and scope | Failure and responsive behavior |
|---|---|---|---|---|
| Shared record table | `DataTable.svelte`; caller supplies an already tenant-scoped bounded projection | Required `rowKey`, duplicate/missing-ID rejection, keyed rows, ID-based page selection | Loaded-scope search, sortable headers, 25-row default pagination, current-page selection, filtered-or-selected CSV with formula escaping | Separate loading, permission, error, empty, no-results, and truncation states; desktop table plus mobile cards |
| Financial records | `Financials.svelte`; owner-only backend overview, at most 500 records per collection | Normalized kind-and-record ID; malformed rows are refused by the strict backend client | URL-aligned status/currency/date/search filters, deterministic sorting, 25/50/100 pagination, stable selection, visible columns, tenant-local saved views, audited backend invoice export | Permission and correlated failure states; incomplete projections refuse authoritative totals; keyboard-named horizontal region |
| Staff memberships and invites | `StaffManager.svelte`; owner-only backend directory, 100 per category | Membership ID and invite ID; strict response validation rejects malformed IDs | Directory/invite view, role filter, search, retry, lifecycle action. Export is deliberately absent because there is no approved staff-PII export contract | Loading, error with request ID, empty/no-results, and category-specific truncation; keyboard-named horizontal region |
| Registration connected events | `RegistrationDetail.svelte`; tenant/form query, at most 500 | Firestore event document ID and keyed rows | Read-only connected-event scope; no selection or export is implied | Empty and incomplete-detail notice; keyboard-named horizontal region |
| Registration participants | `RegistrationDetail.svelte`; tenant/form/event query, deduplicated and capped at 500 | Registration document ID, keyed rendering, ID selection | Search, current-page selection, 10-row pagination, filtered-or-selected CSV; labels explicitly limit counts/export/payment status to loaded scope | Loading, error/retry, empty/no-results, truncation notice; keyboard-named horizontal region |
| Season participants | `SeasonDetail.svelte`; tenant season-registration projection, at most 500 | Normalized registration ID; identifier-less rows omitted and counted | Name search and loaded-scope CSV. Export and financial labels are disabled until registration, event, and financial projections are complete | Loading, error, empty, malformed, and truncation states; keyboard-named horizontal region |
| Season events | `SeasonDetail.svelte`; tenant event projection, at most 500 | Normalized event ID; identifier-less rows omitted and counted | Deterministic date sort and audited unlink action. No bulk export is claimed | Loading, error, empty, malformed, and truncation states; keyboard-named horizontal region |
| Seasons | `SeasonsManager.svelte`; tenant season projection, at most 500 | Normalized season ID; identifier-less rows omitted and counted | Search and card/table view; row actions operate on stable IDs. No export is claimed because no approved season export contract exists | Loading, error, empty/no-results, registration/event/financial truncation notices; default cards plus keyboard-named table region |

There are eight native `<table>` elements across six components. The shared table is also consumed by:

- `events/EventRegistrantsModal.svelte`
- `registration/FormsTable.svelte`
- `roster/PlayerTable.svelte`
- `roster/TeamTable.svelte`

Those four consumers inherit stable-ID validation, loaded-scope pagination, responsive cards, search/sort, and state handling. Event, registration-form, roster-player, and roster-team projections all surface their own truncation wording.

## Non-table record projections

| Surface | Projection rule and deliberate control boundary |
|---|---|
| Dashboard recent registrations and KPIs | Tenant queries request 501 and expose at most 500. Counts become `500+`/unavailable when incomplete; revenue is never summed across missing, malformed, or mixed-currency records. |
| Global search | Searches only the three successfully loaded tenant projections, returns at most five per category, omits identifier-less results, and refuses partial results if any category failed. |
| Teams and event scheduler cards | Tenant projections are capped at 500, keyed by document ID, and warn when incomplete. Record actions require the stable ID. |
| Activity | Owner-only backend cursor. The “Load more” button advances the returned cursor, suppresses duplicates by audit ID, and distinguishes initial/load-more failures. |
| Messages | Backend page is capped at 100. The UI says when more messages exist and does not offer a cursor control the backend does not provide. |
| Documents | Backend page is capped at 100. Truncation is explicit; publish/availability actions use stable IDs and authoritative refresh. |
| Media | Backend page is capped at 200. Search/category filters apply only to loaded records; truncation is explicit and identifier-less media are rejected by the client contract. |
| Financial periods | Backend list is capped and reports truncation. Close is blocked when its authoritative preview is incomplete; reopen targets the period ID. |
| My App previews | Backend preview contracts return bounded schedule/roster records with strict IDs. Missing or malformed preview envelopes fail closed. |
| Setup lists and modal option lists | These are bounded choices from the current tenant projection, not report tables. A truncated source is disclosed and unsafe create/link operations are disabled where completeness is required. |

## Export dispositions

- Audited server export: direct invoices only.
- Loaded-scope CSV: shared `DataTable`, registration forms, registration participants, event registrants, roster players, roster teams, and season participants.
- Deliberately no export: staff PII, core processor transactions/refunds/deposits, seasons, messages, documents, media, events, and activity. No approved authoritative export contract exists for those surfaces.
- CSV generation escapes spreadsheet formula prefixes.
- A truncated loaded-scope export is labeled as incomplete. Season participant export is stricter and is disabled until all contributing projections are complete.

## Verification

Pinned by `tests/unit/crm-table-projection-audit.test.ts` and exercised by the direct component suites for `DataTable`, financials, registration, seasons, roster, staff, search, and Dashboard. `tests/e2e/authenticated-crm.spec.ts` adds verified-owner desktop/mobile shell, search, focus-return, responsive navigation, and overflow evidence against Auth and Firestore emulators only.
