import { describe, expect, it, vi } from 'vitest';
import {
  contrastRatio,
  describeAppConfigurationChanges,
  hasDuplicateTabLabels,
  readableTextColor,
} from '../../src/lib/ui/appConfigurationReview';
import { completeFiveTabSlots, validAppConfiguration, verifyPublishedNavigation } from '../../src/components/crm/app-studio/appConfigurationDraft';
import type { CrmAppConfiguration } from '../../src/lib/api/BackendApi';

const baseline: CrmAppConfiguration = {
  name: 'Falcons',
  primaryColor: '#000000',
  secondaryColor: '#ffffff',
  tertiaryColor: '#112233',
  logoUrl: null,
  navigationTabs: [
    { key: 'home', pageId: 'home', route: '/', label: 'Home', enabled: true },
    { key: 'events', pageId: 'events', route: '/events', label: 'Events', enabled: true },
  ],
};

describe('app configuration publication review', () => {
  it('verifies the rendered order against the selected tenant’s public home bundle', async () => {
    const [home, retired] = baseline.navigationTabs;
    const staff = { key: 'staff', pageId: 'staff_page', route: '/staff', label: 'Staff', enabled: true };
    const fetchBundle = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        bundle: { tenantId: 'tenant-a', aboveTheFold: { navigation: { tabs: [home, staff] } } },
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        bundle: { tenantId: 'tenant-a', aboveTheFold: { navigation: { tabs: [staff, home] } } },
      })));
    vi.stubGlobal('fetch', fetchBundle);
    try {
      await expect(verifyPublishedNavigation('https://api.example.test', 'tenant-a', [home, retired, staff])).resolves.toBe(true);
      await expect(verifyPublishedNavigation('https://api.example.test', 'tenant-a', [home, retired, staff])).resolves.toBe(false);
      const [url, options] = fetchBundle.mock.calls[0];
      expect(url.searchParams.get('tenantId')).toBe('tenant-a');
      expect(options.cache).toBe('no-store');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('suggests missing current tabs while preserving the historical stored-entry limit', () => {
    const tabs = [
      ...baseline.navigationTabs,
      { key: 'teams', pageId: 'teams', route: '/teams', label: 'Teams', enabled: true },
      { key: 'messaging', pageId: 'board', route: '/messaging', label: 'Board', enabled: true },
      { key: 'contact', pageId: 'contact', route: '/contact', label: 'Contact', enabled: true },
    ];
    const completed = completeFiveTabSlots(tabs);
    expect(completed).toHaveLength(6);
    expect(completed.find(tab => tab.key === 'events')).toEqual(tabs[1]);
    expect(completed.find(tab => tab.key === 'schedule')).toMatchObject({ enabled: false });
    expect(validAppConfiguration({ ...baseline, navigationTabs: completed })).toBe(true);
    expect(validAppConfiguration({ ...baseline, navigationTabs: completed.map(tab => ({ ...tab, enabled: true })) })).toBe(false);
  });

  it('describes every changed family-facing value', () => {
    const changes = describeAppConfigurationChanges(baseline, {
      ...baseline,
      name: 'Falcons Club',
      appStyle: 'dark',
      primaryColor: '#123456',
      navigationTabs: [
        { ...baseline.navigationTabs[0], label: 'Start' },
        { ...baseline.navigationTabs[1], enabled: false },
      ],
    });
    expect(changes).toEqual(expect.arrayContaining([
      'App name · “Falcons Club”',
      'Primary color · #123456',
      'Appearance · dark',
      'Rename a tab to “Start”',
      'Hide Events in the family app.',
    ]));
  });

  it('calculates contrast and selects the more readable text color', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 2);
    expect(readableTextColor('#000000')).toMatchObject({ color: '#ffffff' });
    expect(readableTextColor('#ffffff')).toMatchObject({ color: '#111827' });
  });

  it('rejects duplicate active tab labels only', () => {
    expect(hasDuplicateTabLabels({
      ...baseline,
      navigationTabs: baseline.navigationTabs.map((tab) => ({ ...tab, label: 'Same' })),
    })).toBe(true);
    expect(hasDuplicateTabLabels({
      ...baseline,
      navigationTabs: baseline.navigationTabs.map((tab, index) => ({ ...tab, label: 'Same', enabled: index === 0 })),
    })).toBe(false);
  });
});
