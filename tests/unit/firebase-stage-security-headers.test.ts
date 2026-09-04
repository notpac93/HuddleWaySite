import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

interface HostingHeader {
  key: string;
  value: string;
}

describe('Firebase stage canary security headers', () => {
  it('protects every portal response without weakening the page CSP', () => {
    const config = JSON.parse(
      readFileSync(resolve('firebase.stage-canary.json'), 'utf8'),
    ) as {
      hosting: {
        headers: Array<{ source: string; headers: HostingHeader[] }>;
      };
    };
    const globalRule = config.hosting.headers.find(
      (entry) => entry.source === '**',
    );
    expect(globalRule).toBeDefined();
    const headers = Object.fromEntries(
      (globalRule?.headers ?? []).map(({ key, value }) => [
        key.toLowerCase(),
        value,
      ]),
    );

    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['permissions-policy']).toContain('camera=()');
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(headers['content-security-policy']).toContain("object-src 'none'");
  });
});
