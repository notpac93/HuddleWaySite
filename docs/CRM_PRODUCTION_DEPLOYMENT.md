# CRM production deployment

Status: two production paths are available. The protected evidence path remains
available for regulated releases. The owner-operated path is available for this
single-owner product and is the standard path when no independent external
evidence service is configured.

Target branch: `porkbun-huddleway-static`

Production origin: `https://huddleway.com`

This runbook describes the REL-008 evidence path and the owner-operated
release path. Neither rebuilds, merges, or substitutes files during deployment.
Both promote an exact successful CRM release-gate artifact, require a known
rollback point, and verify the public site after the push.

## Single-owner production path

Use `.github/workflows/crm-owner-production-deploy.yml` when the repository
owner is the only release authority. This removes the unavailable private
`CRM_EXTERNAL_RELEASE_EVIDENCE_JSON` prerequisite; it does not remove the
technical release safeguards.

Dispatch it from `main` with:

- `website_ref`: the full SHA of the commit being released;
- `release_run_id`: the successful CRM release-gate run for exactly that SHA;
- `rollback_ref`: the current full `porkbun-huddleway-static` SHA; and
- `owner_confirmation`: `APPROVE_OWNER_PRODUCTION_DEPLOYMENT`.

The job checks that its own workflow source is the approved website commit,
downloads only the matching release-gate artifact, verifies the manifest and
the SHA-256 and size of every staged file, refuses to proceed if the static
branch changed after approval, and makes a normal fast-forward commit. It then
waits for the live `/admin/` page to serve the exact artifact and confirms the
production backend health endpoint. If that verification fails after the push,
it creates and pushes a normal Git revert only when the remote branch still
points to its deployment commit, then confirms the previous `/admin/` artifact
is back online. A redacted receipt is retained for 90 days.

This is intentionally an explicit, auditable owner decision; it is not an
automatic deployment from a source push.

## Required custody chain

The deployment owner needs all of the following before dispatch:

- a successful `crm-production-acceptance` run dispatched from the exact
  accepted website commit;
- the accepted website and backend full commit SHAs;
- the separately approved private evidence SHA-256;
- the accepted archive SHA-256;
- the current `porkbun-huddleway-static` full commit SHA;
- the current production static-tree aggregate SHA-256 recorded in the
  acceptance receipt as its rollback artifact.

The rollback values are not labels. Before preparing external evidence, use a
clean checkout of `porkbun-huddleway-static` and calculate its release-tree
identity:

```sh
git rev-parse HEAD
npm run release:deploy:inventory -- \
  --directory /absolute/path/to/clean/static-checkout
```

Set `deploymentApproval.rollbackReleaseId` to that exact 40-character commit
and `deploymentApproval.rollbackArtifactSha256` to the reported aggregate
digest. The acceptance window must have started and must still be open when
deployment begins.

## Protected dispatch

Keep the `crm-production-deployment` GitHub environment protected. This is a
single-developer repository, so the control is the exact automated acceptance
receipt plus a separate explicit owner production confirmation rather than an
invented second reviewer. Dispatch
`.github/workflows/crm-production-deploy.yml` from the exact accepted website
commit with:

- `acceptance_run_id`;
- `website_ref`;
- `backend_contract_ref`;
- `external_evidence_sha256`;
- `accepted_archive_sha256`;
- `rollback_ref`.

The workflow fails closed unless the workflow source commit itself equals
`website_ref`. This prevents a different deployment implementation from
promoting an otherwise valid artifact.

## Enforced promotion sequence

The workflow:

1. downloads only
   `crm-production-accepted-WEBSITE_SHA` from the named acceptance run using
   the immutable `actions/download-artifact` v5 commit;
2. verifies the independently supplied archive SHA-256 and its published
   checksum;
3. verifies the retained GitHub attestation bundle, repository, exact
   `crm-production-acceptance.yml` signer workflow, source commit, hosted
   runner, and SLSA provenance predicate;
4. checks out the current static branch and requires its HEAD to equal the
   approved rollback ref;
5. recomputes the whole current static tree and requires it to equal the
   approved rollback artifact SHA-256;
6. safely lists and extracts the signed archive, rejecting absolute paths,
   traversal, duplicate entries, unexpected roots, links, devices, receipt
   tampering, expired approval, or any site/backend/artifact mismatch;
7. replaces files only inside the isolated static-branch checkout and verifies
   the staged tree against every manifest path, size, and SHA-256;
8. makes one normal child commit and performs a fast-forward push. Force push
   is prohibited;
9. requires the remote branch to resolve to that exact deployment commit;
10. waits for the live `/admin/` sentinel and then verifies every public
    artifact byte, both canonical CRM routes, three large fingerprinted
    assets, Brotli, gzip, one-year immutable caching, warm cache hits, and the
    backend health contract;
11. retains redacted attestation, staging-plan, and deployment receipts for
    90 days.

The production verifier hashes the backend request ID instead of retaining the
raw support identifier. It retains no customer payload, credentials, private
evidence JSON, or provider response body.

## Automatic rollback

If any step after the production push fails, the same protected job:

1. confirms both local and remote production still point to the failed
   deployment commit;
2. creates a normal Git revert commit;
3. recomputes the restored static tree and requires it to equal the
   pre-approved rollback artifact SHA-256;
4. fast-forwards the production branch to the revert commit;
5. waits for the public origin and verifies every public rollback file plus
   backend health; and
6. writes a checksummed `rolled-back` receipt.

The workflow remains failed after rollback. A rollback receipt is evidence of
containment, not a successful release.

## Current external blocker

A read-only header probe on 2026-07-26 found that the current host serves a
fingerprinted CSS asset with gzip and `max-age=2592000`, but did not serve
Brotli and did not include the `immutable` directive. The accepted evidence
contract and post-deploy verifier require Brotli, gzip, warm hits, and at
least one year of immutable caching for three fingerprinted assets. Host/CDN
configuration and fresh external measurements are therefore required before
REL-008 can pass.

`docs/CRM_CDN_REMEDIATION.md` records the exact live evidence, the preferred
Porkbun support path, a canary-first Cloudflare fallback, DNS/mail/API
preservation requirements, rollback controls, and the receipt fields required
for acceptance. That package is preparation only; no provider change is
authorized by its presence in source.

Before production acceptance, `npm run release:deploy:probe-cdn` can bind a
read-only canary probe to the candidate manifest. It verifies exact bytes and
the same three-asset Brotli/gzip/public-one-year-immutable/warm-hit contract,
including `Vary: Accept-Encoding` and no cookies, but it cannot authorize
REL-008.

## Evidence interpretation

The following are not deployment evidence:

- local `dist/`;
- a clean local build;
- a branch commit without the accepted archive;
- a checksum without a valid GitHub attestation;
- a valid accepted archive deployed after its approval window;
- a successful push without live byte, route, CDN, and health verification;
- an automatic rollback receipt.

REL-008 closes only when the protected workflow publishes a successful
deployment receipt for the exact accepted artifact and an independent release
owner accepts that receipt.
