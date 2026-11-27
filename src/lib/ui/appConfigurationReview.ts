import { normalizeGlassAppearance } from './glassAppearance';
import type { CrmAppConfiguration } from '../api/BackendApi';

function normalizedHex(value: string) {
  return value.trim().toLowerCase();
}

// Matches the Consumer route retirement policy; preserve historical payloads.
export function isRetiredNavigationTab(tab: { route: string }) {
  const route = tab.route.trim();
  const withLeadingSlash = route.startsWith('/') ? route : `/${route}`;
  return withLeadingSlash.replace(/\/$/, '') === '/events';
}

export function describeAppConfigurationChanges(
  before: CrmAppConfiguration | null,
  after: CrmAppConfiguration,
) {
  if (!before) return [`Set up the family app as “${after.name.trim()}”`, `Appearance · ${after.appStyle || 'system'}`];
  const changes: string[] = [];
  if (JSON.stringify(normalizeGlassAppearance(before.glassAppearance)) !== JSON.stringify(normalizeGlassAppearance(after.glassAppearance))) {
    changes.push(`Glass appearance · ${normalizeGlassAppearance(after.glassAppearance).style}`);
  }
  if ((before.appStyle || 'system') !== (after.appStyle || 'system')) {
    changes.push(`Appearance · ${after.appStyle || 'system'}`);
  }
  if (before.name.trim() !== after.name.trim()) {
    changes.push(`App name · “${after.name.trim()}”`);
  }
  for (const role of ['primaryColor', 'secondaryColor', 'tertiaryColor'] as const) {
    if (normalizedHex(before[role]) !== normalizedHex(after[role])) {
      const label = role.replace('Color', '').replace(/^./, (value) => value.toUpperCase());
      changes.push(`${label} color · ${after[role]}`);
    }
  }
  if (before.logoUrl !== after.logoUrl) changes.push('Replace the family app logo.');
  // Retired routes are never visible, even when a legacy record is marked enabled.
  const beforeTabs = before.navigationTabs.filter((tab) => !isRetiredNavigationTab(tab));
  const afterTabs = after.navigationTabs.filter((tab) => !isRetiredNavigationTab(tab));
  const previousByKey = new Map(beforeTabs.map((tab) => [tab.key, tab]));
  for (const tab of afterTabs) {
    const previous = previousByKey.get(tab.key);
    if (!previous) {
      if (tab.enabled) changes.push(`Add ${tab.label} to the app navigation.`);
      continue;
    }
    if (previous.label.trim() !== tab.label.trim()) {
      changes.push(`Rename a tab to “${tab.label}”`);
    }
    if (previous.enabled !== tab.enabled) {
      changes.push(`${tab.enabled ? 'Show' : 'Hide'} ${tab.label} in the family app.`);
    }
  }
  const currentByKey = new Map(afterTabs.map((tab) => [tab.key, tab]));
  const previousOrder = beforeTabs
    .filter((tab) => tab.enabled && currentByKey.get(tab.key)?.enabled)
    .map((tab) => tab.key);
  const currentOrder = afterTabs
    .filter((tab) => tab.enabled && previousByKey.get(tab.key)?.enabled)
    .map((tab) => tab.key);
  if (previousOrder.some((key, index) => key !== currentOrder[index])) {
    changes.push('Change the order of the app tabs.');
  }
  return changes;
}

function luminance(hex: string) {
  const value = normalizedHex(hex).replace('#', '');
  if (!/^[0-9a-f]{6}$/.test(value)) return null;
  const channels = [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16) / 255);
  const linear = channels.map((channel) => channel <= 0.03928
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

export function contrastRatio(first: string, second: string) {
  const firstLuminance = luminance(first);
  const secondLuminance = luminance(second);
  if (firstLuminance === null || secondLuminance === null) return null;
  const light = Math.max(firstLuminance, secondLuminance);
  const dark = Math.min(firstLuminance, secondLuminance);
  return (light + 0.05) / (dark + 0.05);
}

export function readableTextColor(background: string) {
  const white = contrastRatio(background, '#ffffff') || 0;
  const black = contrastRatio(background, '#111827') || 0;
  return white >= black
    ? { color: '#ffffff', ratio: white }
    : { color: '#111827', ratio: black };
}

export function hasDuplicateTabLabels(configuration: CrmAppConfiguration) {
  const labels = configuration.navigationTabs
    .filter((tab) => tab.enabled)
    .map((tab) => tab.label.trim().toLocaleLowerCase());
  return new Set(labels).size !== labels.length;
}
