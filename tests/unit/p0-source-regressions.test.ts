import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from 'svelte/compiler';
import { describe, expect, it } from 'vitest';

const crmRoot = fileURLToPath(
  new URL('../../src/components/crm/', import.meta.url),
);

function walkSvelteFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? walkSvelteFiles(path)
      : path.endsWith('.svelte')
        ? [path]
        : [];
  });
}

function source(relativePath: string) {
  return readFileSync(join(crmRoot, relativePath), 'utf8');
}

describe('known P0 CRM source regressions', () => {
  it('parses every canonical CRM Svelte component', () => {
    const errors: string[] = [];
    for (const file of walkSvelteFiles(crmRoot)) {
      try {
        compile(readFileSync(file, 'utf8'), { filename: file, generate: false });
      } catch (error) {
        errors.push(`${file}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    expect(errors).toEqual([]);
  }, 15_000);

  it('declares the season event-link dispatcher only once', () => {
    const linkEventSource = source('seasons/LinkEventModal.svelte');
    expect(
      linkEventSource.match(/const dispatch = createEventDispatcher\(\);/g),
    ).toHaveLength(1);
  });

  it('validates event time slots without undeclared scalar time variables', () => {
    const createEventSource = source('events/CreateEventForm.svelte');
    expect(createEventSource).toContain('function hasValidTimeSlots()');
    expect(createEventSource).not.toMatch(/!startTime\s*\|\|\s*!endTime/);
  });

  it('derives media results before rendering them', () => {
    const mediaSource = source('MediaManager.svelte');
    expect(mediaSource).toMatch(/\$:\s*filteredMedia\s*=/);
  });

  it('does not seed published demo events when an organization is empty', () => {
    const schedulerSource = source('EventScheduler.svelte');
    expect(schedulerSource).not.toContain('seedDefaultEventsIfEmpty');
    expect(schedulerSource).not.toContain('Varsity Practice & Scrimmage');
  });

  it('does not simulate or persist a connected payment processor during setup', () => {
    const setupSource = source('SetupWorkflow.svelte');
    expect(setupSource).not.toContain('connectStripe');
    expect(setupSource).not.toContain('isStripeConnected');
    expect(setupSource).not.toContain('Simulate API call');
  });

  it('does not send raw caught errors to the browser console', () => {
    const offenders = walkSvelteFiles(crmRoot).filter((file) =>
      /console\.(?:error|warn|log)\([\s\S]{0,160},\s*(?:error|err|e)\s*\)/.test(
        readFileSync(file, 'utf8'),
      ),
    );
    expect(offenders).toEqual([]);
  });

});
