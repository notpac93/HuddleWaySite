import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  describeAppConfigurationChanges,
  hasDuplicateTabLabels,
  readableTextColor,
} from '../../src/lib/ui/appConfigurationReview';
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
  it('describes every changed family-facing value', () => {
    const changes = describeAppConfigurationChanges(baseline, {
      ...baseline,
      name: 'Falcons Club',
      primaryColor: '#123456',
      navigationTabs: [
        { ...baseline.navigationTabs[0], label: 'Start' },
        { ...baseline.navigationTabs[1], enabled: false },
      ],
    });
    expect(changes).toEqual(expect.arrayContaining([
      'App name: “Falcons” → “Falcons Club”',
      'Primary color: #000000 → #123456',
      'Home tab label: “Home” → “Start”',
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
