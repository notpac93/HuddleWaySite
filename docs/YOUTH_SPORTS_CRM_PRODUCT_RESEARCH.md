# Youth-Sports CRM Product Research and HuddleWay Product Standard

Research date: 2026-07-26
Scope: organization administrators operating youth clubs, camps, leagues, teams, and training programs
Primary comparison set: TeamSnap for Business, SportsEngine HQ, and LeagueApps
HuddleWay implementation authority: `/Users/kennygrimblejr./HuddleWay`

## Executive conclusion

A production youth-sports CRM is not merely a contact database with a calendar. It is a tenant-scoped operating system that keeps five connected records trustworthy:

1. people and family relationships;
2. programs, seasons, teams, and participation;
3. registrations and compliance artifacts;
4. invoices, payments, refunds, disputes, and bank payouts;
5. communications and the audit trail of administrative actions.

The strongest products connect these records without collapsing them into one status or one table. A participant can be registered but unpaid, rostered but ineligible, paid but refunded, or active while a payout is still pending. HuddleWay therefore needs independent lifecycle states and immutable financial/audit history, with server-owned privileged actions.

The market baseline is already higher than “registration plus a payment button.” TeamSnap exposes organization-wide financial insights, outstanding balances, transactions, deposits, estimated deposit dates, refunds, payment plans, offline payments, exports, and detailed role boundaries. SportsEngine connects mobile registration to member profiles, rosters, documents, reports, payment plans, permissions, and financial settings. LeagueApps combines invoices, credits, offline payments, installments, autopay, refunds, disputes, transaction reporting, scheduling, facilities, attendance, communications, and role-based security.

For HuddleWay, the production floor is:

- reliable household/participant/registration identity;
- tenant- and role-scoped operations;
- stable roster and schedule workflows;
- invoice and payment ledgers in integer minor units;
- outstanding-balance and collection workflows;
- processor webhook reconciliation for refunds, disputes, and payouts;
- actionable loading, empty, validation, permission, and failure states;
- immutable audit records for privileged changes;
- complete control-level behavioral tests.

## Research method and limits

- Product claims below use current first-party vendor pages or help documentation retrieved on 2026-07-26.
- Marketing claims are treated as evidence of product positioning, while help-center procedures are preferred for specific workflow behavior.
- This is product and engineering research, not legal, tax, accounting, or compliance advice.
- Competitor behavior is a benchmark, not permission to claim that HuddleWay currently ships the same capability.
- HuddleWay readiness status remains controlled by `docs/FEATURE_DEV_SCRIPT__CRM_PRODUCTION_RELEASE.md`.

## Competitor capability matrix

