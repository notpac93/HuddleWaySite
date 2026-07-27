# CRM user-facing language audit

Audit date: 2026-07-26
Scope: all 40 release-tree Svelte CRM components, authentication/access stores, backend client errors, onboarding, financial projections, and public setup claims
Result: owner implementation evidence complete for UI-005; independent release acceptance remains open.

## Language rules

- Do not display caught exception text, provider payloads, stack traces, tokens, email existence, or raw authorization details.
- A recoverable failure says what failed and what the administrator can do next. A backend request ID may be shown as a support-safe correlation value.
- Permission denial is different from connectivity failure, empty data, no search results, unsupported data, and a deliberately unavailable feature.
- Destructive or privileged changes explain impact, require a bounded audit reason, lock controls while running, and use explicit confirmation for high-impact actions.
- Financial language names the actual state: processor payment, direct invoice, refund, dispute, deposit/payout, reconciliation, and closed period. It never calls a payment a generic “sale” or treats a pending/failed payment as revenue.
- Program account creation and administration are free. Stripe is optional and is discussed only as the program’s participant-payment processor.

## Reviewed outcomes

| Area | Retained language contract |
|---|---|
| Login and first-run setup | “Create free admin account,” email verification, free program setup, no activation fee, no payment method, and optional Stripe are visible before and during onboarding. A verified administrator without a tenant enters setup instead of a payment gate. |
| Access and tenant scope | Missing access says it could not be verified; unsupported role and viewer read-only boundaries are explicit. Owner-only financial, staff, and activity controls are not represented as ordinary editable actions. |
| Loading, empty, and no-results | Components distinguish “loading,” “no records yet,” and “no records match these filters.” A failed or denied read never renders as a trustworthy empty list. |
| Projection limits | Limited tables, searches, recent records, previews, and totals say “loaded projection,” give the bound when available, and avoid “all,” “total,” or chronological claims when incomplete. |
| Financial records | Revenue means successful payments only. Amounts use integer minor units and explicit currency. Mixed/invalid/incomplete totals are unavailable. Refundable balance, offline settlement, dispute display, payout reconciliation, and period close/reopen have distinct descriptions. |
| Excluded finance scope | Configurable installments, autopay, scholarships, aid/credits, ACH-specific administration, partial offline payments, and dispute evidence submission are explicitly not shipped; the UI does not tease or simulate them. |
| Destructive actions | Event unpublish/delete, season/event unlink, invoice void, refunds, offline settlement, period close/reopen, staff access changes, invite revocation, and document/message changes state the effect and retain typed confirmation where the risk warrants it. |
| Backend failures | Generic network/provider failures use a safe fallback. Validated `BackendApiError` messages may be shown with their request ID; unknown exceptions are never interpolated or logged as objects. |
| Malformed data | Missing names/dates/statuses use “unavailable” or “unsupported,” not invented fallback facts. Identifier-less rows are omitted with a count because they cannot be safely selected or mutated. |
| Exports | Buttons name the actual filtered/selected loaded scope. Unsupported exports are absent or disabled with the reason; no browser CSV is described as a complete system export. |

## Free-admin cross-check

The following release surfaces now state the same boundary:

- Public marketing/setup copy in `src/data/site.ts`
- `/admin` login and account creation
- verified no-tenant routing in `CrmApp.svelte`
- the first setup step and optional payments step in `SetupWorkflow.svelte`
- terms/setup FAQ content
- native Flutter login, setup intro, and program-creation routing in `/Users/kennygrimblejr./HuddleWay`
- backend bootstrap and retired activation endpoints in `/Users/kennygrimblejr./HuddleWay/backend`

Free administration does not mean free participant payment processing. Processor/platform fees, payout timing, supported payment methods, refunds, and disputes remain subject to the program’s approved configuration.

## Verification

- `tests/unit/free-admin-onboarding.test.ts`
- `tests/unit/crm-marketing-claims.test.ts`
- `tests/unit/p0-source-regressions.test.ts`
- `tests/unit/crm-release-language.test.ts`
- login, viewer/access, setup-workflow, financial, staff, event, season, roster, document, message, media, and activity component suites
- desktop/mobile setup and authenticated CRM Playwright flows
