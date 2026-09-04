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
  {
    key: "events",
    pageId: "events_page",
    route: "/events",
    label: "Events",
    enabled: true,
  },
];

export const maxActiveTabs = 5;

export const approvedPalettes = [
  {
    name: "HuddleWay blue",
    primary: "#0F4C81",
    secondary: "#245BD6",
    tertiary: "#F59E0B",
  },
  {
    name: "Field green",
    primary: "#166534",
    secondary: "#16A34A",
    tertiary: "#FACC15",
  },
  {
    name: "Club burgundy",
    primary: "#7F1D1D",
    secondary: "#DC2626",
    tertiary: "#F59E0B",
  },
];

const missingTabPriority = ["home", "teams", "schedule", "messaging", "events"];
const permanentTabNames: Record<string, string> = {
  home: "Home",
  teams: "Teams",
  events: "Events",
  messaging: "Board",
  schedule: "Schedule",
  resources: "Resources",
  staff: "Staff",
  account: "Account",
  contact: "Contact",
};

export function permanentTabName(tab: NavigationTabDraft) {
  return permanentTabNames[tab.key] || "Teams";
}

export function completeFiveTabSlots(tabs: NavigationTabDraft[]) {
  const completed = tabs.map((tab) => ({ ...tab }));
  for (const key of missingTabPriority) {
    if (completed.length >= maxActiveTabs) break;
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
      completed.push({ ...candidate });
    }
  }
  return completed;
}

export function configurationSignature(configuration: CrmAppConfiguration) {
  return JSON.stringify({
    appName: configuration.name.trim(),
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
