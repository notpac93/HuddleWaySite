import { describe, expect, it } from 'vitest';

import { previewParityHarnessHtml } from '../../scripts/preview-parity/app-preview-parity-harness.mjs';

describe('production preview parity harness', () => {
  it('registers the source-bound message listener before loading the consumer iframe', () => {
    const html = previewParityHarnessHtml({
      options: {
        contract: {
          previewOrigin: 'https://preview.example',
          environment: 'prod',
        },
        tenantId: 'stem-it-up-sports',
        expectedSourceCommit: 'a'.repeat(40),
        expectedReleaseId: 'consumer-prod-aaaaaaaaaaaa',
      },
      previewUrl: 'https://preview.example/?crmPreview=1&parentOrigin=https%3A%2F%2Fexample.com',
      session: { sessionId: 'session', nonce: 'nonce' },
      update: { type: 'huddleway.crm.preview.update', revision: 1 },
    });

    expect(html).not.toContain('<iframe id="consumer-preview" src=');
    expect(html.indexOf("window.addEventListener('message'")).toBeGreaterThan(-1);
    expect(html.indexOf('frame.src = contract.previewUrl')).toBeGreaterThan(
      html.indexOf("window.addEventListener('message'"),
    );
    expect(html).toContain('event.source !== frame.contentWindow');
  });
});
