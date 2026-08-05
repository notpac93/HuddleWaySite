import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  parseWebPDimensions,
  probeMediaEvidence,
} from '../../scripts/release/crm-media-evidence.mjs';

const TOKEN = 'fixture-token-that-is-never-written-to-the-receipt';
const BUCKET = 'sports-team-apps.appspot.com';
const SOURCE_PATH = 'events/fixture-tenant/uploads/fixture-event/source.png';
const GENERATION = '1785132000123456';
const WEBSITE_COMMIT = '1'.repeat(40);
const BACKEND_COMMIT = '2'.repeat(40);

function storageUrl(path: string) {
  return `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${
    encodeURIComponent(path)
  }?alt=media&token=${TOKEN}`;
}

function vp8x(width: number, height: number) {
  const bytes = Buffer.alloc(30);
  bytes.write('RIFF', 0, 'ascii');
  bytes.writeUInt32LE(22, 4);
  bytes.write('WEBP', 8, 'ascii');
  bytes.write('VP8X', 12, 'ascii');
  bytes.writeUInt32LE(10, 16);
  bytes.writeUIntLE(width - 1, 24, 3);
  bytes.writeUIntLE(height - 1, 27, 3);
  return bytes;
}

function responseFor(url: URL, body: Buffer, headers: Headers) {
  const bytes = new Uint8Array(body.byteLength);
  bytes.set(body);
  const response = new Response(bytes.buffer, { status: 200, headers });
  Object.defineProperty(response, 'url', { value: url.href });
  return response;
}

function fixture({ mutable = false, sourcePath = SOURCE_PATH } = {}) {
  const variants = [
    { name: 'small', width: 640, height: 360 },
    { name: 'medium', width: 1280, height: 720 },
    { name: 'large', width: 1920, height: 1080 },
  ];
  const derivativePaths = variants.map(
    ({ name }) =>
      `events/fixture-tenant/optimized/fixture-event/${GENERATION}/${name}.webp`,
  );
  const descriptor = {
    schemaVersion: 1,
    evidenceId: 'media-fixture-20260726',
    sourceGeneration: GENERATION,
    sourceUrl: storageUrl(SOURCE_PATH),
    derivativeUrls: derivativePaths.map(storageUrl),
  };
  const fetchImpl = async (input: URL | RequestInfo) => {
    const url = new URL(String(input));
    const path = decodeURIComponent(url.pathname.split('/o/')[1]);
    if (path === SOURCE_PATH) {
      return responseFor(url, Buffer.from('fixture-source-image'), new Headers({
        'content-type': 'image/png',
        'x-goog-generation': GENERATION,
      }));
    }
    const index = derivativePaths.indexOf(path);
    if (index === -1) throw new Error('not found');
    const variant = variants[index];
    return responseFor(url, vp8x(variant.width, variant.height), new Headers({
      'cache-control': mutable
        ? 'public,max-age=60'
        : 'public,max-age=31536000,immutable',
      'content-type': 'image/webp',
      'x-goog-meta-sourcepath': sourcePath,
      'x-goog-meta-variant': variant.name,
    }));
  };
  return { descriptor, fetchImpl };
}

describe('CRM fixture-media evidence', () => {
  it('measures three immutable WebP widths without retaining fixture URLs', async () => {
    const value = fixture();
    const receipt = await probeMediaEvidence({
      descriptor: value.descriptor,
      descriptorBytes: Buffer.from(JSON.stringify(value.descriptor)),
      websiteCommit: WEBSITE_COMMIT,
      backendCommit: BACKEND_COMMIT,
      fetchImpl: value.fetchImpl,
      now: Date.parse('2026-07-26T22:00:00.000Z'),
    });

    expect(receipt.performanceMedia).toEqual({
      fixtureObjects: 1,
      responsiveWidths: [640, 1280, 1920],
      modernFormats: ['webp'],
      immutableCacheVerified: true,
      sourceDerivativeIsolationVerified: true,
    });
    expect(receipt.release).toEqual({
      websiteCommit: WEBSITE_COMMIT,
      backendCommit: BACKEND_COMMIT,
    });
    expect(receipt.fixture.derivatives.map((entry) => entry.variant)).toEqual([
      'small',
      'medium',
      'large',
    ]);
    expect(receipt.receiptSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.descriptorSha256).toBe(
      createHash('sha256')
        .update(JSON.stringify(value.descriptor))
        .digest('hex'),
    );
    expect(JSON.stringify(receipt)).not.toContain(TOKEN);
    expect(JSON.stringify(receipt)).not.toContain('firebasestorage.googleapis.com');
    expect(JSON.stringify(receipt)).not.toContain(SOURCE_PATH);
  });

  it('rejects mutable derivative caching', async () => {
    const value = fixture({ mutable: true });
    await expect(probeMediaEvidence({
      descriptor: value.descriptor,
      websiteCommit: WEBSITE_COMMIT,
      backendCommit: BACKEND_COMMIT,
      fetchImpl: value.fetchImpl,
    })).rejects.toThrow(/not immutable/i);
  });

  it('rejects a derivative whose source metadata crosses fixture boundaries', async () => {
    const value = fixture({
      sourcePath: 'events/other-tenant/uploads/other-event/source.png',
    });
    await expect(probeMediaEvidence({
      descriptor: value.descriptor,
      websiteCommit: WEBSITE_COMMIT,
      backendCommit: BACKEND_COMMIT,
      fetchImpl: value.fetchImpl,
    })).rejects.toThrow(/source-path metadata/i);
  });

  it('parses measured WebP extended dimensions', () => {
    expect(parseWebPDimensions(vp8x(1080, 1440))).toEqual({
      width: 1080,
      height: 1440,
    });
  });

  it('rejects an unpinned website or backend revision before fetching', async () => {
    const value = fixture();
    await expect(probeMediaEvidence({
      descriptor: value.descriptor,
      websiteCommit: 'main',
      backendCommit: BACKEND_COMMIT,
      fetchImpl: value.fetchImpl,
    })).rejects.toThrow(/website commit/i);
    await expect(probeMediaEvidence({
      descriptor: value.descriptor,
      websiteCommit: WEBSITE_COMMIT,
      backendCommit: 'main',
      fetchImpl: value.fetchImpl,
    })).rejects.toThrow(/backend commit/i);
  });

  it('is not part of the single-developer production workflow', async () => {
    const workflow = await readFile(
      resolve(process.cwd(), '.github/workflows/crm-production-deploy.yml'),
      'utf8',
    );
    expect(workflow).toContain('name: CRM single-developer production deployment');
    expect(workflow).not.toContain('CRM_MEDIA_FIXTURE_JSON');
    expect(workflow).not.toContain('crm-media-evidence.mjs');
  });
});