| Product area | TeamSnap for Business | SportsEngine HQ | LeagueApps | Product implication for HuddleWay |
| --- | --- | --- | --- | --- |
| Operating model | Centralizes registration, payment collection, rostering, scheduling, website, and mobile app. | Registration feeds the member directory, rostering, apps, schedules, chat, and documents. | One management platform for registration, payments, communications, scheduling, reporting, facilities, and mobile. | Use one canonical tenant graph and stable IDs across modules; do not duplicate participant or financial truth in page-local data. |
| Registration | Self-service form creation, in-progress/in-cart entries, waitlists, document/waiver collection, capacity, and exports. | Mobile-friendly forms collect athlete, guardian, coach, document, waiver, and payment data. Registration results are snapshots distinct from current profile data. | Flexible flows and eligibility rules, participant/family data, programs, limits, ecommerce, and abandoned-registration reporting. | Separate current person/household records from registration snapshots; preserve form/version provenance and incomplete/abandoned states. |
| Rostering | Manual/bulk and drag-and-drop assignment from registration, with duplicate-profile caveats when importing. | Registration data flows to season/team rostering; team permissions can be assigned with the roster. | Advanced team management and program/team-specific operations. | Roster changes need stable registration/member IDs, preview, idempotent commit, conflict handling, and an audit trail. |
| Scheduling | Organization-wide calendar, automated scheduling, event editing, and calendar integration. | Team schedules, changes/cancellations, RSVPs, and unified family calendars in the mobile app. | Automatic schedules/brackets, one-off events, scores, standings, RSVPs, check-ins, master schedules, and facilities. | Calendar UX must support team/program scope, recurrence, timezone, conflicts, publish state, attendance, and change notifications. |
| Invoice and collection | Registration and organization invoicing, payment plans, balances, automated reminders, card/ACH, scholarships, and offline payments. | Registration/invoice payments, custom plans, discounts, financial setup, and member billing history. | Invoices, flexible plans, installments, autopay, cards/ACH, credits, discounts, offline payments, and reminders. | Financials must be invoice-led, not transaction-only. “Amount due,” “paid,” “credited,” and “refunded” need separate, reconcilable values. |
| Refunds | Online and offline refund records, per-payment refunds, notes, partial registration refunds, and balance consequences. | Admin-only full/partial refunds, notes, a recollection decision, and refund timing/fee guidance. | Full/partial refunds, credits, offline payments, and adjustment workflows from invoice detail. | Refund UI must show refundable amount, method, reason, fee treatment, resulting balance, idempotency, processor result, and audit event. |
| Financial reporting | Revenue, failed payments, upcoming installments, past due items, payments, outstanding balances, deposits, fees, adjustments, chargebacks, and CSV. | Registration reports with selectable fields, filters, sorting, saved reports, transaction details, and payout reports. | Dashboards and reports for registrations, plans, transactions, refunds, credits, bank transfers, attendance, retention, and abandoned registration. | Provide scoped KPIs plus drill-down tables. Totals must be server-derived, currency-aware, and reproducible from ledger records. |
| Payout reconciliation | Deposit reports tie sales, refunds, fees, adjustments, and chargebacks to a bank deposit; current exports include estimated deposit date. | Financial settings and payout reporting are explicit onboarding/operations areas. | Bank transfers and payment reporting are part of analytics. | Treat processor payout/deposit as its own lifecycle and reconciliation surface; never infer “deposited” from payment success. |
| Communications | Organization messaging plus the family/team app. | Team chat, text, messages, notifications, schedule updates, and groups/smart groups. | Email, text, real-time chat, notifications, and targeted member engagement. | Recipient resolution, consent/preferences, youth-safety policy, delivery state, recall/delete policy, and auditability belong on the server. |
| Roles and permissions | Granular team, division, program, organization, invoicing, registration, messaging, and plan-account permissions. | Roles are labels; permissions separately grant organization, team, financial, registration-builder, website, or compliance access. | Advertises role-based security and privacy controls. | Do not use a role label as authorization. Enforce capability and tenant scope on every server operation, then reflect it in disabled/hidden UI. |
| Reporting UX | Date filters, program/source/status filters, export, and organization-versus-team scope distinctions. | Quick versus saved reports, selected columns, rules, sort, export, and permission gates. | Customizable dashboards, extensive reports, filters, exports, and scheduled exports. | Tables need server/query-aligned filters, saved views, column control, stable selection, pagination/cursors, export jobs, and explicit scope. |

## First-party evidence

### TeamSnap

