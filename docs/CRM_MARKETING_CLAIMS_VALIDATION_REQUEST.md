# CRM Marketing Claim Validation Request

Status: prepared for the required cross-project claims-liaison review
Prepared: 2026-07-26
Website source: `src/data/site.ts`

This request follows
`.github/cross-project/CLAIM_VALIDATION_REQUEST_TEMPLATE.md`. It deliberately
groups repeated wording by the literal product behavior a visitor would infer.
The website must not be published with an unsupported or unclear claim.

## HW-CLAIM-001 — Admin application launch status

To: medgar-evers-claims-liaison (HuddleWay app project)

Claim ID: HW-CLAIM-001
Page or section: Home, HuddleWay Admin animation
Exact website wording: “The Admin app is ready for launch!”

Validation question:

- Is the currently linked HuddleWay Admin App Store build approved, available
  to the intended audience, backed by the same production services represented
  on this site, and cleared by the CRM release audit?

Why this matters:

- A visitor would reasonably believe the admin product is production-ready
  today, not merely present in App Store Connect or available as a test build.

Requested response:

- Verdict: supported | supported with qualification | unsupported | unclear
- Evidence: App Store status/version plus code, test, and release references
- Safe wording: approved website wording
- Do not claim: wording that would overstate the product
- Follow-up needed: none or the exact app/release owner

## HW-CLAIM-002 — One-app operational scope

To: medgar-evers-claims-liaison (HuddleWay app project)

Claim ID: HW-CLAIM-002
Page or section: Home, Features, Savings, and Setup FAQ
Exact website wording examples:

- “Administrators can manage schedules, registration, payments, and updates
  inside the branded app they run for the program.”
- “Run registration, payments, schedules, and updates inside one branded
  program app.”
- “Give people one place for schedules, payments, updates, and next steps.”

Validation question:

- For each admin and family surface, which schedule, registration, payment,
  messaging/update, roster, document, and branding workflows are complete,
  mutually consistent, and available in the currently shipped builds?

Why this matters:

- A visitor would believe no separate operational tool or manual handoff is
  required for the named workflows.

Requested response:

- Verdict: supported | supported with qualification | unsupported | unclear
- Evidence: code, route, schema, test, and shipped-build references per workflow
- Safe wording: approved website wording
- Do not claim: unsupported “all-in-one” or cross-surface equivalence
- Follow-up needed: none or the exact app owner

## HW-CLAIM-003 — Direct payment destination and fee

To: medgar-evers-claims-liaison (HuddleWay app project)

Claim ID: HW-CLAIM-003
Page or section: Home, Savings, and Setup FAQ
Exact website wording examples:

- “Families and clients pay your program directly. HuddleWay adds only up to a
  $1 platform fee per transaction. Standard card rates apply.”
- “Customers pay your youth program directly. HuddleWay adds up to a $1
  platform fee per transaction, plus standard card fees. This is not a 30%
  app-store revenue-share model.”
- “Creating and administering a program is free.”
- “Connecting Stripe is optional and only needed if the program chooses to
  collect payments.”

Validation question:

- Confirm that administrator account creation, organization bootstrap, and
  ongoing organization administration have no activation charge, subscription
  gate, or required payment method. Prove the maximum platform-fee calculation
  for every supported currency,
  transaction type, partial capture/refund, connected-account configuration,
  and registration path; identify who is merchant of record and when funds are
  available to the program; distinguish free administration from optional
  participant-payment processing, refunds, disputes, tax, and processor fees.

Why this matters:

- A visitor would understand these sentences as a pricing commitment and a
  statement about the legal and operational flow of funds.

Requested response:

- Verdict: supported | supported with qualification | unsupported | unclear
- Evidence: billing policy, Stripe configuration, tests, terms, and deployed
  environment references
- Safe wording: approved website wording including required qualifications
- Do not claim: unsupported cap, settlement timing, or “free” wording
- Follow-up needed: none or billing/legal owner

## HW-CLAIM-004 — Registration/payment continuity

To: medgar-evers-claims-liaison (HuddleWay app project)

Claim ID: HW-CLAIM-004
Page or section: Home, Features, Savings, and Setup FAQ
Exact website wording examples:

- “Help families and clients register, pay your program directly, and check
  schedules and updates in one clean app.”
- “Collect program payments without splitting the workflow across several
  tools.”
- “A shorter path from interest to paid registration.”

Validation question:

- Does every promoted registration type lead to a supported checkout or
  accurate offline-payment state, persist authoritative registration and
  invoice/payment state, recover after payment-provider uncertainty, and show
  the same result to administrators and families?

Why this matters:

- A visitor would believe the registration-to-payment workflow is end-to-end,
  recoverable, and does not require reconciliation in another system.

Requested response:

- Verdict: supported | supported with qualification | unsupported | unclear
- Evidence: registration, checkout, webhook, reconciliation, and UI tests
- Safe wording: approved website wording
- Do not claim: installments, aid/credits, universal checkout, or unsupported
  payment states
- Follow-up needed: none or registration/billing owner

## HW-CLAIM-005 — Multi-team/division support

To: medgar-evers-claims-liaison (HuddleWay app project)

Claim ID: HW-CLAIM-005
Page or section: Setup FAQ
Exact website wording: “Yes. HuddleWay works well for programs that need a
more consistent structure across teams, divisions, events, and family
information.”

Validation question:

- Confirm the canonical tenant/team/season/event/household relationships,
  authorization boundaries, cross-team reporting behavior, and any unsupported
  “division” or household concept.

Why this matters:

- A visitor would believe division and family/household structures are explicit
  product concepts rather than labels inferred from teams and participants.

Requested response:

- Verdict: supported | supported with qualification | unsupported | unclear
- Evidence: schema, rules, service, and tenant-isolation tests
- Safe wording: approved website wording
- Do not claim: unsupported hierarchy, household deduplication, or roll-up
  reporting
- Follow-up needed: none or data/architecture owner

## HW-CLAIM-006 — Low-effort readiness

To: medgar-evers-claims-liaison (HuddleWay app project)

Claim ID: HW-CLAIM-006
Page or section: Setup FAQ
Exact website wording examples:

- “Keep it simple: create the account, add your logo and program details, set
  the registration and payment flow, then review what families will see before
  you share it.”
- “No. HuddleWay is meant to feel straightforward for everyday program
  teams.”

Validation question:

- What mandatory setup, identity, payment-provider onboarding, domain/email
  verification, App Check/provider registration, data import, policy, review,
  and support work is actually required before an organization can invite
  families?

Why this matters:

- A visitor would believe launch requires only the steps named in the copy and
  no technical or operational assistance.

Requested response:

- Verdict: supported | supported with qualification | unsupported | unclear
- Evidence: onboarding state machine, environment requirements, UI, runbook,
  and shipped-build tests
- Safe wording: approved website wording
- Do not claim: self-service or launch simplicity beyond proven behavior
- Follow-up needed: none or onboarding/release owner

## Local evidence already known

- The Svelte CRM and authoritative backend support invoices, offline payments,
  refunds, dispute/deposit projections, registration, schedules, roster,
  messaging, and tenant branding in varying degrees.
- Installment/autopay schedules, credits/financial aid, financial-period close,
  complete audited server boundaries, and provider attestation are not all
  release-approved. Financial-period close/reopen is now implemented locally,
  but still awaits the final release audit.
- The family App Store link is explicitly marked “coming soon.”
- The CRM release feature script currently records a production NO-GO.

Those facts are context only. They are not a substitute for the required
app-side liaison verdict.

## Conservative remediation applied while review is pending

On 2026-07-26 the website removed the statements “The Admin app is ready for
launch,” the unqualified “up to a $1” public pricing promise, the 30% App Store
comparison, and the blanket assertion that divisions and households are
standalone product concepts. The product owner then made administrator account
creation, organization setup, and administration explicitly free. The
authoritative applications now route administrators directly into setup,
historical activation-payment routes redirect to free setup, and the backend
returns `410 program_activation_billing_retired` before any Stripe call for a
legacy activation request. The CRM release remains NO-GO for unrelated release
gates, and the deployed participant-payment pricing/provider configuration has
not been attested in this release evidence.

Current copy instead:

- labels payment behavior as a supported, configured Stripe connected-account
  flow;
- states precisely that creating and administering a program is free, while
  optional participant-payment processing can have platform/processor fees and
  configured payout/refund/dispute terms;
- describes the canonical team/season/event/registration/roster model while
  explicitly qualifying division, household, and cross-team reporting needs;
- describes the Admin experience without claiming the release is launch-ready.

This reduces claim risk but does not close REL-006. The app-side liaison must
still validate every retained capability statement and the App Store link
against an accepted build.
