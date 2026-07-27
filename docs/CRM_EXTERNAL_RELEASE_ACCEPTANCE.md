# CRM External Release Acceptance

Status: fail-closed pre-deployment evidence contract
Owner: release engineering
Target: `porkbun-huddleway-static`

The deterministic CRM release manifest proves source, backend, environment,
toolchain, and static-artifact provenance. It does not prove that a provider
alert reached an operator, a real device passed App Check, a real
non-production bucket restored, or authenticated synthetic-canary performance
met its budget.

`scripts/release/crm-external-evidence.mjs` closes that release-system gap. It
accepts one private JSON evidence document, binds it to the exact website
commit, backend commit, environment, and artifact SHA-256, rejects stale or
incomplete gates, and emits a redacted checksum-protected acceptance receipt.
The private document is never included in the release artifact. Protected CI
then creates one deterministic accepted archive and signs its provenance with
GitHub's Sigstore-backed artifact-attestation service. The checksum detects
content changes; the provider signature proves which protected workflow issued
the archive.

Passing this validator authorizes a protected deployment window. It is not
evidence that deployment occurred. REL-008 still requires the accepted
artifact to be published, production routes to be verified, and rollback
readiness to be recorded.

## Privacy and custody

- Keep the evidence JSON outside the repository.
- Store it as the protected
  `CRM_EXTERNAL_RELEASE_EVIDENCE_JSON` environment secret.
- Put only opaque receipt/query/run IDs in it. Do not include customer names,
  email addresses, tenant IDs, provider payloads, tokens, credentials,
  screenshots, or private URLs.
- Review the file, then record its exact SHA-256. The workflow refuses any
  file whose bytes differ from that approved hash.
- The generated `.release/crm-production-acceptance.json` is intentionally
  redacted and may travel with the accepted artifact.

## Required gates

### Release binding

The evidence must name:

- one safe release ID;
- `production-candidate`;
- the full reviewed HuddleWaySite commit;
- the full reviewed HuddleWay backend commit;
- the deterministic CRM artifact SHA-256 from the candidate workflow.

Every value must equal the generated release manifest.

### Backup and recovery

Evidence must be no older than 26 hours and must contain:

- the encrypted artifact and schema-v3 bundle SHA-256 values;
- an explicitly named non-production Firebase project;
- at least one Firestore document restored and read back;
- at least one Storage object and byte restored and read back;
- zero Firestore documents and Storage objects after rollback;
- RTO no more than 240 minutes and RPO no more than 24 hours;
- one explicit owner/operator approval.

The production project `sports-team-apps` is always rejected as a rehearsal
target. The approved rehearsal target is `huddleway-dev`; conventionally named
stage, UAT, QA, recovery, drill, and non-production projects remain eligible.

### Monitoring and operations

Evidence must be no older than 30 days and must prove provider saved queries
for exactly:

- `backup-freshness`;
- `cross-tenant-denial-regression`;
- `migration-failure`;
- `webhook-failure-rate`;
- `webhook-reconciliation-backlog`.

It must also prove routed receipts for backend health, backup freshness,
webhook failure, and reconciliation backlog, plus a support-safe correlation
lookup and owner acknowledgement.

### App Check

Evidence must be no older than seven days, cover at least 24 hours of monitor
telemetry, and include at least two successful supported-device runs for each
approved release surface:

- web with reCAPTCHA Enterprise;
- Android with Play Integrity.

The current release surfaces are exactly `android` and `web`. iOS remains
deferred and must not be implied by the acceptance receipt. A later iOS release
requires its own supported-device App Attest or approved DeviceCheck evidence
and a reviewed governance-contract change.

The non-interactive caller inventory and correlated denial UX must be
accepted. Monitor mode requires enforcement to remain disabled. Enforce mode
is valid only when enforcement is both explicitly approved and enabled.

### Field performance, CDN, edge, and media

Evidence must be no older than seven days, use an authenticated HTTPS staging
or production origin, and contain no customer payloads.

Because customer traffic is unavailable before launch, the performance
evidence must explicitly identify itself as
`authenticated-synthetic-canary`, set `customerActivityClaimed` to `false`,
and use only the approved non-customer fixture identity. The observation
window must cover at least 24 hours with at least 75 desktop and 75 mobile
samples. Both classes must meet:

- p75 LCP at or below 2,500 ms;
- p75 INP at or below 200 ms;
- p75 CLS at or below 0.1.

At least 20 authenticated edge samples per class must show desktop p75 at or
below 1,000 ms and mobile p75 at or below 1,500 ms. At least three
fingerprinted assets must prove Brotli, gzip, immutable caching, and a warm
cache hit.

Fixture-only media evidence must prove at least three responsive widths, AVIF
or WebP output, immutable caching, and isolation between source objects and
derived objects.

Use an approved synthetic image in a non-customer tenant. After the existing
Firebase Function has produced its generation-bound variants, prepare a
private descriptor with this exact shape:

