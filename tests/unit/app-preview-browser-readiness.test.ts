import { describe, expect, it, vi } from 'vitest';

import {
  waitForRenderedPreview,
  waitForSelectedPreviewRoute,
} from '../../scripts/preview-parity/app-preview-browser-readiness.mjs';

const navigationTabs = [
  { label: 'HProbe', route: '/' },
  { label: 'TProbe', route: '/teams' },
];

function immediateTiming() {
  let elapsedMs = 0;
  return {
    timeoutMs: 10,
    pollIntervalMs: 1,
    now: () => elapsedMs,
    pause: async (durationMs: number) => { elapsedMs += durationMs; },
  };
}

describe('consumer preview browser readiness', () => {
  it('waits through delayed Flutter content before accepting the rendered app', async () => {
    const readAccessibilityTree = vi.fn()
      .mockResolvedValueOnce('- text: Loading home page...')
      .mockResolvedValueOnce('- text: STEM It Up Sports')
      .mockResolvedValue('- text: STEM It Up Sports\n- tab "HPROBE"\n- tab "TPROBE"');

    await expect(waitForRenderedPreview({
      readAccessibilityTree,
      expectedTenantMarker: 'STEM It Up Sports',
      navigationTabs,
      ...immediateTiming(),
    })).resolves.toContain('TPROBE');
    expect(readAccessibilityTree).toHaveBeenCalledTimes(3);
  });

  it('waits for both the destination route and selected-tab semantics', async () => {
    const readRouteEvidence = vi.fn()
      .mockResolvedValueOnce({
        actualRoute: '/',
        accessibilityTree: '- tab "TPROBE"',
      })
      .mockResolvedValueOnce({
        actualRoute: '/team-esports',
        accessibilityTree: '- tab "TPROBE"',
      })
      .mockResolvedValue({
        actualRoute: '/team-esports',
        accessibilityTree: '- tab "TPROBE" [selected]',
      });

    await expect(waitForSelectedPreviewRoute({
      readRouteEvidence,
      tab: navigationTabs[1],
      ...immediateTiming(),
    })).resolves.toMatchObject({ actualRoute: '/team-esports' });
    expect(readRouteEvidence).toHaveBeenCalledTimes(3);
  });

  it('fails closed when tenant content never becomes ready', async () => {
    await expect(waitForRenderedPreview({
      readAccessibilityTree: async () => '- text: Loading home page...',
      expectedTenantMarker: 'STEM It Up Sports',
      navigationTabs,
      ...immediateTiming(),
    })).rejects.toThrow(
      /Timed out after 10ms.*STEM It Up Sports.*Loading home page/i,
    );
  });
});
