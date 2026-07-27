# CRM Performance Qualification

Status: OPS-002 source/local artifact gate green; external synthetic-canary acceptance pending
Owner: `jesse-jackson-performance`
Date: 2026-07-26
Canonical route: `/admin/`
Data boundary: loopback fixtures only; no production customer data

## What this evidence proves

The canonical Svelte/Astro CRM now has reproducible asset, module-loading,
query-operation, local Core Web Vitals, responsive-overflow, and media-loading
budgets. `npm run test:build` produces the static artifact and immediately
runs `scripts/check-crm-performance.mjs` against the actual `/admin/` HTML and
its complete static module graph. The same artifact check is part of
`release:ci`.

This evidence does **not** claim production p75 Core Web Vitals, CDN cache
behavior, Firebase Storage image derivatives, or authoritative exact Dashboard
counts. Those require the external evidence listed under “Production
blockers.”

## Production-build bundle result

The baseline was captured before OPS-002 changes with `npm run build` and a
recursive static-import walk starting at the `/admin/` Astro island and Svelte
renderer. The final result uses the same method.

| Metric | Baseline | OPS-002 checkpoint | Change |
| --- | ---: | ---: | ---: |
| Initial JavaScript, raw | 995,881 B | 675,682 B | -320,199 B (-32.15%) |
| Initial JavaScript, gzip | 283,046 B | 206,009 B | -77,037 B (-27.22%) |
| Initial JavaScript, Brotli | 227,156 B | 173,485 B | -53,671 B (-23.63%) |
| Largest JavaScript chunk, raw | 614,584 B | 232,670 B | -381,914 B (-62.14%) |
| `CrmApp` entry, raw | 329,566 B | 32,107 B | -297,459 B (-90.26%) |
| Initial CSS, gzip | not separately gated | 18,939 B | within 20,000 B |
| Default Dashboard additional JS, gzip | bundled in entry | 7,299 B | within 12,000 B |
| Initial route requests | 7 large-file requests | 20 HTTP/2-sized requests | within 22 |
| CRM favicon | 165,311 B | 6,704 B | -158,607 B (-95.94%) |

The OPS-002 checkpoint artifact contained:

- 14 named lazy top-level CRM feature chunks;
- a lazy Global Search module;
- click-loaded event-creation and staff-invite dashboard modules;
- a feature-only `getFirebaseStorage()` boundary;
- Firebase vendor chunks capped below 250,000 raw bytes;
- 1,069,715 raw bytes across the full 44-file CRM JavaScript graph, while the
  cold route loads only the initial subset.

The build no longer emits the previous “chunk larger than 500 kB” warning.

### Current release-tree rerun

Later signup, onboarding, messaging, finance-period, and interaction-test work
expanded the release tree. An intermediate season checkpoint exceeded the
complete-graph limit. Duplicate surfaces were consolidated without raising a
budget, and the CRM now centralizes repeated template utility classes, applies
three-pass production minification, and imports only the CRM stylesheet
instead of the unrelated marketing-site stylesheet. The final full-CI build
on 2026-07-26 generated all ten pages with this current result:

| Metric | Current | Budget | Verdict |
| --- | ---: | ---: | --- |
| Initial JavaScript, raw | 698,671 B | 700,000 B | pass |
| Initial JavaScript, gzip | 213,032 B | 215,000 B | pass |
| Initial JavaScript, Brotli | 178,984 B | 180,000 B | pass |
| Initial CSS, gzip | 14,547 B | 20,000 B | pass |
| Default Dashboard additional JS, gzip | 8,460 B | 12,000 B | pass |
| Initial route requests | 21 | 22 | pass |
| Largest JavaScript chunk, raw | 223,407 B | 250,000 B | pass |
| Complete CRM JavaScript graph, raw | 1,149,997 B | 1,150,000 B | pass |
| Named lazy top-level feature chunks | 14 | at least 12 | pass |

No budget was relaxed. BLK-010 is closed. Authenticated canary performance,
hosting, and media-delivery evidence remain separate acceptance requirements
under BLK-008.

The protected workflows validate the backend origin, Firebase project, and
emulator prohibition through non-public `HUDDLEWAY_RELEASE_*` controls. Those
values are already fixed by the production runtime and are deliberately not
serialized again into Vite's public environment. A release-path regression
test rejects the redundant public form. The exact protected-workflow
environment therefore reproduces the 1,149,997-byte result above; an earlier
diagnostic invocation with redundant public keys correctly exceeded the graph
cap and was not accepted.

