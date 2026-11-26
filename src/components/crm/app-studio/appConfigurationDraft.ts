import { normalizeGlassAppearance, validGlassAppearance } from '../../../lib/ui/glassAppearance';
import type { CrmAppConfiguration } from "../../../lib/api/BackendApi";

export type NavigationTabDraft = CrmAppConfiguration["navigationTabs"][number];

export type AppVersion = {
  id: string;
  configVersion: number;
  publishedAt: string | null;
  publishedBy: string | null;
  publishedByLabel?: string | null;
  auditReason: string | null;
  configuration: CrmAppConfiguration;
};

export const initialTabs: NavigationTabDraft[] = [
  {
    key: "home",
    pageId: "home_page",
    route: "/",
    label: "Home",
    enabled: true,
  },
  {
    key: "teams",
    pageId: "teams_page",
    route: "/teams",
    label: "Teams",
    enabled: true,
  },
  {
    key: "schedule",
    pageId: "schedule_page",
    route: "/schedule",
    label: "Schedule",
    enabled: true,
  },
  {
    key: "messaging",
    pageId: "board_page",
    route: "/messaging",
    label: "Board",
    enabled: true,
  },
];

export const maxActiveTabs = 5;

const missingTabPriority = ["home", "teams", "schedule", "messaging"];
const permanentTabNames: Record<string, string> = {
  home: "Home",
  teams: "Teams",
  events: "Events",
  messaging: "Board",
  schedule: "Schedule",
  scores: "Scores",
  resources: "Resources",
  staff: "Staff",
  account: "Account",
  contact: "Contact",
};

// Matches the Consumer route retirement policy; preserve historical payloads.
export function isRetiredNavigationTab(tab: NavigationTabDraft) {
  const route = tab.route.trim();
  const withLeadingSlash = route.startsWith('/') ? route : `/${route}`;
  return withLeadingSlash.replace(/\/$/, '') === '/events';
}

export function permanentTabName(tab: NavigationTabDraft) {
  return isTeamTab(tab) ? "Teams" : permanentTabNames[tab.key] || tab.label;
}

function usesProgramScores(tenantId: string) {
  return tenantId === 'stem-it-up' || tenantId === 'stem-it-up-sports';
}

function isTeamTab(tab: NavigationTabDraft) {
  return tab.route === '/teams' || /^\/team-[a-z0-9-]+$/.test(tab.route);
}

export function portalNavigationTabs(tenantId: string, saved: NavigationTabDraft[]) {
  const tabs = saved.map((tab) => ({ ...tab }));
  if (!usesProgramScores(tenantId)) return tabs;
  const scoresConfigured = tabs.some((tab) => tab.route === '/scores');
  const teamIndex = tabs.findIndex((tab) => tab.enabled && isTeamTab(tab));
  for (const tab of tabs) {
    if (isTeamTab(tab)) tab.enabled = false;
  }
  if (!scoresConfigured && (teamIndex >= 0 ||
      tabs.filter((tab) => tab.enabled && !isRetiredNavigationTab(tab)).length < maxActiveTabs)) {
    const position = teamIndex >= 0 ? teamIndex : tabs.findIndex((tab) => tab.route === '/') + 1;
    tabs.splice(position, 0, { key: 'scores', pageId: 'scores_page', route: '/scores', label: 'Scores', enabled: true });
  }
  return tabs;
}

export function availableToProgram(tenantId: string, tab: NavigationTabDraft) {
  return !isRetiredNavigationTab(tab) && !(usesProgramScores(tenantId) && isTeamTab(tab));
}

export function completeFiveTabSlots(tabs: NavigationTabDraft[]) {
  const completed = tabs.map((tab) => ({ ...tab }));
  for (const key of missingTabPriority) {
    if (completed.filter((tab) => !isRetiredNavigationTab(tab)).length >= maxActiveTabs) break;
    const candidate = initialTabs.find((tab) => tab.key === key);
    const alreadyHasTeamsPurpose =
      key === "teams" &&
      completed.some((tab) => permanentTabName(tab) === "Teams");
    if (
      candidate &&
      !alreadyHasTeamsPurpose &&
      !completed.some(
        (tab) => tab.key === candidate.key || tab.route === candidate.route,
      )
    ) {
      completed.push({ ...candidate, enabled: false });
    }
  }
  return completed;
}

export function configurationSignature(configuration: CrmAppConfiguration) {
  return JSON.stringify({
    appName: configuration.name.trim(),
    appStyle: configuration.appStyle || 'system',
    glassAppearance: normalizeGlassAppearance(configuration.glassAppearance),
    primaryColor: configuration.primaryColor.toLowerCase(),
    secondaryColor: configuration.secondaryColor.toLowerCase(),
    tertiaryColor: configuration.tertiaryColor.toLowerCase(),
    tabsConfig: configuration.navigationTabs,
    logoUrl: configuration.logoUrl,
  });
}

export function validAppConfiguration(configuration: CrmAppConfiguration) {
  const tabs = configuration.navigationTabs;
  const colors = [
    configuration.primaryColor,
    configuration.secondaryColor,
    configuration.tertiaryColor,
  ];
  return (
    validGlassAppearance(configuration.glassAppearance) &&
    ['light', 'dark', 'system'].includes(configuration.appStyle || 'system') &&
    configuration.name.trim().length > 0 &&
    configuration.name.trim().length <= 160 &&
    colors.every((color) => /^#[0-9a-fA-F]{6}$/.test(color)) &&
    tabs.length > 0 &&
    tabs.length <= 12 &&
    tabs.filter((tab) => tab.enabled).length <= maxActiveTabs &&
    new Set(tabs.map((tab) => tab.key)).size === tabs.length &&
    tabs.every(
      (tab) =>
        tab.key &&
        tab.pageId &&
        tab.label.trim() &&
        tab.label.length <= 80 &&
        tab.route?.startsWith("/") &&
        !tab.route.startsWith("//"),
    )
  );
}
