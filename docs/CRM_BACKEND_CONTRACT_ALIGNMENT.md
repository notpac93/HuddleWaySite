# Svelte CRM Alignment to the App Backend Contract

Status: Active client-integration contract

Schema authority: `/Users/kennygrimblejr./HuddleWay`

Client owner: this HuddleWaySite repository

Schema version: 1

Last reviewed: 2026-07-26

## Purpose

This document does not define a second CRM schema. It records how the Svelte
CRM must consume the authoritative app/backend contract and identifies legacy
site shapes that must be migrated or removed before production.

The controlling sources are:

1. `HuddleWay/docs/CRM_DATA_DICTIONARY.md`
2. `HuddleWay/docs/FINANCIALS_SCHEMA_SOURCE_OF_TRUTH.md`
3. `HuddleWay/backend/lib/crm_contracts.js`
4. `HuddleWay/backend/lib/crm_migration_contract.js`
5. `HuddleWay/backend/lib/direct_invoice_contract.js`
6. `HuddleWay/firestore.rules`
7. `HuddleWay/storage.rules`

If this document becomes stale, those files win. The client must fail closed
on an unsupported contract version and must not silently coerce a new backend
shape into a legacy UI model.

## Contract ownership

| Layer | Owns | Does not own |
| --- | --- | --- |
| App/backend project | Persisted schemas, statuses, lifecycle validation, authorization, migrations, provider reconciliation, audit records | Svelte presentation state |
| Svelte CRM | View models, formatting, local draft state, loading/error/permission states, API invocation | Persisted schema invention, authorization, financial transitions |
| Firebase Auth | Authenticated identity | Tenant authorization or financial permission |
| Production Firestore/Storage rules | Direct-access enforcement | Button visibility or API business logic |

Shared generated client types may be added later only if they are generated
from, version-pinned to, and drift-checked against the app contract. Handwritten
site-owned persistence interfaces are prohibited because they would become a
parallel schema.

## Canonical CRM entities

The task-register language maps to the app contract as follows:

| CRM concept | Canonical app collection/contract | Client rule |
| --- | --- | --- |
| Tenant | `tenants/{tenantId}` | Use stable ID; tenant status and branding are server/rules governed. |
| Staff and invite | `users/{uid}` plus `tenant_memberships/{tenantId_uid}` | A user record alone grants no tenant access. Membership status is `pre_registered`, `invited`, `verification_pending`, `active`, `suspended`, or `archived`. |
| Household | No standalone `households` collection in schema v1 | Present household/grouping as a view derived from people, guardian/player links, registrations, and payer summaries. Do not persist a new collection from this client. |
| Participant | `people/{personId}` plus `tenant_private/{tenantId}/people/{personId}` | Operational roster data and private PII are separate. The client must not flatten DOB, medical, guardian, waiver, and address data into an operational row. |
| Guardian relationship | `guardian_player_links/{linkId}` | Use explicit effective/consent relationship records; never infer authority from matching names or email. |
| Team | `teams/{teamId}` | Stable tenant-scoped definition. Display names are not identifiers. |
| Season | `seasons/{seasonId}` | Stable tenant-scoped definition referenced by events/memberships. |
| Event | `events/{eventId}` | Lifecycle is `draft`, `review`, `published`, or `archived` in production rules. Published records require the rule-validated payload. |
| Registration form | `registration_forms/{formId}` and versioned form reference | A registration/event refers to an immutable version; the client does not reinterpret old answers using a current draft form. |
| Registration | `registrations/{registrationId}` plus `tenant_private/{tenantId}/registrations/{registrationId}` | Operational projection and protected submission are separate. App migration explicitly recognizes `pending`, `confirmed`, `cancelled`, `waitlisted`, and `refunded`; nonblank unknown legacy values are preserved for review rather than silently guessed. |
| Roster membership | `team_memberships/{membershipId}` | Stable ID is tenant + team + registration scoped. Status is `active` or `removed`; registration history is not rewritten to simulate roster edits. |
| Invoice | `direct_invoices/{invoiceId}` for CRM collection intent; legacy/core `invoices/{invoiceId}` remains a separate financial contract | The UI must label which invoice resource it shows. It must not merge the two shapes by guessing. |
| Payment transaction | `direct_invoice_payments/{paymentId}` for direct invoices; `transactions/{transactionId}` for processor ledger | Backend-owned and immutable/idempotent. Never written directly by the Svelte client. |
| Refund | `direct_invoice_refunds/{refundId}` for direct invoices; `refunds/{refundId}` for core ledger | Backend-owned and immutable/idempotent. |
| Payout | `deposits/{depositId}` in the current financial source of truth | UI label may say “Payout,” but adapter/resource identity remains `deposits`. |
| Dispute | `direct_invoice_events` and processor/transaction reconciliation; no standalone canonical schema-v1 dispute collection is declared | Display backend-provided dispute state. Do not create a `disputes` collection from the client. |
| Audit | `crm_audit_events/{eventId}` | Backend-owned, append-only, redacted structured details only. |

