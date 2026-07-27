#!/usr/bin/env node

import { createHash } from 'node:crypto';
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  writeFile,
} from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIREBASE_STORAGE_HOST = 'firebasestorage.googleapis.com';
const FETCH_TIMEOUT_MS = 20_000;
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const MAX_DERIVATIVE_BYTES = 10 * 1024 * 1024;
const MIN_IMMUTABLE_SECONDS = 31_536_000;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const COMMIT_SHA = /^[a-f0-9]{40}$/;
const STORAGE_GENERATION = /^[1-9][0-9]{0,31}$/;
const VARIANT_NAME = /^[a-z][a-z0-9_-]{0,31}$/;

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function assertCommit(value, label) {
  const normalized = String(value || '').trim().toLowerCase();
  assert(COMMIT_SHA.test(normalized), `${label} must be a full commit SHA.`);
  return normalized;
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function assertPlainObject(value, label) {
  assert(
    value
      && typeof value === 'object'
      && !Array.isArray(value)
      && Object.getPrototypeOf(value) === Object.prototype,
    `${label} must be a JSON object.`,
  );
  return value;
}

function assertExactKeys(value, expectedKeys, label) {
  const actual = Object.keys(assertPlainObject(value, label)).sort();
  const expected = [...expectedKeys].sort();
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${label} must contain exactly: ${expected.join(', ')}.`,
  );
}

function parseFirebaseStorageUrl(value, label) {
  assert(typeof value === 'string' && value.length <= 2_048, `${label} is invalid.`);
  let url;
  try {
    url = new URL(value);
  } catch {
    fail(`${label} is invalid.`);
  }
  assert(
    url.protocol === 'https:'
      && url.hostname === FIREBASE_STORAGE_HOST
      && url.username === ''
      && url.password === ''
      && url.hash === '',
    `${label} must be a Firebase Storage HTTPS download URL.`,
  );
  const match = url.pathname.match(/^\/v0\/b\/([^/]+)\/o\/([^/]+)$/);
  assert(match, `${label} does not identify one Firebase Storage object.`);
  const bucketName = decodeURIComponent(match[1]);
  const objectPath = decodeURIComponent(match[2]);
  assert(
    bucketName.length > 0
      && objectPath.length > 0
      && !objectPath.startsWith('/')
      && !objectPath.includes('\0'),
    `${label} has an invalid bucket or object path.`,
  );
  assert(
    url.searchParams.getAll('alt').length === 1
      && url.searchParams.get('alt') === 'media',
    `${label} must request media bytes.`,
  );
  const tokens = url.searchParams.getAll('token');
  assert(
    tokens.length === 1 && tokens[0].length >= 16 && tokens[0].length <= 512,
    `${label} must use one bounded fixture download token.`,
  );
  assert(
    [...url.searchParams.keys()].every((key) => key === 'alt' || key === 'token'),
    `${label} has unsupported query parameters.`,
  );
  return {
    url,
    bucketName,
    objectPath,
  };
}

function readUint24LE(bytes, offset) {
  assert(offset + 3 <= bytes.length, 'WebP dimension metadata is truncated.');
  return bytes[offset] | bytes[offset + 1] << 8 | bytes[offset + 2] << 16;
}

export function parseWebPDimensions(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  assert(
    bytes.length >= 30
      && bytes.toString('ascii', 0, 4) === 'RIFF'
      && bytes.toString('ascii', 8, 12) === 'WEBP',
    'Derivative bytes are not a supported WebP image.',
  );

  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const chunkType = bytes.toString('ascii', offset, offset + 4);
    const chunkSize = bytes.readUInt32LE(offset + 4);
    const dataOffset = offset + 8;
    assert(
      dataOffset + chunkSize <= bytes.length,
      'WebP chunk metadata is truncated.',
    );

    if (chunkType === 'VP8X') {
      assert(chunkSize >= 10, 'WebP VP8X metadata is truncated.');
      return {
        width: readUint24LE(bytes, dataOffset + 4) + 1,
        height: readUint24LE(bytes, dataOffset + 7) + 1,
      };
    }

    if (chunkType === 'VP8 ') {
      assert(
        chunkSize >= 10
          && bytes[dataOffset + 3] === 0x9d
          && bytes[dataOffset + 4] === 0x01
          && bytes[dataOffset + 5] === 0x2a,
        'WebP VP8 frame metadata is invalid.',
      );
      return {
        width: bytes.readUInt16LE(dataOffset + 6) & 0x3fff,
        height: bytes.readUInt16LE(dataOffset + 8) & 0x3fff,
      };
    }

    if (chunkType === 'VP8L') {
      assert(
        chunkSize >= 5 && bytes[dataOffset] === 0x2f,
        'WebP VP8L frame metadata is invalid.',
      );
      const byte0 = bytes[dataOffset + 1];
      const byte1 = bytes[dataOffset + 2];
      const byte2 = bytes[dataOffset + 3];
      const byte3 = bytes[dataOffset + 4];
      return {
        width: 1 + byte0 + ((byte1 & 0x3f) << 8),
        height: 1 + (byte1 >> 6) + (byte2 << 2) + ((byte3 & 0x0f) << 10),
      };
    }

    offset = dataOffset + chunkSize + (chunkSize % 2);
  }

  fail('Derivative WebP dimensions could not be determined.');
}

function parseMaxAge(cacheControl) {
  const match = String(cacheControl || '').match(
    /(?:^|,)\s*max-age\s*=\s*"?([0-9]+)"?(?:\s*,|$)/i,
  );
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) ? value : null;
}

function assertImmutableCache(headers, label) {
  const cacheControl = headers.get('cache-control') || '';
  const maxAge = parseMaxAge(cacheControl);
  assert(/\bpublic\b/i.test(cacheControl), `${label} cache policy is not public.`);
  assert(/\bimmutable\b/i.test(cacheControl), `${label} cache policy is not immutable.`);
  assert(
    !/\bprivate\b|\bno-store\b/i.test(cacheControl),
    `${label} cache policy forbids shared immutable caching.`,
  );
  assert(
    maxAge !== null && maxAge >= MIN_IMMUTABLE_SECONDS,
    `${label} immutable cache lifetime is shorter than one year.`,
  );
  return {
    cacheControl,
    maxAge,
  };
}

async function fetchStorageObject(
  storageObject,
  label,
  maximumBytes,
  fetchImpl,
) {
  let response;
  try {
    response = await fetchImpl(storageObject.url, {
      redirect: 'error',
      headers: { 'Accept-Encoding': 'identity' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch {
    fail(`${label} could not be fetched.`);
  }
  assert(response.status === 200, `${label} returned HTTP ${response.status}.`);
  assert(!response.headers.has('set-cookie'), `${label} returned Set-Cookie.`);

  const responseObject = parseFirebaseStorageUrl(response.url, `${label} response`);
  assert(
    responseObject.bucketName === storageObject.bucketName
      && responseObject.objectPath === storageObject.objectPath,
    `${label} response identity changed.`,
  );

  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength)) {
    assert(declaredLength <= maximumBytes, `${label} exceeds its byte ceiling.`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  assert(bytes.length > 0, `${label} is empty.`);
  assert(bytes.length <= maximumBytes, `${label} exceeds its byte ceiling.`);
  return {
    bytes,
    sha256: sha256(bytes),
    headers: response.headers,
  };
}

function validateDescriptor(value) {
  assertExactKeys(
    value,
    ['derivativeUrls', 'evidenceId', 'schemaVersion', 'sourceGeneration', 'sourceUrl'],
    'Media fixture descriptor',
  );
  assert(value.schemaVersion === 1, 'Unsupported media fixture descriptor schema.');
  assert(
    typeof value.evidenceId === 'string' && SAFE_ID.test(value.evidenceId),
    'Media fixture evidenceId is invalid.',
  );
  assert(
    typeof value.sourceGeneration === 'string'
      && STORAGE_GENERATION.test(value.sourceGeneration),
    'Media fixture sourceGeneration is invalid.',
  );
  assert(
    Array.isArray(value.derivativeUrls)
      && value.derivativeUrls.length >= 3
      && value.derivativeUrls.length <= 8,
    'Media fixture needs three to eight derivative URLs.',
  );
  const source = parseFirebaseStorageUrl(value.sourceUrl, 'Media source URL');
  const derivatives = value.derivativeUrls.map((url, index) =>
    parseFirebaseStorageUrl(url, `Media derivative ${index + 1} URL`));
  assert(
    new Set([source.url.href, ...derivatives.map((entry) => entry.url.href)]).size
      === derivatives.length + 1,
    'Media fixture URLs must be unique.',
  );
  assert(
    source.objectPath.includes('/uploads/')
      && !source.objectPath.includes('/optimized/'),
    'Media source must be isolated under an uploads path.',
  );
  for (const [index, derivative] of derivatives.entries()) {
    assert(
      derivative.bucketName === source.bucketName,
      `Media derivative ${index + 1} is in a different bucket.`,
    );
    assert(
      derivative.objectPath.includes('/optimized/')
        && !derivative.objectPath.includes('/uploads/'),
      `Media derivative ${index + 1} must be isolated under an optimized path.`,
    );
    assert(
      derivative.objectPath.includes(`/${value.sourceGeneration}/`),
      `Media derivative ${index + 1} is not generation-bound to its source.`,
    );
  }
  assert(
    new Set(derivatives.map((entry) => entry.objectPath)).size
      === derivatives.length,
    'Media derivative object paths must be unique.',
  );
  return {
    evidenceId: value.evidenceId,
    sourceGeneration: value.sourceGeneration,
    source,
    derivatives,
  };
}

export async function probeMediaEvidence({
  descriptor,
  descriptorBytes = Buffer.from(JSON.stringify(descriptor)),
  websiteCommit,
  backendCommit,
  fetchImpl = fetch,
  now = Date.now(),
}) {
  const sourceCommit = assertCommit(websiteCommit, 'Website commit');
  const contractCommit = assertCommit(backendCommit, 'Backend commit');
  const fixture = validateDescriptor(descriptor);
  const sourceResponse = await fetchStorageObject(
    fixture.source,
    'Media source',
    MAX_SOURCE_BYTES,
    fetchImpl,
  );
  assert(
    (sourceResponse.headers.get('content-type') || '').toLowerCase()
      .startsWith('image/'),
    'Media source content type is not an image.',
  );
  assert(
    sourceResponse.headers.get('x-goog-generation') === fixture.sourceGeneration,
    'Media source generation does not match the fixture descriptor.',
  );

  const derivativeEvidence = [];
  for (const [index, derivative] of fixture.derivatives.entries()) {
    const label = `Media derivative ${index + 1}`;
    const response = await fetchStorageObject(
      derivative,
      label,
      MAX_DERIVATIVE_BYTES,
      fetchImpl,
    );
    assert(
      (response.headers.get('content-type') || '').toLowerCase()
        .startsWith('image/webp'),
      `${label} is not served as WebP.`,
    );
    assert(/\.webp$/i.test(derivative.objectPath), `${label} path is not WebP.`);
    const sourcePath = response.headers.get('x-goog-meta-sourcepath') || '';
    assert(
      sourcePath === fixture.source.objectPath,
      `${label} source-path metadata does not match the fixture source.`,
    );
    const variant = response.headers.get('x-goog-meta-variant') || '';
    assert(VARIANT_NAME.test(variant), `${label} variant metadata is invalid.`);
    const cache = assertImmutableCache(response.headers, label);
    const dimensions = parseWebPDimensions(response.bytes);
    assert(
      Number.isSafeInteger(dimensions.width)
        && dimensions.width >= 128
        && dimensions.width <= 4_096
        && Number.isSafeInteger(dimensions.height)
        && dimensions.height >= 1
        && dimensions.height <= 4_096,
      `${label} has unsafe dimensions.`,
    );
    assert(
      response.sha256 !== sourceResponse.sha256,
      `${label} bytes are identical to the source.`,
    );
    derivativeEvidence.push({
      variant,
      width: dimensions.width,
      height: dimensions.height,
      format: 'webp',
      bytes: response.bytes.length,
      sha256: response.sha256,
      objectPathSha256: sha256(derivative.objectPath),
      sourcePathMetadataSha256: sha256(sourcePath),
      cacheControl: cache.cacheControl,
      maxAgeSeconds: cache.maxAge,
    });
  }

  assert(
    new Set(derivativeEvidence.map((entry) => entry.variant)).size
      === derivativeEvidence.length,
    'Media derivative variants must be unique.',
  );
  assert(
    new Set(derivativeEvidence.map((entry) => entry.width)).size >= 3,
    'Media evidence needs at least three unique measured widths.',
  );
  assert(
    new Set(derivativeEvidence.map((entry) => entry.sha256)).size
      === derivativeEvidence.length,
    'Media derivative bytes must be distinct.',
  );

  derivativeEvidence.sort(
    (left, right) =>
      left.width - right.width || left.variant.localeCompare(right.variant),
  );
  const performanceMedia = {
    fixtureObjects: 1,
    responsiveWidths: derivativeEvidence.map((entry) => entry.width),
    modernFormats: ['webp'],
    immutableCacheVerified: true,
    sourceDerivativeIsolationVerified: true,
  };
  const body = {
    schemaVersion: 1,
    status: 'passed',
    evidenceId: fixture.evidenceId,
    capturedAt: new Date(now).toISOString(),
    provider: 'firebase-storage',
    release: {
      websiteCommit: sourceCommit,
      backendCommit: contractCommit,
    },
    descriptorSha256: sha256(descriptorBytes),
    fixture: {
      source: {
        generation: fixture.sourceGeneration,
        bytes: sourceResponse.bytes.length,
        sha256: sourceResponse.sha256,
        objectPathSha256: sha256(fixture.source.objectPath),
      },
      derivativeCount: derivativeEvidence.length,
      derivatives: derivativeEvidence,
    },
    performanceMedia,
  };
  return {
    ...body,
    receiptSha256: sha256(canonicalJson(body)),
  };
}

async function assertRegularFile(path, label) {
  const metadata = await lstat(path).catch((error) => {
    if (error?.code === 'ENOENT') fail(`${label} is missing.`);
    throw error;
  });
  assert(metadata.isFile(), `${label} must be a regular file.`);
  assert(!metadata.isSymbolicLink(), `${label} cannot be a symbolic link.`);
}

async function writePrivateReceipt(path, value) {
  const outputPath = resolve(path);
  assert(
    outputPath !== resolve('/')
      && dirname(outputPath) !== outputPath,
    'Refusing unsafe media receipt path.',
  );
  await mkdir(dirname(outputPath), { recursive: true, mode: 0o700 });
  await writeFile(outputPath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  await chmod(outputPath, 0o600);
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    assert(
      key === '--input'
        || key === '--out'
        || key === '--website-commit'
        || key === '--backend-commit',
      `Unknown media evidence option: ${key}`,
    );
    const value = argv[index + 1];
    assert(value && !value.startsWith('--'), `${key} requires a value.`);
    options[key.slice(2)] = value;
    index += 1;
  }
  assert(options.input, '--input is required.');
  assert(options.out, '--out is required.');
  assert(options['website-commit'], '--website-commit is required.');
  assert(options['backend-commit'], '--backend-commit is required.');
  assert(resolve(options.input) !== resolve(options.out), 'Input and output must differ.');
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const inputPath = resolve(options.input);
  await assertRegularFile(inputPath, 'Media fixture descriptor');
  const descriptorBytes = await readFile(inputPath);
  let descriptor;
  try {
    descriptor = JSON.parse(descriptorBytes.toString('utf8'));
  } catch {
    fail('Media fixture descriptor is not valid JSON.');
  }
  const receipt = await probeMediaEvidence({
    descriptor,
    descriptorBytes,
    websiteCommit: options['website-commit'],
    backendCommit: options['backend-commit'],
  });
  await writePrivateReceipt(options.out, receipt);
  process.stdout.write(
    `${JSON.stringify({
      status: receipt.status,
      evidenceId: receipt.evidenceId,
      websiteCommit: receipt.release.websiteCommit,
      backendCommit: receipt.release.backendCommit,
      responsiveWidths: receipt.performanceMedia.responsiveWidths,
      modernFormats: receipt.performanceMedia.modernFormats,
      receiptSha256: receipt.receiptSha256,
      output: resolve(options.out),
    })}\n`,
  );
}

const isEntryPoint =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntryPoint) {
  main().catch((error) => {
    process.stderr.write(`Media evidence failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