## Query and request volume

Before OPS-002, importing `DataStore.ts` opened five tenant collection
listeners and fetched the full financial projection as soon as authentication
selected a tenant, regardless of which feature was visible. CrmShell branding
added a sixth listener.

The final store is subscriber-driven:

- a dormant module opens zero collection listeners and zero financial API
  requests;
- Dashboard mounts three tenant collection listeners (`registrations`,
  `teams`, and `events`) plus the single branding document listener;
- all active financial store consumers share one authenticated overview
  request;
- `season_registrations` and `seasons` do not load on Dashboard;
- switching away unmounts the feature and releases its unused listeners;
- Roster uses one initial subscription path instead of duplicate on-mount and
  reactive requests;
- Roster backend refresh is capped at once per visible minute and pauses while
  the document is hidden, with an immediate refresh when visibility returns.

`tests/unit/data-store-performance.test.ts` proves the zero-dormant, one-store,
shared-finance, and three-listener Dashboard boundaries with mocked calls.
`tests/unit/crm-performance-source.test.ts` pins the polling, code-splitting,
Storage, media, and budget contracts.

The authenticated financial overview backend clamps each processor collection
to 500 records. Each of the three direct Firestore Dashboard projections
orders deterministically, requests at most 501 documents, exposes at most 500,
and uses the extra document only to set a truncation flag. Dashboard renders
`500+`, “exact count unavailable,” and “not a complete or chronological total”
instead of treating the bounded sample as an exact count. This closes the
unbounded-cardinality performance defect; cursor navigation and authoritative
exact counts remain UI-003 product limitations.

`tests/unit/data-store-performance.test.ts` exercises the 501/500 boundary for
registrations, teams, and events independently.
`tests/component/global-dashboard-projections.test.ts` proves all three
truncation labels, masks partial revenue totals, enforces owner/editor/viewer
quick-action boundaries, and masks operational KPIs on a projection error.

## Media delivery

- The CRM uses its own 64×64, 6,704-byte favicon instead of downloading the
  shared 1,000×1,000, 165,311-byte PNG.
- List/card media has explicit intrinsic dimensions plus `loading="lazy"` and
  `decoding="async"`.
- Modal/local previews have explicit dimensions and asynchronous decoding.
- The shell logo has fixed dimensions to prevent layout shift.
- Firebase Storage is absent from the cold CRM module graph and initializes
  only when an upload-capable feature module loads. Importing the core Firebase
  module still guarantees App Check initialization precedes Auth, Firestore,
  and the lazy Storage getter.

The authoritative Firebase Functions implementation generates three
generation-bound WebP variants for both event uploads and supported generic
tenant media. Landscape outputs measure 640, 1,280, and 1,920 pixels wide;
portrait outputs measure 480, 720, and 1,080 pixels wide. Derivatives are
stored under a separate `/optimized/` path and written with
`public,max-age=31536000,immutable`; their metadata binds each derivative back
to its source path and variant.

`npm run release:evidence:probe-media` now verifies that contract against one
approved synthetic non-customer fixture. It downloads the actual Firebase
Storage bytes, parses rather than trusts WebP dimensions, confirms source
generation and source-path metadata, checks path and byte isolation, and emits
a token-free checksummed receipt bound to the reviewed site and backend commit.
Six focused tests cover success, cache failure, cross-source metadata failure,
dimension parsing, revision pinning, and protected-workflow token boundaries.

No authorized remote fixture has been created or probed, so this local
implementation does not yet satisfy the production media-delivery gate.

## Authenticated synthetic-canary RUM implementation

The production artifact now contains a privacy-bounded collector for LCP, INP,
and CLS. It is inactive unless the protected release build embeds the exact
40-character `PUBLIC_WEBSITE_COMMIT`. After authentication it waits for a real
user interaction and an observed LCP, obtains current Firebase Auth and App
Check tokens, and sends one stable sample to
`POST /operations/performance/rum`.

