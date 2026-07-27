# CRM System File Audit

Status: in progress; production acceptance is not granted by this document

Review date: 2026-07-26
Site workspace: `/Users/kennygrimblejr./HuddleWaySite/HuddleWaySite`
Authoritative app/backend workspace: `/Users/kennygrimblejr./HuddleWay`

## Purpose

This is the broader companion to `CRM_CONTROL_INVENTORY.md`. The control
inventory reviews every visible native control in every CRM Svelte component.
This audit prevents non-visual files—services, rules, server routes, triggers,
migrations, fixtures, release scripts, and workflows—from escaping review.

The file boundary is deliberately narrower than both whole repositories:
unrelated marketing pages, Flutter presentation features, generated build
artifacts, dependency directories, caches, screenshots, and local debugging
scripts are not CRM release inputs. Every retained CRM release input is covered
by one of the exact scopes below.

## File scopes and required disposition

| Scope | Exact source boundary | Per-file review required |
| --- | --- | --- |
| CRM UI | `src/components/crm/**/*.svelte` | Parsed control inventory, manual handler trace, loading/empty/error/permission state, responsive and keyboard review, component or live-browser evidence. |
| CRM browser runtime | `src/lib/**/*.ts`, `src/layouts/CrmLayout.astro`, `src/pages/admin/**/*.astro`, `src/styles/crm.css` | Import/use graph, tenant scope, authorization boundary, App Check/config handling, money semantics, query/listener lifetime, error propagation, and production-bundle inclusion. |
| Site qualification | `tests/**/*`, `playwright.config.ts`, `vitest*.config.ts`, `astro.config.mjs`, `tsconfig.json`, `tailwind.config.mjs`, `.env.example`, `.node-version`, `package.json`, `package-lock.json` | Test intent and negative-path coverage, loopback/emulator guards, deterministic toolchain, dependency audit, and build/runtime parity. |
| Site release | `scripts/release/**/*`, `scripts/check-security-headers.mjs`, `.github/workflows/crm-release-gate.yml` | Clean provenance, environment validation, artifact manifest/checksum, stale-artifact quarantine, headers, evidence retention, and rollback input. |
| Backend authority | `backend/server.js`, `backend/lib/**/*` imported by CRM routes/contracts, `backend/package*.json` | Route inventory, token/App Check/tenant/capability checks, validation, idempotency, audit/correlation, safe errors, webhook reconciliation, bounded reads, and dependency audit. |
| Firebase boundary | `firestore.rules`, `storage.rules`, `firestore.indexes.json`, `firebase.json`, `functions/crm_audit_triggers.js`, the trigger registrations in `functions/index.js`, and their tests/package lock | Cross-tenant denial, backend-only collections, direct-write disposition, append-only audit enforcement, Storage scope, index parity, emulator tests, and functions dependency audit. |
| Data and operations | CRM migration/seed/backup/restore/index/monitor scripts and configs plus `.github/workflows/crm_*` and `nightly_backup.yml` | Production-data guards, deterministic fixtures, dry-run/checksum/idempotency, restore readback, rollback, alert ownership, correlation IDs, and external-evidence gaps. |
| Contract and release docs | `docs/CRM_*`, `docs/FINANCIALS_SCHEMA_SOURCE_OF_TRUTH.md`, and this site’s `docs/CRM_*` / feature script | Claims-to-code alignment, lifecycle semantics, task evidence, blockers, and final go/no-go consistency. |

## Review sequence for every file

1. Classify it as runtime, contract, test, fixture, operations, generated, or
   out of release scope.
2. Trace every imported dependency and every consumer; unused test/demo data
   must not remain in production source.
3. For runtime files, enumerate reads, writes, network calls, timers,
   subscriptions, storage operations, and user-visible errors.
4. For every mutation, prove tenant/capability authorization, authoritative
   validation, idempotency where repeat delivery is possible, before/after
   audit evidence, actionable failure, and refresh persistence.
5. For tables and projections, prove stable identity, declared scope, bounded
   cardinality, filter/sort/export parity, malformed-record behavior, and all
   empty/loading/error/permission/truncation states.
6. For tests, map the assertion to a release behavior; source-string presence
   is not accepted as success-path or failure-path qualification.
7. For configuration and operations, execute both positive and fail-closed
   cases and record which evidence can only come from the deployed provider.
8. Record a finding, a passing check, or an explicit out-of-scope reason.
   Silence is not a disposition.

## Current site-side file plan

This snapshot is regenerated after each implementation freeze. Counts are not
release evidence until the final tree is frozen, but each current file already
has an assigned review method rather than a spot-check.