- TeamSnap positions its business product around integrated registration, rostering, payments, scheduling, website, and mobile operations: [TeamSnap for Business](https://www.teamsnap.com/for-business/partners).
- Its organization financial view includes revenue, failed payments, upcoming installments, past-due items, outstanding balances, completed transactions, offline payments, filters, and CSV export: [Viewing and exporting financial reports](https://helpme.teamsnap.com/article/1064-viewing-and-exporting-financial-reports).
- Its current transaction export includes payment date, program, source, source type, member, status, gross, net, and estimated deposit date: [Export registration and invoicing transactions](https://helpme.teamsnap.com/article/1855-how-to-export-registration-and-invoicing-transactions-in-teamsnap-for-business).
- Registration payment plans support custom or dynamically calculated installments, deposits, multiple plans, and on/off state: [Setting up payment plans](https://helpme.teamsnap.com/article/1888-setting-up-payment-plans-in-registration).
- Refund workflows distinguish invoice versus registration payments, online versus offline methods, full versus partial behavior, notes, fee treatment, and balance consequences: [Issue refunds for member payments](https://helpme.teamsnap.com/article/1362-issue-refunds-for-member-payments).
- Registration exports distinguish the current filtered page from all entries and fee/waiver exports; they also support column management: [Export registration reports](https://helpme.teamsnap.com/article/539-export-registration-reports).
- TeamSnap documents distinct privileges from player/contact through team, division, program, organization administrator, and owner: [User roles and permissions](https://helpme.teamsnap.com/article/1709-user-roles-permissions-teamsnap-for-business).

### SportsEngine

- SportsEngine registration connects forms, member data, rosters, mobile access, documents, reports, payments, and custom plans: [Online sports registration](https://www.sportsengine.com/hq/features/registration/).
- Its reporting workflow supports quick and saved reports, field selection, filter rules, sorting, and status filtering: [Create registration reports](https://help.sportsengine.com/en/articles/6402397-how-to-create-registration-reports).
- Its member directory joins profile, registration history, billing history, groups, messaging, payment requests, and exports: [Members guide](https://help.sportsengine.com/en/articles/6310404-members-guide).
- SportsEngine explicitly separates descriptive roles from access permissions and distinguishes organization, team, financial, registration-builder, website, and compliance permissions: [Grant permissions to members](https://help.sportsengine.com/en/articles/6304301-how-to-grant-permissions-to-members).
- Its API guidance says a registration result is a snapshot and recommends a profile query for current person data: [Getting registrations and results](https://help.sportsengine.com/en/articles/8418009-getting-registrations-and-results).
- The mobile product connects schedules, chat, notifications, rosters, RSVPs, scores, and multi-athlete family calendars: [SportsEngine mobile app](https://www.sportsengine.com/hq/features/mobile-app/).
- Admin refund workflow includes order/transaction search, partial amount, notes, and whether the balance must be recollected: [Refund a registration payment](https://help.sportsengine.com/en/articles/6306809-how-to-refund-a-registration-payment).

### LeagueApps

- LeagueApps describes one tenant operating surface for registration, payments, communication, scheduling, reporting, facilities, integrations, evaluation, family data, role-based security, and privacy: [Youth sports management platform](https://leagueapps.com/youth-sports-management-platform/).
- Its payments product covers invoices, scheduled installments, autopay, cards/ACH, amount due/paid, and analytics: [LeagueApps payments](https://leagueapps.com/youth-sports-management-platform/payments/).
- Its invoice workflow describes amount adjustments, partial/full refunds, credits, plan details, reminders, and offline payments: [Invoice management tools](https://leagueapps.com/blog/save-hours-tracking-payments/).
- Reporting includes registrations, attendance, member information, payment plans, transactions, and configurable dashboards: [LeagueApps reporting](https://leagueapps.com/youth-sports-management-platform/reporting/).
- Scheduling includes automatic schedules/brackets, one-off events, locations, scores, standings, RSVPs, attendance/check-in, master calendars, facilities, and mobile updates: [LeagueApps scheduling](https://leagueapps.com/youth-sports-management-platform/scheduling/).

## The canonical product model

The UI may present joined views, but persistence should retain these boundaries:

### Organization and access

- `tenant`: legal/operating organization, branding, processor connection, timezone, locale, and release state.
- `staff membership`: user-to-tenant relationship, status, assigned teams/programs, and explicit capabilities.
- `invite`: email-targeted, expiring, single-use invitation with accepted/revoked lifecycle.
- `permission`: action/resource capability evaluated independently of a human-readable job title.

### People and participation

- `household`: guardian/billing relationship and contact preferences.
- `person`: adult or youth identity with minimum necessary attributes.
- `guardian_player_link`: verified relationship and its status.
- `registration`: immutable-enough form submission snapshot, form version, participant/guardian references, eligibility, waivers, and payment linkage.
- `team_membership`: stable assignment distinct from the registration; status, effective dates, source operation, and roster role.
- `attendance/RSVP`: event-person response and optional check-in; distinct from roster eligibility.

### Programs and events

- `program/season`: operational and financial scope with start/end dates and open/closed state.
- `team/division`: competition or instruction grouping.
- `event/series`: independently publishable schedule item with timezone, location, team/program scope, recurrence, and lifecycle.
- `facility/resource`: optional later-phase entity for conflict-aware booking.

### Financial ledger

- `invoice/order`: what the family owes and why.
- `invoice line`: registration fee, add-on, discount, credit/aid, tax, fee, or manual adjustment.
- `payment intent/payment`: collection attempt and settled processor result.
- `offline payment`: recorded tender with method, received date, recorder, and evidence; never masquerades as a processor charge.
- `refund`: independent lifecycle and amount linked to a payment/invoice.
- `dispute`: processor case, amount, reason, due date, evidence state, and outcome.
- `payout/deposit`: processor-to-bank transfer and its reconciliation lines.
- `ledger event`: append-only money movement used to reproduce balances and reports.

### Communication and evidence

- `message`: immutable sender, resolved recipient scope, content reference, channel, policy decision, and lifecycle.
- `delivery attempt`: provider response, retry state, and correlation ID.
- `document/waiver`: storage reference, version, availability scope, signer, and retention state.
- `audit event`: actor, tenant, action, target, before/after summary, reason, request/idempotency key, outcome, and correlation ID.

## Independent state machines

Do not derive one lifecycle from another.

| Domain | Example states |
| --- | --- |
| Registration | draft/incomplete, submitted, pending review, accepted, waitlisted, canceled, inactive |
| Roster membership | proposed, active, removed |
| Invoice | draft, open, partially paid, paid, past due, void |
| Payment | requires action, processing, succeeded, failed, canceled |
| Refund | requested, pending, succeeded, failed, canceled |
| Dispute | warning/needs response, under review, won, lost, withdrawn |
| Payout | pending, in transit, paid, failed, canceled |
| Event | draft, in review, published, archived |
| Invite | pending, accepted, expired, revoked |
| Message delivery | queued, sent, delivered, failed, suppressed, recalled |

A payment success must not automatically mean registration acceptance, roster assignment, or bank deposit. A refund must not erase the original payment. A dispute must not be represented as a refund. A bank payout must reconcile to its contributing charges, refunds, fees, adjustments, and disputes.

## Required information architecture

### 1. Dashboard

UI components:

- scope selector for organization/program/season/team and date range;
- cards for collected revenue by currency, outstanding balance, failed payments, upcoming installments, registration funnel, roster capacity, and next events;
- cards are links into already-filtered detail views;
- alerts for failed payouts, unresolved disputes, aged pending payments, expiring waivers, and delivery failures;
- recent activity sourced from the canonical audit API.

Rules:

- every total shows scope, period, currency, and last refresh;
- no fabricated percentage deltas;
- an unavailable metric says why rather than showing zero.

### 2. People and households

UI components:

- search/filterable member table;
- household/person detail drawer;
- guardian/player relationship panel;
- registration, team, billing, document, and communication timelines;
- explicit access/consent indicators;
- merge/conflict resolution as an audited server workflow.

### 3. Programs, seasons, teams, and rosters

UI components:

- program/season cards and dense table view;
- roster table with stable-ID selection;
- preview-before-commit bulk assignment;
- unassigned, waitlisted, ineligible, and conflict views;
- capacity and eligibility indicators;
- CSV import as upload → parse → validate → preview → idempotent commit → result report.

### 4. Scheduling

UI components:

- agenda, calendar, and table views;
- organization/program/team/facility filters;
- recurring-event builder and occurrence exceptions;
- timezone and location fields;
- draft/review/published/archived state;
- conflicts, RSVP/attendance, notification impact, and change summary before save.

### 5. Registration

UI components:

- form/version list with draft/live/retired state;
- builder with participant, guardian, eligibility, waiver, document, fee, discount, and consent field types;
- preview/test mode;
- capacity/waitlist policy;
- incomplete/submitted/accepted/waitlisted/canceled views;
- entry detail containing form snapshot, current person link, invoice, payment, documents, and audit timeline.

### 6. Financials

Primary tabs:

1. Overview
2. Invoices/orders
3. Outstanding
4. Transactions
5. Payment plans
6. Refunds
7. Disputes
8. Deposits/payouts
9. Reconciliation

Essential components:

- currency-safe KPI cards;
- filter bar with date type, status, program/season/team, payment type, processor, and amount;
- server-paginated tables with saved views, column chooser, and export jobs;
- invoice detail with lines, adjustments, schedule, payments, refunds, balance, reminders, notes, and ledger timeline;
- refund dialog showing maximum amount, method, fee/balance consequences, mandatory reason, confirmation, and idempotent submission;
- offline-payment dialog with method, amount, received date, reference, attachment/evidence, and reason;
- dispute detail with amount, deadline, reason, evidence status, processor link, and impact;
- payout detail tying gross transactions, refunds, fees, adjustments, disputes, and net bank deposit;
- period close/reopen control with impact preview, reason, elevated permission, and audit record.

### 7. Communications

UI components:

- audience builder that resolves exact recipient count before send;
- organization/program/team/household scope;
- email/text/push/in-app channel eligibility;
- consent and suppression preview;
- subject/body/attachment composer;
- send-now/schedule choice;
- idempotent send, delivery progress, retry/failure detail, and safe recall/delete semantics;
- youth-safety and direct-message policy state.

### 8. Documents and compliance

UI components:

- document metadata table, not just image cards;
- category, version, availability scope, retention, signer/completion, and expiry;
- secure upload/download handoff;
- waiver version history;
- missing/expiring document reports.

### 9. Staff, access, and audit

UI components:

- staff directory and pending/expired/revoked invitations;
- capability matrix by organization/program/team scope;
- owner-transfer protections;
- recent access changes;
- append-only audit table with actor, action, target, reason, outcome, correlation ID, and time;
- support-safe detail without secrets or unnecessary youth data.

## Cross-cutting table and form standard

Every production data table needs:

- a declared stable row ID;
- scoped query parameters mirrored in the URL or saved view;
- sortable columns whose displayed state matches the applied query;
- debounced search with a clear button;
- filter chips and a “clear all” action;
- explicit loading, empty, no-results, permission-denied, recoverable-error, and unavailable states;
- cursor/server pagination for unbounded records;
- selection that survives sorting/pagination only when intentionally supported;
- bulk-action count and impact preview;
- column chooser and export of the declared scope;
- row actions with names, permission state, pending state, and double-submit prevention;
- responsive mobile representation that preserves headers as labels.

Every mutation form needs:

- explicit labels and described validation;
- backend validation parity;
- pending/success/error state;
- retry behavior that does not duplicate the operation;
- dirty-change protection;
- a reason for destructive/financial changes;
- confirmation that describes consequences;
- a request/correlation ID in support-safe errors.

## Security, privacy, and financial integrity

### Youth privacy

The FTC says COPPA can apply to child-directed services and general-audience services with actual knowledge that they collect personal information from children under 13. Covered operators may need a clear privacy policy, direct parental notice, verifiable parental consent, parental review/deletion rights, security controls, and purpose-limited retention. See [FTC COPPA FAQs](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions) and the [FTC six-step compliance plan](https://www.ftc.gov/business-guidance/resources/childrens-online-privacy-protection-rule-six-step-compliance-plan-your-business). Product implications:

- prefer guardian-operated accounts for youth;
- collect the minimum necessary youth data;
- keep consent/version evidence;
- support access/deletion/retention workflows;
- do not expose youth contact or document data in broad exports or logs;
- review the exact HuddleWay audience and data flows with qualified counsel before launch.

### Payment data

PCI DSS applies to environments that store, process, or transmit payment account data and establishes technical and operational controls for protecting it: [PCI Security Standards Council](https://www.pcisecuritystandards.org/standards/). Product implications:

- use processor-hosted/approved collection surfaces;
- never collect card or bank numbers in arbitrary registration fields;
- store processor tokens and safe metadata, not raw payment credentials;
- keep secret keys and privileged payment operations off the static client.

### Webhooks and reconciliation

Stripe requires signature verification over the raw request body, does not guarantee event order, retries deliveries, and recommends returning `2xx` quickly before complex work: [Stripe webhook documentation](https://docs.stripe.com/webhooks?lang=node). Stripe also exposes distinct webhook lifecycles for [disputes](https://docs.stripe.com/disputes/responding) and [connected-account payouts](https://docs.stripe.com/connect/payouts-connected-accounts). Product implications:

- verify signatures and reject stale/replayed deliveries;
- store provider event IDs and process idempotently;
- tolerate duplicate and out-of-order events;
- fetch current processor objects when required;
- project refunds, disputes, and payouts independently;
- expose reconciliation/diagnostic state without leaking secrets.

## HuddleWay implementation alignment

This is a design-to-source cross-reference, not final release acceptance.

### Established foundations

- The canonical tenant and CRM schema-v1 contracts are documented in `docs/CRM_BACKEND_CONTRACT_ALIGNMENT.md`.
- The authoritative backend already contains tenant roles, registration and team data, direct-invoice contracts, financial projection collections, roster preview/commit operations, export contracts, Stripe operations, and CRM audit primitives.
- The static Svelte/Astro CRM is correctly treated as an untrusted client; financial and backend-owned collections are not meant to be mutated directly.
- Integer minor units and independent invoice/payment/refund/deposit concepts are established.

### Required before production

- Finish moving every privileged read/write behind tenant- and capability-authorized backend projections.
- Qualify invitations, roster import/assignment, communication, refunds, processor projections, exports, and activity/audit end to end.
- Provide complete invoice/outstanding/refund/dispute/payout/reconciliation UI, or explicitly remove/disable unsupported claims and controls.
- Align direct browser queries with the authoritative Firestore rules; never “fix” a denied backend-owned collection by weakening its rule.
- Replace swallowed errors and misleading empty states with actionable states.
- Complete the live control matrix for success, validation, denial, provider/network failure, double submit, refresh persistence, and tenant isolation.
- Keep true installment/payment-plan claims out of release copy until the backend and client ship the lifecycle; a recurring subscription plan is not automatically an installment invoice plan.

## Product sequencing recommendation

### Production floor

- organization/tenant setup and staff roles;
- people/guardian/participant identity;
- programs/seasons/teams/events;
- registration and roster workflows;
- invoices, transactions, outstanding balances, refunds, processor reconciliation, payouts/deposits, and CSV export;
- targeted announcements and delivery status;
- documents/waivers;
- audit/activity;
- responsive and accessible administrator UI;
- backup, restore, monitoring, support correlation IDs, and release provenance.

### Next capability tier

- configurable installment plans and autopay;
- scholarships/aid, credits, discounts, and offline tender evidence;
- dispute response workflow;
- period closing and controlled reopen;
- saved/scheduled reports;
- attendance, retention, and abandoned-registration analytics;
- facility/resource scheduling.

### Later differentiation

- advanced evaluations and athlete-development reporting;
- predictive collections/retention insights with privacy review;
- richer mobile administration;
- accounting integrations;
- tournament/bracket and official-assignment tooling.

## Go/no-go product criterion

The CRM is product-complete for launch only when an authorized admin can follow each retained workflow from UI intent to authoritative persisted result, see the correct result after refresh, receive a safe and actionable failure state, and find an audit/correlation record—while a user in another tenant or insufficient role is denied. Static presence, a clickable handler, or an optimistic success message is not sufficient evidence.
