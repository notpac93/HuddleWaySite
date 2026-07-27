# CRM CDN remediation

Status: prepared; provider-owner approval and execution are pending
Gate: BLK-008 / OPS-002 / REL-008
Production origin: `https://huddleway.com`
Static deployment target: `porkbun-huddleway-static`

This plan closes only the delivery portion of BLK-008. It does not authorize a
DNS, hosting, or CDN change, and it does not substitute for authenticated field
RUM, tenant-media derivative evidence, independent REL-007 acceptance, or the
protected REL-008 deployment.

## Current public evidence

A read-only probe on 2026-07-26 resolved:

- apex A: `207.207.210.215`;
- authoritative DNS: Porkbun;
- `www`: `ss1-sixie.porkbun.com`;
- API: Render's `api-huddleway-backend.onrender.com` path;
- no public apex DS record;
- static server: `openresty`, service `pixie-sh`.

The current fingerprinted asset
`/_astro/account-deletion.CWgR4YxA.css` returned:

| Request | Result |
| --- | --- |
| `Accept-Encoding: br` | uncompressed |
| `Accept-Encoding: gzip` | `Content-Encoding: gzip` |
| browser cache | duplicate 30-day `Cache-Control` values; no `immutable` |
| first/second request | `x-cache: MISS`, then `x-cache: HIT` |

The current origin therefore fails the unchanged release contract: three
fingerprinted JavaScript/CSS assets must each prove Brotli, gzip, a downstream
`public, max-age=31536000, immutable` policy, and a warm cache hit.

Porkbun documents static file upload, FTP, and GitHub Connect, but its public
static-hosting documentation does not document per-path response-header or
compression controls. The first remediation path is therefore an owner support
request, not an assumed hidden feature.

## Owner decision

Use the first option that produces canary evidence without weakening the gate.

### Option A — Porkbun origin fix

Ask Porkbun support to configure this exact behavior for
`huddleway.com/_astro/*`:

- content negotiation for Brotli and gzip;
- `Vary: Accept-Encoding`;
- `Cache-Control: public, max-age=31536000, immutable`;
- a provider cache-status header whose second same-edge request proves a hit;
- no long-lived caching for HTML, JSON, or unfingerprinted paths.

The support receipt must identify the account/domain and change time but must
not be committed if it contains private account or ticket data. Probe a canary
or provider preview before production. If Porkbun cannot supply all four
properties, use Option B.

### Option B — approved Cloudflare proxy in front of Porkbun

Keep Porkbun as registrar and static origin. Move authoritative DNS only after
a complete record-by-record comparison and proxy only the web hostnames.
Cloudflare's documented response-compression and cache-response rules can add
the missing behavior without modifying the static artifact.

Required configuration:

1. Export and independently review every existing A, AAAA, CNAME, MX, TXT,
   CAA, SRV, DKIM, DMARC, verification, and subdomain record.
2. Confirm DNSSEC state in the registrar, not only with a public lookup.
   Cloudflare requires DNSSEC to be disabled before a full nameserver change
   and recommends re-enabling it after activation.
3. Add the zone and compare the imported record set byte-for-byte with the
   approved export before changing nameservers.
4. Keep mail, verification, and non-web records DNS-only. Keep
   `api.huddleway.com` DNS-only unless the backend owner separately approves a
   proxy change; the API already terminates through Render's delivery path.
5. Proxy only the apex and approved `www`/canary web records to the current
   Porkbun origin. Use Full (strict) TLS only after validating the origin
   certificate for each hostname.
6. Match only successful fingerprinted assets below `/_astro/`. Do not cache
   `/admin/`, `/admin/setup/`, HTML, error responses, authentication traffic,
   API traffic, or arbitrary extensionless paths.
7. Add a cache rule that makes matching assets eligible and sets browser and
   edge TTL to 31,536,000 seconds.
8. Add a cache-response rule that emits `public`, `max-age=31536000`, and
   `immutable` downstream. This is separate from the edge cache rule.
9. Add a compression rule ordered Brotli, then gzip, for matching JavaScript
   and CSS. Do not add `no-transform`.
10. Disable body-rewriting features on the asset path. The release verifies
    exact public bytes against the accepted archive.

Cloudflare requires proxied DNS for its cache and compression rules. A Free or
Pro full-zone setup requires changing the domain's authoritative nameservers;
that is a production infrastructure change and requires the provider owner,
DNS record reviewer, and rollback owner.

## Canary and rollback

Before changing the apex:

1. Attach an approved canary hostname to the same static origin.
2. Apply the asset-only cache and compression rules to that hostname.
3. Publish a non-customer candidate built from the exact reviewed commit.
4. Run the candidate-bound probe:

   ```sh
   npm run release:deploy:probe-cdn -- \
     --manifest /approved/candidate/crm-release-manifest.json \
     --origin https://APPROVED-CANARY-HOST \
     --out /approved/private/crm-cdn-canary-receipt.json
   ```

   The command reads only the public canary. It verifies exact identity bytes
   against the manifest plus Brotli, gzip, `Vary: Accept-Encoding`, public
   one-year immutable caching, no cookies, and warm-hit behavior for the three
   largest eligible fingerprinted assets. The output is bound to the exact
   website commit and artifact SHA-256 and has its own checksum.
5. Verify HTML remains revalidated and `/admin/` plus `/admin/setup/` resolve.
6. Verify the API, inbound/outbound mail, SPF, DKIM, DMARC, app/site links, and
   certificate renewal paths are unchanged.

The rollback package must contain the approved pre-change DNS export,
authoritative nameservers, origin IP/hostnames, rule identifiers, TTLs,
operator names, and a bounded rollback window. Rollback disables the web proxy
or restores the previous Porkbun nameservers and then verifies web, API, mail,
and certificate behavior. DNS propagation means rollback is not instantaneous.

## Required acceptance evidence

For each of at least three fingerprinted `.js`/`.css` assets, retain a redacted
receipt containing:

- exact accepted website commit and artifact SHA-256;
- asset path and expected file SHA-256;
- probe region and timestamps;
- 200 status and matching response-body SHA-256;
- `Content-Encoding: br` from a Brotli-only request;
- `Content-Encoding: gzip` from a gzip-only request;
- `Vary: Accept-Encoding`;
- one-year `public` and `immutable` downstream cache policy;
- cold and warm provider cache states with the second request a hit;
- no `Set-Cookie` and no unexpected response transformation.

The protected deployment workflow independently repeats these checks and
verifies every public file. It now also rejects compressed responses that omit
`Vary: Accept-Encoding`, set cookies, or omit the public cache directive. A
canary receipt does not authorize or prove production deployment.

## Provider references

- Porkbun static hosting:
  <https://kb.porkbun.com/article/137-how-to-set-up-static-hosting>
- Cloudflare full-zone nameserver setup:
  <https://developers.cloudflare.com/dns/zone-setups/full-setup/setup/>
- Cloudflare cache behavior:
  <https://developers.cloudflare.com/cache/get-started/>
- Cloudflare cache-response rules:
  <https://developers.cloudflare.com/cache/how-to/cache-response-rules/create-dashboard/>
- Cloudflare compression rules:
  <https://developers.cloudflare.com/rules/compression-rules/>
