import { describe, expect, it } from 'vitest';

import {
  HUDDLEWAY_CRM_PALETTE,
  buildCrmThemeTokens,
  crmContrastRatio,
  serializeCrmThemeVariables,
} from '../../src/lib/ui/crmTheme';

describe('CRM tenant theme', () => {
  it('uses the canonical HuddleWay palette by default', () => {
    const theme = buildCrmThemeTokens(null);

    expect(theme).toMatchObject(HUDDLEWAY_CRM_PALETTE);
    expect(theme.sidebar).not.toBe(theme.primary);
  });

  it('normalizes valid tenant colors and falls back field by field', () => {
    const theme = buildCrmThemeTokens({
      primary: '#abcdef',
      secondary: 'rgb(1, 2, 3)',
      tertiary: '#123456',
    });

    expect(theme.primary).toBe('#ABCDEF');
    expect(theme.secondary).toBe(HUDDLEWAY_CRM_PALETTE.secondary);
    expect(theme.tertiary).toBe('#123456');
  });

  it('derives readable text, link, focus, and sidebar tokens for extremes', () => {
    for (const palette of [
      { primary: '#FFFFFF', secondary: '#FFFF00', tertiary: '#FFFFFF' },
      { primary: '#000000', secondary: '#000080', tertiary: '#000000' },
      { primary: '#7F7F7F', secondary: '#7F7F7F', tertiary: '#7F7F7F' },
    ]) {
      const theme = buildCrmThemeTokens(palette);
      expect(crmContrastRatio(theme.control, '#FFFFFF')).toBeGreaterThanOrEqual(3);
      expect(crmContrastRatio(theme.onPrimary, theme.control)).toBeGreaterThanOrEqual(4.5);
      expect(crmContrastRatio(theme.onSecondary, theme.secondary)).toBeGreaterThanOrEqual(4.5);
      expect(crmContrastRatio(theme.link, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
      expect(crmContrastRatio(theme.focus, '#FFFFFF')).toBeGreaterThanOrEqual(3);
      expect(crmContrastRatio(theme.onSidebar, theme.sidebar)).toBeGreaterThanOrEqual(4.5);
      expect(crmContrastRatio(theme.sidebarHover, theme.sidebar)).toBeGreaterThanOrEqual(3);
      expect(crmContrastRatio(theme.sidebarActive, theme.sidebar)).toBeGreaterThanOrEqual(3);
      expect(crmContrastRatio(theme.sidebarIcon, theme.sidebar)).toBeGreaterThanOrEqual(3);
    }
  });

  it('keeps pilot tenant navigation visibly on-brand when contrast permits', () => {
    const eagle = buildCrmThemeTokens({
      primary: '#090B0F',
      secondary: '#0D66CF',
      tertiary: '#FFFFFF',
    });
    const stem = buildCrmThemeTokens({
      primary: '#0B5C42',
      secondary: '#0F2747',
      tertiary: '#F4B41A',
    });

    expect(eagle.sidebarActive).toBe('#0D66CF');
    expect(eagle.sidebarHover).toBe('#0D66CF');
    expect(eagle.sidebarIcon).toBe('#FFFFFF');
    expect(stem.sidebarActive).toBe('#F4B41A');
    expect(stem.sidebarHover).toBe('#F4B41A');
    expect(stem.sidebarIcon).toBe('#F4B41A');
  });

  it('serializes only normalized color values', () => {
    const theme = buildCrmThemeTokens({
      primary: '#123456; background: red',
      secondary: '#654321',
      tertiary: '#ABCDEF',
    });
    const serialized = serializeCrmThemeVariables(theme);

    expect(serialized).toContain('--crm-brand-primary: #003366');
    expect(serialized).toContain('--crm-brand-secondary: #654321');
    expect(serialized).not.toContain('background: red');
  });
});