| File group | Current count | How every file is checked |
| --- | ---: | --- |
| `src/components/crm/**/*.svelte` | 40 | Svelte parse/type check; exact 368-native-control count; handler/binding/link/disabled disposition; direct-write and placeholder scan; manual state/permission/keyboard/mobile review; seeded browser path. |
| CRM browser runtime (`src/lib/**/*.ts`, admin layouts/pages, CRM CSS) | 18 | Full source read and import/consumer trace; network/read/write/timer inventory; tenant and money contract checks; malformed-data and error propagation tests; bundle inclusion. |
| `tests/**/*` | 53 | Assertion-to-gate mapping; fixture provenance; loopback/emulator guard review; negative-path strength; false-positive/source-string-only test review. |
| Site release files | 3 | Positive and fail-closed preflight, artifact, header, performance, checksum, clean-tree, and backend-revision cases. |

The UI inventory is pinned in `tests/unit/crm-control-inventory.test.ts` and
documented file by file in `CRM_CONTROL_INVENTORY.md`. The non-visual runtime
set is:

```text
src/layouts/CrmLayout.astro
src/lib/api/BackendApi.ts
src/lib/api/backendClient.ts
src/lib/authStore.ts
src/lib/config/publicEnvironment.ts
src/lib/finance/crmFinancials.ts
src/lib/firebase.ts
src/lib/firebaseStorage.ts
src/lib/services/AuthService.ts
src/lib/services/DataStore.ts
src/lib/services/RegistrationService.ts
src/lib/services/RosterService.ts
src/lib/ui/csvExport.ts
src/lib/ui/modalFocus.ts
src/pages/admin/index.astro
src/pages/admin/setup.astro
src/styles/crm.css
```

The event mutation trace was checked against the authoritative
`/Users/kennygrimblejr./HuddleWay/backend/lib/crm_resource_mutations.js`
contract rather than inferred from UI names. In particular,
`event.create_series` rejects unknown keys and derives `publishAt` server-side;
the client no longer sends that rejected key. Create, duplicate, and update
responses now require action-specific identity/count/publication evidence
before the UI reports success.

The exact backend set is derived from the 82 mutation-route inventory plus
every `backend/lib` module imported by `backend/server.js`, the related
contract/integration/rules tests, Firebase rules and trigger registrations,
release-operation scripts/config, and release workflows. This avoids the
opposite errors of reviewing only the Svelte directory or pretending unrelated
Flutter presentation/assets are CRM release inputs.

## Findings already produced by the system-file pass

- The authoritative backend, rather than the static site, owns financial,
  roster, invitation, communication, webhook, rules, migration, and audit
  truth.
- An unused 852-line synthetic registration dataset was found under
  production `src/lib` and moved to `tests/fixtures`; a unit guard prevents it
  from returning to production source.
- An unbacked monthly-payment control and fabricated per-transaction fee were
  discovered through import/use tracing even though the earlier inventory
  described that component as unmounted. The component and writes were
  removed, and the inventory was rebased.
- A live staff invite failure was traced to missing local
  `ADMIN_APP_BASE_URL`; the request reached the backend and failed while
  constructing the invitation URL. The final fixture run must set the
  loopback URL and verify success, failure, persistence, and audit behavior.
- Frontend production dependencies currently audit clean. The backend and
  functions graphs required separate remediation; a site-only audit was not
  accepted as system evidence.
- The financial control trace found and repaired client defects that static
  handler inventory could not detect: asynchronously loaded rows and filter
  changes did not invalidate helper-based Svelte projections; real direct
  invoice rows used a prefixed UI ID that caused ledger responses to be
  discarded; draft totals did not react to line edits; refresh blanked the
  current projection; and pending mutations/exports could outlive tenant,
  row, or team scope. Focused component and strict API-envelope tests now pin
  those paths.
- The authoritative `POST /admin/crm/exports` blocker is repaired. Export
  operations are tenant/actor/key scoped, fingerprint a normalized request,
  persist one deterministic compressed/checksummed job, replay the original
  payload after a lost response, reject changed-payload key reuse, and recover
  one deterministic audit from `audit_pending`. An authenticated metadata
  readback route verifies the durable result without returning the CSV.
  Contract/integration evidence covers lost response, replay, conflict,
  cross-tenant/role denial, one job, one audit, and readback.
- All former direct browser Firestore and Storage mutations have been moved
  behind authenticated server boundaries and the zero-direct-write contract is
  regression-tested. Browser alerts/confirms, trigger-only failure/denial
  coverage, exact-count/cursor limitations, clean revision provenance, field
  monitoring, and Storage-byte recovery remain release decisions until their
  implementation/evidence is complete; Flutter App Check activation and
  financial period locks now have local implementation evidence but still
  require their documented external acceptance where applicable.

## Final evidence still required

After implementation freezes, this document will receive:

- the final exact file counts for every scope above;
- the final static finding counts;
- the command/test matrix and hashes;
- the live browser route/control matrix;
- the accepted versus blocked release-gate table;
- the release auditor’s go/no-go decision.

Until those sections are complete, this document is a work plan and evidence
index, not a production approval.
