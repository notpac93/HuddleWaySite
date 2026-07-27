# CRM Financial Launch Scope

Decision date: 2026-07-26
Decision status: accepted implementation boundary for this release
Canonical backend: `/Users/kennygrimblejr./HuddleWay`

## Decision

HuddleWay ships a one-time, invoice-led collection and reconciliation surface
for youth sports programs. It does not ship a configurable installment,
autopay, credit, scholarship, or financial-aid ledger in this release.

This is a product-scope decision, not a hidden placeholder. The CRM names the
boundary in the Financials UI, removes unsupported controls, and does not map
the existing recurring subscription concepts to invoice installments.

## Shipped administrator workflows

- One-time participant card checkout and independent paid, processing, failed,
  and disputed transaction projections.
- Direct-invoice draft detail with line items, integer minor units, discount,
  tax, authoritative total, due date, issue, reminder, void, and ledger.
- Audited offline settlement of the full authoritative invoice balance with
  tender method, receipt/reference, received timestamp, operator note, and
  stable idempotency. Partial offline settlement is not claimed.
- Partial or full processor refunds up to the authoritative refundable
  balance, without erasing the original payment or closing a dispute.
- Read-only processor dispute state.
- Deposit/payout status and gross/fee/net reconciliation to contributing
  transactions. Payment success is never presented as bank settlement.
- Owner-scoped exports, bounded projection notices, currency separation, and
  closed financial-period preview/close/reopen controls.
- Signed webhook retry, duplicate suppression, reconciliation, request
  correlation, and append-only audit evidence in the authoritative backend.

## Explicitly excluded from launch

- Configurable invoice installments, split-pay schedules, and installment
  autopay.
- Scholarships, financial-aid adjustments, and a general credit balance.
- ACH-specific administrator promises or a pending-ACH workflow. Registration
  checkout is qualified as a one-time card path for this release.
- Partial offline payments.
- Browser-authored processor state, payout state, dispute outcomes, or manual
  ledger adjustments.
- A dispute evidence/response workflow. The CRM displays authoritative
  processor state only.

The excluded capabilities remain useful competitive roadmap items identified
in `YOUTH_SPORTS_CRM_PRODUCT_RESEARCH.md`. They require independent backend
state machines, authorization, reconciliation, audit, UI, and adverse-path
qualification before any future claim or control is added.

## Release acceptance

FIN-002 is accepted against the shipped scope above. TST-003 must cover every
included lifecycle and must assert the exclusions remain truthful. It must not
manufacture passing evidence for unshipped installments, aid/credits, or ACH.

Production-provider behavior, live alerting, clean revision provenance, and
independent release acceptance remain separate gates.
