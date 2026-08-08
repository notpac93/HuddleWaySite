import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const crmRoot = join(process.cwd(), 'src/components/crm');
const crmStyles = readFileSync(
  join(process.cwd(), 'src/styles/crm.css'),
  'utf8',
);

function source(relativePath: string) {
  return readFileSync(join(crmRoot, relativePath), 'utf8');
}

describe('CRM interaction hardening source evidence', () => {
  it('uses truthful media search and subscription error states', () => {
    const media = source('MediaManager.svelte');

    expect(media).not.toMatch(/\balert\s*\(/);
    expect(media).toContain('Media name unavailable');
    expect(media).toContain('Category unavailable');
    expect(media).toContain('Search media files');
    expect(media).toContain("mediaLoadState = 'error'");
    expect(media).toContain('role="alert"');
  });

  it('names module toggles and exposes their current pressed state', () => {
    const studio = source('MyAppStudio.svelte');

    expect(studio).toContain("`${tab.enabled ? 'Disable' : 'Enable'} ${tab.label} module`");
    expect(studio).toContain('aria-pressed={tab.enabled}');
  });

  it('keeps the live app preview visible beside compact brand controls', () => {
    const studio = source('MyAppStudio.svelte');

    expect(studio).toContain('class="crm-ui-studio-toolbar-wrap"');
    expect(studio).toContain('compact');
    expect(studio).toContain("primaryColor,");
    expect(studio).toContain("secondaryColor,");
    expect(studio).toContain("tertiaryColor,");
    expect(studio).toContain('gap-6 py-4 xl:gap-3 xl:py-2');
    expect(crmStyles).toMatch(
      /\.crm-ui-studio-toolbar\s*\{\s*@apply flex max-w-full flex-wrap items-center/,
    );
    expect(crmStyles).toMatch(
      /\.crm-ui-studio-toolbar\s*\{\s*@apply[^}]*gap-4[^}]*px-4 py-3/,
    );
    expect(crmStyles).toContain('.crm-ui-studio-color-controls { @apply border-l border-gray-200 pl-4; }');
    expect(crmStyles).toContain('.crm-ui-studio-color-item { @apply flex items-center gap-3; }');
    expect(crmStyles).toMatch(
      /\.crm-ui-studio-preview\s*\{\s*@apply relative order-1 flex flex-none min-h-\[44rem\][^}]*overflow-visible[^}]*p-3 pb-8 sm:p-4/,
    );
    expect(crmStyles).toMatch(
      /\.crm-ui-studio-editor\s*\{\s*@apply[^}]*order-2[^}]*xl:order-none/,
    );
    expect(crmStyles).toMatch(
      /\.crm-ui-studio-preview\s*\{\s*@apply[^}]*order-1[^}]*xl:order-none/,
    );
    expect(crmStyles).toContain('xl:overflow-y-auto');
  });

  it('keeps every CRM modal panel above its backdrop', () => {
    const modalComponents = [
      'CrmShell.svelte',
      'GlobalSearch.svelte',
      'InviteStaffModal.svelte',
      'events/CreateEventForm.svelte',
      'events/DuplicateEventModal.svelte',
      'events/EditEventModal.svelte',
      'events/EventRegistrantsModal.svelte',
      'registration/CreateRegistrationForm.svelte',
      'seasons/CreateSeasonModal.svelte',
      'seasons/EditSeasonModal.svelte',
      'seasons/LinkEventModal.svelte',
      'teams/CreateTeamForm.svelte',
    ];

    const failures = modalComponents.filter((component) => {
      const componentSource = source(component);
      const hasBackdrop = componentSource.match(
        /<button[^>]*class="(?:crm-ui-backdrop|fixed inset-0 z-0 [^"]*bg-gray-500)/,
      );
      return !hasBackdrop
        || !componentSource.match(
          /class="(?:crm-ui-modal-panel-lg|crm-ui-event-(?:create|duplicate|edit)-panel|crm-ui-shell-(?:mobile-drawer|logout-panel)|relative z-10 [^"]*bg-white)/,
        );
    });

    expect(failures).toEqual([]);
    expect(crmStyles).toMatch(
      /\.crm-ui-backdrop\s*\{\s*@apply fixed inset-0 z-0 [^}]*bg-gray-500\/75/,
    );
    expect(crmStyles).toMatch(
      /\.crm-ui-modal-panel-lg\s*\{\s*@apply relative z-10 [^}]*bg-white/,
    );
    for (const modal of ['create', 'duplicate', 'edit']) {
      expect(crmStyles).toMatch(
        new RegExp(`\\.crm-ui-event-${modal}-panel\\s*\\{\\s*@apply relative z-10 [^}]*bg-white`),
      );
    }
    for (const panel of ['mobile-drawer', 'logout-panel']) {
      expect(crmStyles).toMatch(
        new RegExp(`\\.crm-ui-shell-${panel}\\s*\\{\\s*@apply relative z-10 `),
      );
    }
    for (const component of modalComponents) {
      expect(source(component)).toContain('use:modalFocus');
    }
  });

  it('uses real result buttons and preserves the selected search result ID', () => {
    const search = source('GlobalSearch.svelte');
    const shell = source('CrmShell.svelte');

    expect(search.match(/<button type="button" class="flex w-full/g)).toHaveLength(3);
    expect(search).not.toMatch(/<li[^>]+on:click/);
    expect(shell).toContain('export let activeResultId: string | null = null;');
    expect(shell).toContain('activeResultId = event.detail.id;');
  });
});