The backend uses tenant scope only to authorize the request. It persists no
UID, tenant ID, route, name, email, record, registration, financial field, or
arbitrary payload. Records contain only the commit, desktop/mobile class,
three metrics, fixed surface, timestamps, authentication/App Check outcomes,
and a SHA-256 random sample key with a checked-in 30-day TTL.

The protected backend workflow and `collect:crm-rum-evidence` command produce
only p75 aggregates and counts. They fail unless desktop and mobile each have
at least 75 valid-App-Check samples spanning 24 hours and meet the same
2,500 ms/200 ms/0.1 thresholds. Because customer activity is unavailable
before launch, the external acceptance document must label the measurements
`authenticated-synthetic-canary` and set `customerActivityClaimed` to `false`.
This evidence never claims customer or production field traffic.

## Local Core Web Vitals and responsive lab

The loopback Playwright guard runs in Desktop Chrome and Pixel 5 emulation,
blocks all non-loopback responses, performs a real setup-form interaction, and
records paint, event timing, layout shift, long tasks, and horizontal
overflow. Results from the current release-tree rerun:

| Project | FCP | LCP | INP | CLS | DCL | Long tasks | Overflow |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Desktop Chrome | 748 ms | 748 ms | 56 ms | 0 | 863 ms | 0 | 0 px |
| Pixel 5 emulation | 76 ms | 76 ms | 48 ms | 0 | 106 ms | 0 | 0 px |

Both pass the pinned good-threshold budgets: LCP ≤2,500 ms, INP ≤200 ms, and
CLS ≤0.1. These are local lab results, not production field percentiles.

## Reproducible commands

Run from the site repository:

```sh
npm run test:type
npm run test:unit
npm run test:component
npm run test:build
PLAYWRIGHT_BASE_URL=http://127.0.0.1:4328 \
  npx playwright test --config playwright.config.ts \
  tests/e2e/crm-performance.spec.ts
```

OPS-002 checkpoint evidence:

- type check: 108 files, zero errors;
- unit: 12 files, 60 tests passed;
- component: three files, six tests passed;
- performance E2E: desktop and mobile passed;
- production build: ten pages generated;
- asset performance gate: passed every budget at the checkpoint.

Current release-tree evidence:

- type check: 158 files, zero errors;
- unit: 25 files, 163 tests passed;
- component: 34 files, 137 tests passed;
- integration: one adapter test passed; one emulator-only case was safely
  skipped without opt-in;
- authenticated CRM, performance, and onboarding E2E: six desktop/mobile
  cases passed;
- production build: ten pages generated;
- asset performance gate: every limit passed, including the authenticated RUM
  collector and complete CRM graph at 1,149,997/1,150,000 raw bytes.

The earlier OPS-002 checkpoint freeze was the SHA-256 of the ordered
`shasum -a 256` lines for that checkpoint's runtime/config/test file set:

`fb2531ab704d3f2397119e0565edd4bc1c3a546ebad374bf883f0b207bc68abe`

The current registration, financial, and event qualification tranches change that dirty-tree source,
so the checkpoint hash is retained only as historical evidence and is not a
hash of the present tree. REL-005 still requires a clean reviewed commit and
manifest.

## Production blockers

1. **Field Core Web Vitals and hosting:** authenticated RUM collection and its
   fail-closed aggregate gate are implemented, but the undeployed candidate
   has no production customer samples. Local output also cannot prove CDN compression,
   cache headers, edge latency, or authenticated route performance. The
   release owner must capture production/staging evidence for mobile and
   desktop after deployment configuration is fixed. The protected acceptance
   validator requires at least 75 samples per class and enforces the same
   LCP/INP/CLS thresholds, edge p75 budgets, Brotli/gzip, immutable fingerprint
   caching, and warm hits.
2. **Remote media derivatives:** the Functions implementation and fail-closed
   byte-level collector are present, but no authorized remote fixture receipt
   exists. The protected acceptance validator still requires fixture-only
   proof of at least three responsive widths, AVIF or WebP output, immutable
   caching, and source/derivative isolation.

The provider decision, DNS-preservation checklist, canary sequence, and exact
CDN receipt contract are in `docs/CRM_CDN_REMEDIATION.md`.

Authenticated seeded desktop/mobile navigation, all 14 lazy modules, safe
failure paths, focus restoration, search result IDs, and zero overflow are now
covered locally. They remain local qualification, not a substitute for the
external authenticated synthetic-canary evidence above.
