import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import type { Component } from 'svelte';
import { describe, expect, it } from 'vitest';
import { compile } from '@tailwindcss/node';
import { chromium } from '@playwright/test';
import DataTableHarness from '../fixtures/DataTableHarness.svelte';

const TestedDataTableHarness = DataTableHarness as unknown as Component;

describe('DataTable production interaction contract', () => {
  it('keeps search usable and separate from export and import controls at phone widths', async () => {
    const view = render(TestedDataTableHarness);
    await fireEvent.click(screen.getByRole('button', { name: 'Search and filters' }));
    const html = view.container.innerHTML;
    const compiler = await compile('@import "tailwindcss";', { base: process.cwd(), onDependency() {} });
    const candidates = [...html.matchAll(/class="([^"]+)"/g)].flatMap(match => match[1].split(/\s+/));
    const css = compiler.build([...candidates, 'flex-1']) + '.filter-panel{padding:16px}.crm-ui-button-secondary{padding:12px;white-space:nowrap}.record-toolbar{min-width:0}';
    const browser = await chromium.launch({ headless: true });
    try {
      for (const width of [360, 375, 1280]) {
        const page = await browser.newPage({ viewport: { width, height: 752 } });
        await page.route('**/*', route => route.abort());
        await page.setContent(`<style>${css}</style><main style="padding:16px">${html}</main>`);
        // Include a normal slotted import action beside the actual controls.
        await page.getByLabel('Search table records').evaluate(input => {
          const button = document.createElement('button');
          button.textContent = 'Import participants';
          button.style.padding = '12px';
          const exportButton = input.parentElement!.parentElement!.querySelector('button')!;
          exportButton.after(button);
        });
        if (width < 640) {
          const label = page.getByLabel('Search table records').locator('..');
          const correctedClass = await label.getAttribute('class');
          await label.evaluate(element => { element.setAttribute('class', 'min-w-0 flex-1'); });
          // The old real flex sizing fails the same usable-width contract.
          expect((await page.getByLabel('Search table records').boundingBox())!.width).toBeLessThan(250);
          await label.evaluate((element, value) => { element.setAttribute('class', value!); }, correctedClass);
        }
        for (const count of ['0', '1000']) {
          await page.getByRole('button', { name: /^Export .*filtered$/ }).evaluate((button, count) => {
            button.textContent = `Export ${count} filtered`;
          }, count);
          const search = await page.getByLabel('Search table records').boundingBox();
          expect(search!.width).toBeGreaterThanOrEqual(width < 640 ? 250 : 192);
          for (const button of [page.getByRole('button', { name: /^Export .*filtered$/ }), page.getByRole('button', { name: 'Import participants' })]) {
            const box = await button.boundingBox();
            const overlaps = search!.x < box!.x + box!.width && box!.x < search!.x + search!.width && search!.y < box!.y + box!.height && box!.y < search!.y + search!.height;
            expect(overlaps).toBe(false);
          }
        }
        await page.close();
      }
    } finally { await browser.close(); }
  }, 15000);

  it('selects the current page by stable ID, preserves scope across pages, and clears after bulk mutation', async () => {
    const view = render(TestedDataTableHarness);
    await fireEvent.click(screen.getByRole('button', { name: 'Search and filters' }));
    const table = view.container.querySelector('table')!;

    await fireEvent.click(
      table.querySelector<HTMLInputElement>(
        'input[aria-label="Select all records on this page"]',
      )!,
    );
    expect(screen.getByLabelText('selected stable ids')).toHaveTextContent(
      'row-1,row-2',
    );
    expect(screen.getByRole('button', { name: 'Export 2 selected' })).toBeEnabled();

    await fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await fireEvent.click(
      table.querySelector<HTMLInputElement>(
        'input[aria-label="Select all records on this page"]',
      )!,
    );
    expect(screen.getByLabelText('selected stable ids')).toHaveTextContent(
      'row-1,row-2,row-3,row-4',
    );

    await fireEvent.click(
      screen.getByRole('button', { name: 'Complete bulk mutation' }),
    );
    expect(screen.getByLabelText('selected stable ids')).toHaveTextContent('');
    expect(screen.getByText('No records are available yet.')).toBeVisible();
  });

  it('opens and consumes a stable target on its sorted page after clearing filters', async () => {
    render(TestedDataTableHarness, {
      initialTarget: 'row-3',
      sortByAmount: true,
    });

    await waitFor(() => {
      expect(screen.getByLabelText('consumed stable target')).toHaveTextContent(
        'row-3',
      );
    });
    // Amount ascending is 0, 10, 20, 30. row-3 is therefore on page one even
    // though it is the third record in the unsorted source array.
    expect(screen.getByText('Page 1 of 2')).toBeVisible();
  });

  it('distinguishes loading, permission, error, empty, and no-results states', async () => {
    const loadingView = render(TestedDataTableHarness, { loading: true });
    expect(screen.getByText('Loading records…')).toBeVisible();
    loadingView.unmount();

    const deniedView = render(TestedDataTableHarness, { permissionDenied: true });
    expect(
      screen.getByText('You do not have permission to view these records.'),
    ).toBeVisible();
    deniedView.unmount();

    const errorView = render(TestedDataTableHarness, {
      error: 'Records failed safely.',
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Records failed safely.');
    errorView.unmount();

    render(TestedDataTableHarness);
    await fireEvent.input(screen.getByLabelText('Search table records'), {
      target: { value: 'not-a-record' },
    });
    expect(
      screen.getByText('No records match the current search or filters.'),
    ).toBeVisible();
  });

  it('reviews the selected export scope before creating a CSV', async () => {
    const view = render(TestedDataTableHarness);
    await fireEvent.click(screen.getByRole('button', { name: 'Search and filters' }));
    const table = view.container.querySelector('table')!;
    await fireEvent.click(
      table.querySelector<HTMLInputElement>('input[aria-label="Select Alpha"]')!,
    );
    await fireEvent.click(screen.getByRole('button', { name: 'Export 1 selected' }));

    const review = screen.getByRole('dialog', { name: 'Review CSV export' });
    expect(review).toHaveTextContent('1 selected record');
    expect(review).toHaveTextContent('Selected records across all table pages');
    expect(review).toHaveTextContent('Name, Amount');
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel export' }));
    expect(screen.queryByRole('dialog', { name: 'Review CSV export' })).toBeNull();
  });
});
