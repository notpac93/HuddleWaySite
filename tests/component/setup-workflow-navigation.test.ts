import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/svelte';
import type { Component } from 'svelte';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: { currentUser: { uid: 'owner-user' } as { uid: string } | null },
  bootstrapOrganization: vi.fn(),
}));

vi.mock('../../src/lib/firebase', () => ({ auth: mocks.auth }));

vi.mock('../../src/lib/api/backendClient', () => ({
  backendClient: {
    bootstrapOrganization: mocks.bootstrapOrganization,
  },
}));

import { backendClient } from '../../src/lib/api/backendClient';
import { BackendApiError } from '../../src/lib/api/BackendApi';
import SetupWorkflow from '../../src/components/crm/SetupWorkflow.svelte';

const TestedSetupWorkflow = SetupWorkflow as unknown as Component;

async function reachReview(teamName = 'Tigers') {
  await fireEvent.input(screen.getByLabelText('Organization name'), {
    target: { value: 'Youth Soccer' },
  });
  await fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await fireEvent.input(screen.getByLabelText('Team Name'), {
    target: { value: teamName },
  });
  await fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await fireEvent.click(
    screen.getByRole('button', { name: 'Skip payment setup' }),
  );
}

describe('SetupWorkflow corrective navigation and retries', () => {
  beforeEach(() => {
    mocks.auth.currentUser = { uid: 'owner-user' };
    vi.mocked(backendClient.bootstrapOrganization).mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('keeps the operation key stable for a retry and rotates it after corrected input', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(backendClient.bootstrapOrganization).mockRejectedValue(
      new Error('Simulated setup failure'),
    );
    render(TestedSetupWorkflow);
    await reachReview();

    await fireEvent.click(screen.getByRole('button', { name: 'Create organization' }));
    await screen.findByRole('alert');
    await fireEvent.click(screen.getByRole('button', { name: 'Create organization' }));
    await screen.findByRole('alert');

    const bootstrapMock = vi.mocked(backendClient.bootstrapOrganization);
    expect(bootstrapMock).toHaveBeenCalledTimes(2);
    const firstKey = bootstrapMock.mock.calls[0][1];
    const retryKey = bootstrapMock.mock.calls[1][1];
    expect(retryKey).toBe(firstKey);

    await fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('Payments setup')).toBeVisible();
    await fireEvent.click(
      screen.getByRole('button', { name: 'Back to team details' }),
    );
    await fireEvent.input(screen.getByLabelText('Team Name'), {
      target: { value: 'Falcons' },
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await fireEvent.click(
      screen.getByRole('button', { name: 'Skip payment setup' }),
    );
    await fireEvent.click(screen.getByRole('button', { name: 'Create organization' }));
    await screen.findByRole('alert');

    expect(bootstrapMock).toHaveBeenCalledTimes(3);
    expect(bootstrapMock.mock.calls[2][1]).not.toBe(firstKey);
  });

  it('makes the free boundary explicit and sends no payment activation state', async () => {
    render(TestedSetupWorkflow);

    expect(
      screen.getByText(
        'Program creation and administration are free. No payment method is required.',
      ),
    ).toBeVisible();
    await fireEvent.input(screen.getByLabelText('Organization name'), {
      target: { value: 'Youth Soccer' },
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await fireEvent.input(screen.getByLabelText('Team Name'), {
      target: { value: 'Tigers' },
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(
      screen.getByText(
        'Payment processing is optional. Connect Stripe later only if your program chooses to collect participant fees.',
      ),
    ).toBeVisible();
    expect(
      screen.getByText(
        'Free setup does not connect a payment account or charge an activation fee.',
      ),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Skip payment setup' }),
    ).toBeEnabled();
  });

  it('submits the exact bootstrap payload once and renders server readiness evidence', async () => {
    let resolveBootstrap:
      | ((value: Awaited<ReturnType<typeof backendClient.bootstrapOrganization>>) => void)
      | undefined;
    vi.mocked(backendClient.bootstrapOrganization).mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveBootstrap = resolve;
      }),
    );
    render(TestedSetupWorkflow);
    await reachReview('Tigers');

    const createButton = screen.getByRole('button', {
      name: 'Create organization',
    });
    await fireEvent.click(createButton);
    await fireEvent.click(createButton);

    expect(backendClient.bootstrapOrganization).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', {
      name: 'Creating organization…',
    })).toBeDisabled();
    const [payload, operationKey] =
      vi.mocked(backendClient.bootstrapOrganization).mock.calls[0];
    expect(operationKey).toMatch(/^web_/);
    expect(payload).toEqual({
      tenantId: 'youth-soccer',
      programName: 'Youth Soccer',
      ownerInviteEmail: '',
      domains: [],
      branding: {
        logoUrl: '',
        colors: {
          primary: '#003366',
          secondary: '#C6A95B',
          accent: '#FFFFFF',
        },
        pageLabels: {},
      },
      runtimeConfig: {
        defaultTeamId: 'tigers',
        onboardingMode: 'self-service',
        features: {
          registration_enabled: false,
          wall_enabled: false,
          show_coaches: false,
        },
        registration: {
          enabled: false,
          requirePaymentBeforeSubmit: false,
        },
        teams: [{
          teamId: 'tigers',
          name: 'Tigers',
          label: 'Tigers',
          addAsPage: true,
        }],
      },
    });

    resolveBootstrap?.({
      tenantId: 'youth-soccer',
      programName: 'Youth Soccer',
      readiness: {
        state: 'needs_action',
        launchReady: false,
        blockers: ['Connect Stripe before enabling payment collection.'],
        checks: { paymentAccount: false },
      },
      seeded: {
        teams: ['tigers'],
        primaryEvents: 0,
        pages: 4,
        contentBlocks: 8,
        domains: 0,
        brandingDoc: true,
        runtimeConfigDoc: true,
      },
      idempotentReplay: false,
      requestId: 'bootstrap-request',
    });

    expect(
      await screen.findByRole('heading', { name: 'Organization created' }),
    ).toBeVisible();
    expect(
      screen.getByText('Server readiness:').closest('p'),
    ).toHaveTextContent('Server readiness: needs_action');
    expect(
      screen.getByText('Connect Stripe before enabling payment collection.'),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Continue to dashboard' }),
    ).toBeEnabled();
  });

  it('blocks submission when the authenticated user disappears', async () => {
    mocks.auth.currentUser = null;
    render(TestedSetupWorkflow);
    await reachReview();

    await fireEvent.click(
      screen.getByRole('button', { name: 'Create organization' }),
    );

    expect(backendClient.bootstrapOrganization).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Sign in is required to create an organization.',
    );
  });

  it('surfaces safe backend correlation and never accepts a mismatched tenant', async () => {
    const bootstrapMock = vi.mocked(backendClient.bootstrapOrganization);
    bootstrapMock
      .mockRejectedValueOnce(
        new BackendApiError({
          message: 'That organization name is already in use.',
          status: 409,
          code: 'tenant_exists',
          requestId: 'setup-conflict-request',
        }),
      )
      .mockResolvedValueOnce({
        tenantId: 'another-tenant',
        programName: 'Youth Soccer',
        readiness: {
          state: 'ready',
          launchReady: true,
          blockers: [],
          checks: {},
        },
        seeded: {
          teams: ['tigers'],
          primaryEvents: 0,
          pages: 4,
          contentBlocks: 8,
          domains: 0,
          brandingDoc: true,
          runtimeConfigDoc: true,
        },
        idempotentReplay: false,
        requestId: 'wrong-tenant-request',
      });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(TestedSetupWorkflow);
    await reachReview();

    await fireEvent.click(
      screen.getByRole('button', { name: 'Create organization' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That organization name is already in use.',
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Support request: setup-conflict-request',
    );

    await fireEvent.click(
      screen.getByRole('button', { name: 'Create organization' }),
    );
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Organization setup could not be completed.',
      );
    });
    expect(
      screen.queryByRole('heading', { name: 'Organization created' }),
    ).not.toBeInTheDocument();
  });
});