```json
{
  "schemaVersion": 1,
  "evidenceId": "media-fixture-YYYYMMDD",
  "sourceGeneration": "FIREBASE_STORAGE_GENERATION",
  "sourceUrl": "PRIVATE_FIREBASE_DOWNLOAD_URL",
  "derivativeUrls": [
    "PRIVATE_SMALL_DOWNLOAD_URL",
    "PRIVATE_MEDIUM_DOWNLOAD_URL",
    "PRIVATE_LARGE_DOWNLOAD_URL"
  ]
}
```

The download URLs contain access tokens and must remain in a protected,
permission-restricted file. Probe the fixture with:

```sh
npm run release:evidence:probe-media -- \
  --input /approved/private/media-fixture.json \
  --out /approved/private/media-fixture-receipt.json \
  --website-commit REVIEWED_40_CHARACTER_SITE_SHA \
  --backend-commit REVIEWED_40_CHARACTER_BACKEND_SHA
```

The probe accepts only Firebase Storage HTTPS media URLs, fetches the real
source and derivative bytes, binds the receipt to both reviewed revisions, and
fails unless it observes the exact source
generation, separate `/uploads/` and `/optimized/` paths, derivative
source-path metadata, three distinct measured WebP widths, public one-year
`immutable` caching, unique variant names and bytes, no cookies, and bounded
object sizes. Its receipt contains only hashes, measurements, cache policy,
and the exact `performanceMedia` object to place under `performance.media`;
it never retains or prints a download URL or token. Retain the full checksummed
receipt privately for REL-007 and remove the token-bearing descriptor when the
approved evidence-retention procedure permits. This collector is a proof
mechanism, not authority to create a fixture, deploy Functions, or touch
production/customer media.

For protected collection, configure `CRM_MEDIA_FIXTURE_JSON` only in the
required-reviewer `crm-production-observation` environment and dispatch
`.github/workflows/crm-media-evidence.yml` from the exact reviewed website
commit with both full commit SHAs. The workflow checks out and verifies both
revisions, runs the complete Functions contract suite, materializes the
descriptor with mode `0600`, deletes it even on failure, signs the redacted
receipt with GitHub artifact attestation, and uploads only that receipt and
attestation bundle. A pull request can exercise the collector contract but
cannot access or run the protected fixture collection job.

### Single-developer governance and deployment approval

This repository is operated by one developer. The private evidence must state
that governance mode is `single-developer`, identify the owner, name the
approved release surfaces as exactly `android` and `web`, require the automated
acceptance workflow, and require a separate final production confirmation.
These declarations make the reduced separation of duties explicit instead of
inventing unavailable reviewers.

Deployment approval requires:

- the identified owner as an explicit approver;
- target `porkbun-huddleway-static`;
- the exact current `porkbun-huddleway-static` commit as the rollback release
  ID and the aggregate SHA-256 of every file in that clean checkout as the
  rollback artifact;
- an unexpired window no longer than 24 hours.

Passing automated acceptance does not authorize production deployment. The
owner must give a new explicit production confirmation after reviewing the
redacted accepted receipt and before dispatching REL-008.

## Acceptance procedure

1. Run the ordinary deterministic candidate workflow for reviewed website and
   backend commits.
2. Exercise every external gate against that candidate using fixture or
   aggregate evidence only.
3. Prepare the private JSON with the exact schema pinned by
   `tests/unit/crm-external-release-evidence.test.ts`.
4. Calculate the exact byte hash:

   ```sh
   shasum -a 256 /approved/private/crm-external-release-evidence.json
   ```

5. Dispatch the acceptance workflow from the exact `website_ref`; the workflow
   rejects a different workflow-source commit so the attestation source digest
   cannot drift from the accepted source.
6. Put the JSON in the protected environment secret and keep
   `crm-production-acceptance` environment protection enabled. A second human
   reviewer is not invented for this single-developer project; the automated
   validator and the owner's separate final production confirmation are the
   required controls.
7. Dispatch `.github/workflows/crm-production-acceptance.yml` with the exact
   website SHA, backend SHA, and evidence SHA-256.
8. Confirm the workflow publishes only:

   - `.release/crm-production-accepted.tar.gz`;
   - its SHA-256 file and Sigstore attestation bundle;
   - `.release/crm-release-manifest.json`;
   - `.release/crm-production-acceptance.json`.

9. Verify the downloaded archive before extraction:

   ```sh
   sha256sum -c crm-production-accepted.tar.gz.sha256
   gh attestation verify crm-production-accepted.tar.gz \
     --repo notpac93/HuddleWaySite
   ```

10. Give that exact accepted archive and both redacted receipts to the REL-008
    deployment owner. Never rebuild or substitute files during deployment.
11. Follow `docs/CRM_PRODUCTION_DEPLOYMENT.md`. Its protected workflow verifies
    the exact signer, source commit, rollback tree, live artifact bytes, CDN
    behavior, and backend health, and automatically restores the accepted
    rollback tree when post-deploy verification fails.

For an operator-side rehearsal of the validator:

```sh
npm run release:acceptance -- \
  --evidence /approved/private/crm-external-release-evidence.json \
  --expected-sha256 APPROVED_64_CHARACTER_SHA256

npm run release:acceptance:verify -- \
  --expected-sha256 APPROVED_64_CHARACTER_SHA256
```

Both commands fail closed when the private file, receipt, release manifest, or
artifact binding changes.
