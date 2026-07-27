# HuddleWay release claims validation

Validation date: 2026-07-26
Website source: `src/data/site.ts` plus rendered marketing/setup/terms pages
Application authority: `/Users/kennygrimblejr./HuddleWay`
Result: REL-006 owner evidence complete; independent release acceptance remains open.

## Method

Every public product or financial capability was grouped into a release claim and traced to the authoritative app, backend route/contract, and local release evidence. Product-positioning language is kept separate from customer outcomes. A claim is:

- **Accepted** when a reachable released/buildable surface and authoritative contract exist.
- **Qualified** when availability depends on tenant configuration, program agreement, app release, processor state, or assisted launch work.
- **Excluded** when the current release deliberately has no canonical state or UI.
- **Removed** when it implied an outcome or capability the source could not prove.

The website does not use competitor capabilities as evidence that HuddleWay ships them.

## Claim matrix

| Public claim | Verdict | Authoritative evidence and safe boundary |
|---|---|---|
| Administrator account creation, program creation, and administration are free | Accepted | Web and native account creation use Firebase Auth and email verification; verified users without tenant access enter Program Creator/free bootstrap. Backend `POST /admin/onboarding/bootstrap` creates the program without an activation entitlement. Legacy activation routes return `410 program_activation_billing_retired`. Stripe is not called by free setup. |
| A program can use its name, logo, and colors | Accepted | Native Program Creator and Team Setup provide logo/palette workflows; branding repository/backend resource mutations persist tenant-scoped branding; consumer public-tenant/app-shell sources render it. Installed launcher-icon changes remain a later binary-release workflow and are not described as immediate. |
| Programs can present pages, dates, fees, age groups, locations, and next steps | Accepted/qualified | Page Studio, page bundles, tenant branding, seasons/events, registration-form pricing, and consumer program views exist. Copy says “supported/configured” because exact page modules and release approval vary by tenant/app version. |
| Families can use supported registration workflows | Accepted/qualified | Canonical registration forms, events, registration snapshots, checkout preparation, participant display projection, and consumer registration screens exist. Capacity, household hierarchy, waivers, and every field type are not claimed as universal. |
| Eligible participant payments use the program’s configured Stripe connected account | Accepted/qualified | Backend Stripe Connect status/account-link and checkout routes, signed webhooks, canonical payment/refund/dispute/deposit projections, and consumer checkout contracts exist. Copy consistently qualifies pricing, processor fees, payout timing, payment methods, agreement, and configuration. |
| Programs can manage schedules/events | Accepted | Backend event create/update/duplicate/series routes, tenant event projections, recurrence controls, and consumer schedule/event surfaces exist. The site does not claim facilities, brackets, standings, attendance, or automatic league scheduling. |
| Programs can publish announcements/updates | Accepted/qualified | Backend wall-message send/recall routes, sender/audience validation, delivery/audit behavior, admin composer, and consumer board surfaces exist. The site says in-app/configured feed and does not promise SMS, email, push, delivery, or retention outcomes universally. |
| Programs can manage teams, seasons, registrations, and rosters | Accepted | Tenant-scoped team/season/event/form routes and atomic roster preview/commit exist with stable IDs, role checks, audit, and readback. The FAQ explicitly says division hierarchy, households, and cross-team reporting are not universal standalone records. |
| Owners can review invoices, successful payments, refunds, disputes, deposits/payouts, reconciliation, and period locks | Accepted within launch scope | `docs/CRM_FINANCIAL_LAUNCH_SCOPE.md`, strict web client contracts, financial component suites, and authoritative backend integration tests pin these views/actions. Bank deposit is never inferred from payment success. |
| The platform replaces all other systems or keeps every step inside one UI | Removed | Stripe-hosted and other approved external steps may open. Absolute “without leaving,” “without bouncing,” and “without splitting across tools” language was replaced with “supported/configured flow” wording. |
| HuddleWay guarantees money back, retention, trust, or a quantified time saving | Removed | The old “Money back” phrase and causal/absolute outcome wording were removed. Retained text describes the product’s organization and intended workflow, not a guaranteed customer result. |
| Configurable installments/autopay, aid/scholarships/credits, ACH administration, partial offline payments, dispute evidence response, facilities, attendance, households, or division hierarchy | Excluded | These are competitor benchmarks or future model requirements, not shipped universal HuddleWay capabilities. The CRM and FAQ explicitly state the applicable exclusions. |

## Financial wording requirements

- “Revenue” means successful payment principal in one valid currency, not invoice face value, pending/failed payments, refunds, or bank payouts.
- Direct invoices, processor payments, refunds, disputes, and deposits are independent records/lifecycles.
- Money is represented in integer minor units with an explicit currency.
- Offline settlement is an audited record and does not pretend a processor charge occurred.
- Partial/full processor refunds are limited by the authoritative refundable balance.
- Payout/deposit views reconcile gross, fee, net, and contributing transactions; payment success is not called “deposited.”
- Incomplete/malformed/mixed-currency projections are unavailable instead of being totaled.

## Changes made by this validation

- Replaced “Less admin. Money back. A stronger brand.”
- Removed absolute claims that a participant never leaves the app or never crosses a hosted system boundary.
- Replaced unprovable retention/trust/time-saving outcomes with capability-specific, non-guaranteed wording.
- Replaced “live family experience” with the actual family preview boundary.
- Qualified checkout as an eligible/configured connected-account flow.
- Preserved the explicit free-admin versus non-free participant-processing distinction.

## Verification

- `tests/unit/crm-marketing-claims.test.ts`
- `tests/unit/free-admin-onboarding.test.ts`
- `tests/unit/crm-release-language.test.ts`
- `tests/unit/crm-financial-launch-scope.test.ts`
- authoritative backend route/security/financial suites
- native onboarding, branding, page-studio, public-tenant, registration, payment, message, schedule, and app-shell tests
- `docs/YOUTH_SPORTS_CRM_PRODUCT_RESEARCH.md`