This mapping resolves REL-003 without adding competing persistence types to the
site repository. Concepts not represented by a schema-v1 collection—most
notably household and standalone dispute—are view concepts until the app
project deliberately versions and ships a new contract.

## Universal metadata and identity rules

Every tenant-owned operational record follows `crm_contracts.js`:

- required immutable `tenantId`;
- required `schemaVersion: 1`;
- stable producer `source`;
- server-owned `createdAt`, `createdBy`, `updatedAt`, and `updatedBy`;
- optional soft-delete `deletedAt` and `deletedBy` for mutable content.

Email lookup uses normalized lowercase values only in tenant-private storage
and a tenant-bound SHA-256 lookup hash in operational collections. Raw invite
tokens, provider secrets, payment credentials, and raw protected provider
payloads are never client persistence fields.

Tenant authorization is based on the app contract and rules, not a client
role enum. Current production rules recognize platform admin claims/documents
and tenant roles `owner`, `editor`, and `viewer`; finance management is owner
or platform-admin only. The target `tenant_memberships` lifecycle is richer
than the current compatibility role lookup and must be enforced by the
backend during the migration.

## Legacy site-to-backend migration map

The current Svelte client contains legacy/direct Firestore shapes. Production
work must use the following disposition:

| Current site usage | Canonical disposition |
| --- | --- |
| `users` as tenant/staff authority | Keep `users` as global identity only; use backend-resolved tenant membership. |
| `staff`, `invites`, `admin_coach_contacts` | Replace with authenticated membership/invite APIs backed by `tenant_memberships`; do not dual-write. |
| Registrations containing full form/guardian data | Read the sanitized `registrations` projection; retrieve/update protected data only through an authorized backend operation using `tenant_private`. |
| `season_registrations` | Migrate with the app-owned migration contract; do not create new legacy records. |
| Roster edits by mutating registration rows | Use idempotent roster operations that create/update stable `team_memberships`. |
| `invoices` and `transactions` treated as editable UI data | Read them as backend-owned core financial records; use direct-invoice APIs for CRM invoice operations. |
| UI-created refund/processor success | Remove. Invoke the authenticated backend and render the returned operation/reconciliation state. |
| `audit_logs` or `admin_audit_logs` as client-written truth | Replace privileged audit writes with backend-owned `crm_audit_events`. |
| Local default tenant or fabricated financial fields | Reject and show explicit configuration/data errors. |

The app project's `crm_migration_contract.js` is the authority for legacy
registration, team-membership, board-message, and direct-invoice backfill
projections. Site code must not implement an independent migration algorithm.

## Authenticated CRM operations and projections

The static Svelte client uses the shared authenticated `BackendApi`; it does
not query backend-only collections directly. The current app-owned boundary is:

| Route | Minimum tenant role | Contract |
| --- | --- | --- |
| `GET/POST /admin/invites` | owner | List or create durable, delivery-tracked, idempotent canonical invites. |
| `POST /admin/messages/batch` and `POST /admin/messages/:messageId/recall` | editor | Send or recall canonical messages with stable IDs and audit evidence. |
| `GET /admin/roster/players` | editor | Return an allowlisted registration/team-membership projection; raw registration form data and membership records are not returned. |
| `POST /admin/teams/:teamId/roster/preview` and `/commit` | editor | Validate a stable roster change set, then commit it once with an idempotency key. |
| `GET /admin/crm/financial-overview` | owner | Return allowlisted transaction, refund, invoice, and deposit projections with integer-or-null minor units. |
| `POST /admin/refund` | owner | Create or resume a durable core refund operation; provider success/local uncertainty is reconciled rather than charged twice. |
| `GET /admin/crm/audit-events` | viewer | Return a tenant-scoped activity projection without actor UID, resource ID, request ID, PII, raw details, or provider payloads. |

Firestore rules remain the final browser boundary. In particular,
`team_memberships`, `crm_audit_events`, core financial collections, roster
operations, and canonical invite/membership records remain backend-only even
when a safe read projection exists.

## Money semantics

All persisted money is a safe integer in the currency's minor unit. In the
current USD direct-invoice contract, the backend field suffix is `Cents`.
For example, `1050` is $10.50. The UI may format that integer as `$10.50` at
the final presentation layer but must never persist a float or formatted
string.

The direct-invoice backend owns these rules:

- one to 100 line items;
- integer quantity from 1 to 1000;
- integer `unitAmountCents` from 0 to 50,000,000;
- discount not greater than subtotal;
- integer tax rate in basis points from 0 to 10,000;
- tax rounding performed by `calculateDirectInvoiceTotals`;
- USD total of at least 50 cents;
- `amountRemainingCents` derived from authoritative totals/payments;
- one currency per invoice/operation;
- no client recomputation is persisted as financial truth.

The older/core finance contract uses integer numeric fields such as
`grossAmount`, `feeAmount`, `netAmount`, `amountPaid`, and `amountDue`.
Despite the absence of a `Cents` suffix, its source of truth states that these
are integer minor units. A client adapter must map field names explicitly; it
must never infer dollars versus cents from magnitude.

The minimum UI invariants are:

```text
line amount = quantity × unit amount
subtotal = sum(line amounts)
direct invoice total = subtotal − discount + rounded tax
amount remaining = max(total − paid, 0), as returned/reconciled by backend
core transaction net = gross − fees, as returned/reconciled by backend
core deposit net = sum(included authoritative net amounts)
```

Formatting, filtering, and summing use the record currency. Mixed-currency
totals are prohibited; group them by currency instead.

## Independent lifecycle projections

Registration, roster membership, invoice, payment, refund, dispute, and payout
are independent records. The UI must never manufacture one status from
another. A successful payment may cause the backend to update an invoice, but
the client waits for authoritative operation/reconciliation results.

### Registration

The current migration contract explicitly recognizes:

`pending`, `confirmed`, `cancelled`, `waitlisted`, `refunded`

It maps legacy `active`, `paid`, `complete`, and `completed` to `confirmed`,
defaults a blank value to `pending`, and preserves another nonblank legacy
value so migration review can surface it. No canonical registration transition
function is declared in schema version 1. Therefore the client may
filter/display recognized statuses but cannot issue an arbitrary status
update. Registration mutations require a backend command that validates the
transition and writes audit evidence. Completing a server-owned transition
table is an implementation dependency of SEC-002, not an invitation for the
site to invent one.

### Roster membership

The canonical record status is `active` or `removed`. Roster commands are
idempotent `add`/`remove` operations, validated and applied by the backend,
with the stable membership ID defined in `team_membership_contract.js`.
Registration status remains unchanged.

### Direct invoice

The authoritative transition table in `direct_invoice_contract.js` is:

| From | Allowed next status |
| --- | --- |
| `draft` | `issuing`, `void` |
| `issuing` | `open`, `draft`, `void` |
| `open` | `partially_paid`, `paid`, `past_due`, `void`, `uncollectible` |
| `partially_paid` | `partially_paid`, `paid`, `past_due`, `void` |
| `past_due` | `partially_paid`, `paid`, `void`, `uncollectible` |
| `paid` | `partially_refunded`, `refunded` |
| `uncollectible` | `paid` |
| `partially_refunded` | `partially_refunded`, `refunded` |
| `void` | none |
| `refunded` | none |

Only a draft is editable. `issuing` is an explicit in-progress state used to
make issue/retry behavior safe. The Svelte client submits a command and renders
the backend result; it does not set invoice status directly.

### Payment

Direct-invoice payment operations are immutable and idempotency-keyed.
Processor refunds resolve an authoritative PaymentIntent or Charge. The core
transaction statuses are `processing`, `succeeded`, `failed`, and `disputed`.
Manual payments require an amount, one of `cash`, `check`, `bank_transfer`, or
`other`, a receipt/reference, and a valid received timestamp. A retry creates
or resumes a backend operation using its idempotency contract; a failed
browser request is not evidence that a processor charge failed.

### Refund

Core refund status is `pending`, `succeeded`, or `failed`. Direct-invoice
refund operations may be `processing`, `pending_reconciliation`, `succeeded`,
or `failed`. Provider success followed by local uncertainty is
`pending_reconciliation`, not a safe retry signal. Invoice refund status is a
separate backend projection.

### Dispute

Schema version 1 does not declare a standalone dispute collection or complete
client transition table. A core transaction may be `disputed`, and
direct-invoice events carry dispute evidence. The UI displays the
backend-returned dispute/reconciliation view and cannot persist a dispute or
derive its final outcome. A future standalone resource requires an app-project
schema-version change.

### Payout/deposit

The canonical persisted resource is `deposits`; statuses are `pending`,
`paid`, and `failed`. It references immutable transaction IDs and authoritative
gross/fee/net totals. The client may call it “Payout” in copy but never changes
the deposit lifecycle or reconstructs settlement truth locally.

## Audit contract

All privileged and financial mutations produce backend-owned
`crm_audit_events` with:

- tenant and universal metadata;
- actor UID and resolved actor role;
- action and resource type/ID;
- request/correlation ID;
- outcome (`succeeded`, `failed`, `partial`, or `denied`);
- safe structured details.

Sensitive before/after payloads, raw PII, secrets, invite tokens, and provider
payloads are prohibited. Where old/new values are required for SEC-004, the
backend records a redacted allowlisted change set inside safe details. The
Svelte client supplies a user-entered reason when the endpoint requires it but
does not write the audit event itself.

## Query and UI adapter rules

Every tenant-owned query starts with equality on `tenantId`; additional
filters and a deterministic final key follow the backend/index contract.
Cross-tenant scans are platform jobs, never browser queries.

Client adapters must expose four distinct states before table/component code:

1. loading;
2. authorized empty result;
3. denied/insufficient permission;
4. contract, network, or backend failure.

They must preserve stable IDs, currency, raw canonical status, schema version,
and correlation/request ID. Unknown status/version values are shown as an
unsupported-data error and logged without PII; they are never remapped to
`pending`, zero, or another plausible state.

Buttons and toggles that cause mutations use backend capability responses, not
hard-coded role guesses. Every request is single-submit guarded and carries
the endpoint's required idempotency/correlation data.

## Production acceptance consequences

REL-003 and the architectural portion of FIN-001 are complete when the
authority and mappings above are recorded. Production remains a NO-GO until:

- site services stop forbidden direct writes and use authenticated APIs;
- the app project supplies/validates any missing server-owned transition
  contract, especially registration and dispute projections;
- generated or drift-checked client contracts replace ad-hoc object shapes;
- emulator/integration tests prove tenant isolation and role denial;
- financial tests cover duplicate, timeout, reconciliation, and partial-state
  behavior;
- release audit verifies app-contract revision and site artifact provenance
  together.
