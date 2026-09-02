import type { CrmAppConfiguration } from '../api/BackendApi';

function normalizedHex(value: string) {
  return value.trim().toLowerCase();
}

function tabMap(configuration: CrmAppConfiguration) {
  return new Map(configuration.navigationTabs.map((tab) => [tab.key, tab]));
}

export function describeAppConfigurationChanges(
  before: CrmAppConfiguration | null,
  after: CrmAppConfiguration,
) {
  if (!before) return ['Initialize the family app configuration.'];
  const changes: string[] = [];
  if (before.name.trim() !== after.name.trim()) {
    changes.push(`App name: “${before.name}” → “${after.name}”`);
  }
  for (const role of ['primaryColor', 'secondaryColor', 'tertiaryColor'] as const) {
    if (normalizedHex(before[role]) !== normalizedHex(after[role])) {
      const label = role.replace('Color', '').replace(/^./, (value) => value.toUpperCase());
      changes.push(`${label} color: ${before[role]} → ${after[role]}`);
    }
  }
  if (before.logoUrl !== after.logoUrl) changes.push('Replace the family app logo.');
  const previousTabs = tabMap(before);
  for (const tab of after.navigationTabs) {
    const previous = previousTabs.get(tab.key);
    if (!previous) {
      changes.push(`Add ${tab.label} to the app navigation.`);
      continue;
    }
    if (previous.label.trim() !== tab.label.trim()) {
      changes.push(`${previous.label} tab label: “${previous.label}” → “${tab.label}”`);
    }
    if (previous.enabled !== tab.enabled) {
      changes.push(`${tab.enabled ? 'Show' : 'Hide'} ${tab.label} in the family app.`);
    }
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
