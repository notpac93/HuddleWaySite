import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import type { Component } from 'svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const backendMocks = vi.hoisted(() => ({
  financialPeriods: vi.fn(),
  previewFinancialPeriod: vi.fn(),
  closeFinancialPeriod: vi.fn(),
  reopenFinancialPeriod: vi.fn(),
}));

vi.mock('../../src/lib/api/backendClient', () => ({
  backendClient: backendMocks,
}));

import FinancialPeriodManager from '../../src/components/crm/FinancialPeriodManager.svelte';

const TestedFinancialPeriodManager =
  FinancialPeriodManager as unknown as Component;

const completePreview = {
  startDate: '2026-01-01',
  endDate: '2026-02-01',
  collections: {
    transactions: { count: 2, totalCents: 25_000, truncated: false },
    refunds: { count: 1, totalCents: 2_500, truncated: false },
  },
  truncated: false,
};

describe('financial period manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    backendMocks.financialPeriods.mockResolvedValue({
      tenantId: 'fixture-tenant',
      periods: [],
      truncated: false,
      limit: 100,
      requestId: 'period-list-request',
    });
    backendMocks.previewFinancialPeriod.mockResolvedValue({
      tenantId: 'fixture-tenant',
      preview: completePreview,
      requestId: 'period-preview-request',
    });
    backendMocks.closeFinancialPeriod.mockResolvedValue({
      success: true,
      idempotentReplay: false,
      periodId: 'period-1',
      status: 'closed',
      preview: completePreview,
      requestId: 'period-close-request',
    });
  });

  it('requires a current complete preview, reason, and typed confirmation before close', async () => {
    render(TestedFinancialPeriodManager, {
      tenantId: 'fixture-tenant',
    });
    await screen.findByText(
      'No financial periods have been recorded for this organization.',
    );

    await fireEvent.input(screen.getByLabelText('Period label'), {
      target: { value: 'January 2026' },
    });
    await fireEvent.input(screen.getByLabelText('Start date (included)'), {
      target: { value: '2026-01-01' },
    });
    await fireEvent.input(screen.getByLabelText('End date (excluded)'), {
      target: { value: '2026-02-01' },
    });
    await fireEvent.click(
      screen.getByRole('button', { name: 'Preview' }),
    );

    expect(await screen.findByText('Preview complete')).toBeInTheDocument();
    const closeButton = screen.getByRole('button', {
      name: 'Close',
    });
    expect(closeButton).toBeDisabled();

    await fireEvent.input(screen.getByLabelText('Audit reason'), {
      target: { value: 'Month-end reconciliation is complete.' },
    });
    await fireEvent.input(
      screen.getByLabelText(/Type CLOSE FINANCIAL PERIOD/),
      { target: { value: 'CLOSE FINANCIAL PERIOD' } },
    );
    expect(closeButton).toBeEnabled();
    await fireEvent.click(closeButton);

    await waitFor(() => {
      expect(backendMocks.closeFinancialPeriod).toHaveBeenCalledTimes(1);
    });
    expect(backendMocks.closeFinancialPeriod).toHaveBeenCalledWith(
      'fixture-tenant',
      {
        label: 'January 2026',
        startDate: '2026-01-01',
        endDate: '2026-02-01',
      },
      'Month-end reconciliation is complete.',
      expect.stringContaining('financial-period-close:'),
    );
    expect(
      await screen.findByText(/Financial period closed/),
    ).toBeInTheDocument();
  });

  it('hard-blocks close when any preview collection is truncated', async () => {
    backendMocks.previewFinancialPeriod.mockResolvedValue({
      tenantId: 'fixture-tenant',
      preview: {
        ...completePreview,
        collections: {
          ...completePreview.collections,
          transactions: {
            count: 1000,
            totalCents: 1_000_000,
            truncated: true,
          },
        },
        truncated: true,
      },
      requestId: 'truncated-preview-request',
    });
    render(TestedFinancialPeriodManager, {
      tenantId: 'fixture-tenant',
    });

    await fireEvent.input(screen.getByLabelText('Period label'), {
      target: { value: 'Busy period' },
    });
    await fireEvent.input(screen.getByLabelText('Start date (included)'), {
      target: { value: '2026-01-01' },
    });
    await fireEvent.input(screen.getByLabelText('End date (excluded)'), {
      target: { value: '2026-02-01' },
    });
    await fireEvent.click(
      screen.getByRole('button', { name: 'Preview' }),
    );

    expect(
      await screen.findByText('Preview incomplete — closing is blocked'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Close' }),
    ).toBeNull();
    expect(backendMocks.closeFinancialPeriod).not.toHaveBeenCalled();
  });

  it('reopens only after an audited typed confirmation', async () => {
    backendMocks.financialPeriods
      .mockResolvedValueOnce({
        tenantId: 'fixture-tenant',
        periods: [
          {
            id: 'period-1',
            label: 'January 2026',
            startDate: '2026-01-01',
            endDate: '2026-02-01',
            status: 'closed',
            closedAt: '2026-02-02T00:00:00.000Z',
            reopenedAt: null,
            updatedAt: '2026-02-02T00:00:00.000Z',
          },
        ],
        truncated: false,
        limit: 100,
        requestId: 'period-list-request',
      })
      .mockResolvedValue({
        tenantId: 'fixture-tenant',
        periods: [],
        truncated: false,
        limit: 100,
        requestId: 'period-list-after-reopen',
      });
    backendMocks.reopenFinancialPeriod.mockResolvedValue({
      success: true,
      idempotentReplay: false,
      periodId: 'period-1',
      status: 'reopened',
      requestId: 'period-reopen-request',
    });
    render(TestedFinancialPeriodManager, {
      tenantId: 'fixture-tenant',
    });

    await fireEvent.click(
      await screen.findByRole('button', { name: 'Review' }),
    );
    const reopenButton = screen.getByRole('button', {
      name: 'Reopen',
    });
    expect(reopenButton).toBeDisabled();
    await fireEvent.input(screen.getByLabelText('Audit reason'), {
      target: { value: 'A correction is required.' },
    });
    await fireEvent.input(
      screen.getByLabelText(/Type REOPEN FINANCIAL PERIOD/),
      { target: { value: 'REOPEN FINANCIAL PERIOD' } },
    );
    await fireEvent.click(reopenButton);

    await waitFor(() => {
      expect(backendMocks.reopenFinancialPeriod).toHaveBeenCalledTimes(1);
    });
    expect(backendMocks.reopenFinancialPeriod).toHaveBeenCalledWith(
      'fixture-tenant',
      'period-1',
      'A correction is required.',
      expect.stringContaining('financial-period-reopen:'),
    );
  });
});
