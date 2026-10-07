# Scoped iOS and operations portal evidence

The legacy `crm-external-evidence.mjs accept|verify` contract is unchanged. It
requires its original schema 1 Android/web scope. Do not insert invented Android
receipts or send a staged scoped receipt through a legacy production command.

The new explicit commands are `accept-preproduction`, `verify-preproduction`,
`accept-publication`, `verify-publication`, and `scoped-contract --phase
preproduction|publication`. They are local evidence validators, not deployments.
All scoped receipts state `productionPromotionAuthorized: false`; the complete
app/backend publication decision, current human authorization, and actual
deployment transaction remain separate requirements.

## Contract

Scoped evidence has schema 2 and exactly `validationScope`, `release`,
`backupRecovery`, `monitoring`, `performance`, `appCheck`, `governance`, and
`deploymentApproval`, in addition to `schemaVersion`. `validationScope` declares
version 1 and either `ios-portal-v1` / `preproduction` / `huddleway-dev`, or
`ios-portal-publication-v1` / `publication` / `sports-team-apps`. Required surfaces
are iOS and web, including both Consumer and Admin bundles. Android is excluded,
not passed or waived.

The `release` shape remains `releaseId`, `environment`, exact `websiteCommit`,
exact `backendCommit`, and `artifactSha256`. Stage uses `environment:
"stage-canary"` and the real generated `huddleway-crm-release.json`; its source,
canonical backend, project and Hosting site must match. Because that stage
manifest has no artifact checksum, `--artifact-report` must supply the ready
backend schema 2 artifact inventory, binding its actual CRM bundle checksum and
both source candidates. Publication instead requires the real production release
manifest plus the distinct schema 3 production artifact inventory. Rehashing or
relabeling a stage manifest does not satisfy those identities.

`backupRecovery`, `monitoring`, and `performance` retain the existing validators
and field shapes. This includes encrypted/checksummed non-production Firestore
**and Storage** restoration/readback/cleanup, recovery freshness (26 hours), RTO
at most four hours, RPO at most 24 hours, all monitoring queries/alerts, and:

- Authenticated synthetic observations over at least 24 hours, at least 75 each
  desktop/mobile observations, p75 LCP <=2500ms, INP <=200ms, CLS <=0.1.
- At least 20 edge observations per class, desktop <=1000ms and mobile <=1500ms.
- Compression/cache checks and at least three responsive media widths, with
  modern formats and source/derivative isolation.

No customer traffic is claimed. Stage observations must target exactly
`https://huddleway-crm-canary.web.app`; publication uses `https://huddleway.com`.
The latter is currently verified as the canonical serving origin only; that
does not establish its source, release version, or acceptance.

`appCheck` has `reportDigest`, `nonInteractiveCallerInventoryAccepted: true`,
and `correlatedDenialUxAccepted: true`. Supply the actual scoped monitor report
with `--app-check-report`. It must have a valid checksum, actual same-project
scope, report age <=24h, >=24h observation window, both exact iOS bundles with
App Attest and DeviceCheck configured, and web reCAPTCHA Enterprise. Required
consumer classes cannot be waived. Both Firebase and custom backend evidence
must be accepted, have >=99% verified requests, >=2 valid iOS and web runs and
zero unidentified valid requests. This does not claim DeviceCheck fallback was
exercised: native device case evidence remains separate.

Production Render needs an actual validated `render_service` monitor receipt;
stage `cloud_run_revision` telemetry is expressly rejected for publication.
The existing backend collector currently reads Cloud Run. Preparing this
publication contract does not create the missing Render evidence or certify
that a Render collector exists. Until that dependency is resolved, acceptance
must remain blocked.

## Authority and verification

`governance` uses the same explicit owner-authorized-independent-technical-review
model as the backend decision: `ownerAuthorization` has actual human `actorId`,
`actorType`, phase-specific `scope`, actual `reference`, and `evidenceDigest`;
`implementer` has `actorId` and truthful `actorType`; `independentReview` has a
different `actorId`, truthful `actorType`, actual `reference`, `evidenceDigest`,
and `subjectDigest`. Use the pure `scopedReviewSubject(evidence, observed)` helper
for the packet's subject, then have the independent reviewer review that exact
packet. The review document's own hash is excluded to prevent a circular digest.

The actual authority and technical-review files are mandatory. File hashes and
declared actors are checked; identity is not established cryptographically.
Operators must verify the original human message and actual independent review.
Never manufacture human signatures or label an agent as a human.

Stage `deploymentApproval` must be `null`. Publication requires the legacy
deployment approval shape, the actual owner in `approverIds`, an already-active
window of at most 24 hours, and immutable rollback release/hash. This external
receipt still cannot substitute for the full backend publication transaction.

Invoke the appropriate explicit command with these flags:

```text
--evidence /private/external.json
--manifest /private/actual-release-manifest.json
--artifact-report /private/actual-artifact-inventory.json
--app-check-report /private/actual-app-check-report.json
--owner-authorization /private/actual-owner-message.txt
--technical-review /private/actual-independent-review.txt
--expected-sha256 <SHA-256 of the exact external.json bytes>
--out /private/new-acceptance.json
```

For verification, replace `--out` with `--receipt`; retain all original evidence
inputs. Verification reruns current freshness, identity, authority and gate
checks. Accepted timestamps do not renew old observations. New receipts are
written exclusively with mode 0600 and cannot overwrite existing files. No
network request, deployment, provider mutation or permission grant is performed.

The production deploy scripts do not automatically consume scoped receipts.
The prepared publication procedure must explicitly run the new scoped verifier
and the complete backend publication decision before its separately authorized
deployment actions; the legacy production verifier continues to reject them.
