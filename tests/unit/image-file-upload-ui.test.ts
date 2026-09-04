import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const imageEditors = [
  'src/components/crm/events/CreateEventForm.svelte',
  'src/components/crm/events/EditEventModal.svelte',
  'src/components/crm/app-studio/BrandingControls.svelte',
];

const crmRoot = join(process.cwd(), 'src/components/crm');

function crmComponents(directory = crmRoot): string[] {
  return readdirSync(directory)
    .flatMap((entry) => {
      const file = join(directory, entry);
      return statSync(file).isDirectory()
        ? crmComponents(file)
        : file.endsWith('.svelte')
          ? [file]
          : [];
    });
}

describe('CRM image selection controls', () => {
  it.each(imageEditors)('%s uses file selection and exposes no image URL input', (file) => {
    const source = readFileSync(file, 'utf8');
    expect(source).toContain('ImageFilePicker');
    expect(source).not.toMatch(/type=["']url["']/i);
    expect(source).not.toMatch(/paste\s+(?:an?\s+)?image\s+url/i);
    expect(source).not.toMatch(/uploads are unavailable/i);
  });

  it.each([
    'src/components/crm/seasons/CreateSeasonModal.svelte',
    'src/components/crm/seasons/EditSeasonModal.svelte',
  ])('%s explains the unsupported banner capability before file selection', (file) => {
    const source = readFileSync(file, 'utf8');
    expect(source).not.toMatch(/type=["']file["']/i);
    expect(source).toMatch(/banner[\s\S]{0,220}(?:disabled|managed from Media)/i);
  });

  it('keeps image URL entry out of every CRM component and workflow', () => {
    const forbidden = [
      /(?:image|logo|photo|avatar|banner|cover)\s+(?:url|link)/i,
      /(?:url|link)\s+(?:for|to)\s+(?:an?\s+)?(?:image|logo|photo|avatar|banner|cover)/i,
      /uploads are unavailable/i,
      /approved\s+https[^\n]{0,40}(?:image|logo|photo|avatar|banner|cover)/i,
      /<input\b(?:(?!>).){0,800}bind:value=\{(?:image|logo|photo|avatar|banner|cover)Url\}(?:(?!>).)*>/is,
    ];
    const failures = crmComponents().flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      return forbidden
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relative(crmRoot, file)}: ${pattern}`);
    });

    expect(failures).toEqual([]);
  });
});
