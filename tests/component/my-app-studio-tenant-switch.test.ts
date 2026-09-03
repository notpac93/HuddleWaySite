import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/svelte';
import type { Component } from 'svelte';
import type { Writable } from 'svelte/store';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type SnapshotSubscription = {
  collectionName: string;
  tenantId: string;
  next: (snapshot: any) => void;
  error: (reason: unknown) => void;
};

const snapshotSubscriptions: SnapshotSubscription[] = [];
const appMocks = vi.hoisted(() => ({
  appConfiguration: vi.fn(),
  appConfigurationHistory: vi.fn(),
  publishAppConfiguration: vi.fn(),
  uploadImageAsset: vi.fn(),
}));

vi.mock('../../src/lib/firebase', () => ({
  db: {},
}));

vi.mock('../../src/lib/authStore', async () => {
  const { writable } = await import('svelte/store');
  return {
    tenantIdStore: writable('tenant-a'),
    tenantNamesStore: writable({
      'tenant-a': 'Alpha organization',
      'tenant-b': 'Beta organization',
    }),
  };
});

vi.mock('../../src/lib/api/backendClient', () => ({
  backendClient: appMocks,
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, collectionName: string) => ({
    kind: 'collection',
    collectionName,
  })),
  limit: vi.fn((value: number) => ({ kind: 'limit', value })),
  onSnapshot: vi.fn((
    queryValue: { parts: any[] },
    next: (snapshot: any) => void,
    error: (reason: unknown) => void,
  ) => {
    const collectionName =
      queryValue.parts.find((part) => part.kind === 'collection')?.collectionName;
    const tenantId =
      queryValue.parts.find(
        (part) => part.kind === 'where' && part.field === 'tenantId',
      )?.value;
    snapshotSubscriptions.push({
      collectionName,
      tenantId,
      next,
      error,
    });
    return vi.fn();
  }),
  orderBy: vi.fn((field: string, direction: string) => ({
    kind: 'orderBy',
    field,
    direction,
  })),
  query: vi.fn((...parts: any[]) => ({ parts })),
  where: vi.fn((field: string, operator: string, value: unknown) => ({
    kind: 'where',
    field,
    operator,
    value,
  })),
}));

import { tenantIdStore } from '../../src/lib/authStore';
import { BackendApiError } from '../../src/lib/api/BackendApi';
import MyAppStudio from '../../src/components/crm/MyAppStudio.svelte';

const TestedMyAppStudio = MyAppStudio as unknown as Component;
const tenants = tenantIdStore as Writable<string | null>;
const configNames = new Map<string, string>();
const configLogos = new Map<string, string>();
const previewOrigin = process.env.PUBLIC_FIREBASE_PROJECT_ID === 'sports-team-apps'
  ? 'https://huddleway-app-preview-prod.web.app'
  : 'https://huddleway-app-preview-canary.web.app';

function configurationSnapshot(tenantId: string) {
  return {
    tenantId,
    mode: 'update' as const,
    configVersion: 3,
    publishedAt: '2026-07-01T12:00:00.000Z',
    publishedBy: 'owner-1',
    versionToken: `version-${tenantId}-${configNames.get(tenantId)}`,
    configuration: {
      name: configNames.get(tenantId)
        || (tenantId === 'tenant-a' ? 'Alpha League' : 'Beta League'),
      primaryColor: '#112233',
      secondaryColor: '#223344',
      tertiaryColor: '#ffffff',
      logoUrl: configLogos.get(tenantId) || 'https://cdn.example.test/logo.png',
      navigationTabs: [
        {
          key: 'home',
          pageId: 'home_page',
          route: '/',
          label: 'Home',
          enabled: true,
        },
        {
          key: 'teams',
          pageId: 'teams_page',
          route: '/teams',
          label: 'Teams',
          enabled: true,
        },
        {
          key: 'events',
          pageId: 'events_page',
          route: '/events',
          label: 'Events',
          enabled: true,
        },
        {
          key: 'messaging',
          pageId: 'board_page',
          route: '/messaging',
          label: 'Board',
          enabled: true,
        },
        {
          key: 'schedule',
          pageId: 'schedule_page',
          route: '/schedule',
          label: 'Schedule',
          enabled: true,
        },
      ],
    },
    requestId: `request-${tenantId}`,
  };
}

function publishResult() {
  return {
    success: true,
    operationId: 'configuration-operation',
    idempotentReplay: false,
    requestId: 'publish-request',
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function subscription(collectionName: string, tenantId: string) {
  const result = snapshotSubscriptions.find(
    (entry) =>
      entry.collectionName === collectionName && entry.tenantId === tenantId,
  );
  if (!result) throw new Error(`Missing ${collectionName} subscription for ${tenantId}`);
  return result;
}

function rosterSnapshot(name: string) {
  return {
    docs: [{
      id: `registration-${name}`,
      data: () => ({ participantSummary: { fullName: name } }),
    }],
  };
}

function eventSnapshot(title: string) {
  return {
    empty: false,
    docs: [{
      id: `event-${title}`,
      data: () => ({
        title,
        date: { toDate: () => new Date('2026-08-01T17:00:00.000Z') },
        location: 'Field 1',
      }),
    }],
  };
}

async function findTenantPreview(name: string) {
  await waitFor(() => {
    expect(screen.getByLabelText('App Name')).toHaveValue(name);
    expect(screen.getByTitle(`${name} mobile app preview`)).toBeInTheDocument();
  }, { timeout: 5000 });
  return screen.getByTitle(`${name} mobile app preview`);
}

async function reviewAndPublish(buttonName: 'Publish App' | 'Retry Publish' = 'Publish App') {
  await fireEvent.click(screen.getByRole('button', { name: buttonName }));
  const review = await screen.findByRole('dialog', { name: 'Review family app publication' });
  expect(within(review).getByRole('list').children.length).toBeGreaterThan(0);
  expect(within(review).queryByText(/No publishable changes were detected/)).toBeNull();
  await fireEvent.click(screen.getByRole('checkbox', {
    name: /I confirm these changes should be published/,
  }));
  await fireEvent.click(screen.getByRole('button', { name: 'Confirm and publish' }));
  return review;
}

describe('MyAppStudio tenant preview isolation', () => {
  beforeEach(() => {
    snapshotSubscriptions.length = 0;
    configNames.clear();
    configLogos.clear();
    tenants.set('tenant-a');
    appMocks.appConfiguration.mockReset();
    appMocks.appConfiguration.mockImplementation(
      async (tenantId: string) => configurationSnapshot(tenantId),
    );
    appMocks.appConfigurationHistory.mockReset();
    appMocks.appConfigurationHistory.mockResolvedValue({
      tenantId: 'tenant-a',
      versions: [],
      truncated: false,
      requestId: 'history-request',
    });
    appMocks.publishAppConfiguration.mockReset();
    appMocks.publishAppConfiguration.mockImplementation(
      async (
        tenantId: string,
        data: { name: string; logoUrl: string | null },
      ) => {
        configNames.set(tenantId, data.name);
        if (data.logoUrl) configLogos.set(tenantId, data.logoUrl);
        return publishResult();
      },
    );
    appMocks.uploadImageAsset.mockReset();
  });

  it('fails closed when logo publication has no approved private-media contract', async () => {
    render(TestedMyAppStudio);
    expect(await screen.findByLabelText('Logo')).toBeDisabled();
    expect(screen.getByText(/Logo replacement is temporarily unavailable/)).toBeVisible();
    expect(appMocks.uploadImageAsset).not.toHaveBeenCalled();
    expect(appMocks.publishAppConfiguration).not.toHaveBeenCalled();
  });

  it('rebuilds the Flutter preview URL when the selected tenant changes', async () => {
    render(TestedMyAppStudio);
    const alphaPreview = await findTenantPreview('Alpha League');
    expect(alphaPreview).toHaveAttribute(
      'src',
      expect.stringContaining('forcedTenant=tenant-a'),
    );

    await act(async () => {
      tenants.set('tenant-b');
    });
    const betaPreview = await findTenantPreview('Beta League');
    expect(betaPreview).toHaveAttribute(
      'src',
      expect.stringContaining('forcedTenant=tenant-b'),
    );
    expect(screen.queryByTitle('Alpha League mobile app preview')).toBeNull();
  });

  it('streams unsaved branding changes to the selected tenant preview', async () => {
    render(TestedMyAppStudio);
    const preview = await findTenantPreview('Alpha League') as HTMLIFrameElement;
    const postMessage = vi.spyOn(preview.contentWindow!, 'postMessage');

    await fireEvent.load(preview);
    await fireEvent.input(screen.getByLabelText('App Name'), {
      target: { value: 'Alpha League Draft' },
    });
    await fireEvent.input(screen.getByLabelText('Primary brand color hex value'), {
      target: { value: '#ABCDEF' },
    });

    await waitFor(() => {
      expect(postMessage).toHaveBeenCalled();
    });
    const matchingCall = postMessage.mock.calls
      .map(([payload, targetOrigin]) => ({
        payload: typeof payload === 'string' ? JSON.parse(payload) : payload,
        targetOrigin,
      }))
      .find(({ payload }) =>
        payload?.configuration?.name === 'Alpha League Draft'
        && payload?.configuration?.primaryColor === '#ABCDEF');
    expect(matchingCall).toMatchObject({
      targetOrigin: previewOrigin,
      payload: {
        type: 'huddleway.crm.preview.update',
        tenantId: 'tenant-a',
        configuration: {
          name: 'Alpha League Draft',
          primaryColor: '#ABCDEF',
        },
      },
    });
    expect(screen.getByRole('button', { name: 'Publish App' }).getAttribute('style') || '')
      .not.toContain('#ABCDEF');
    expect(screen.getByLabelText('Primary brand color hex value').getAttribute('style') || '')
      .not.toContain('#ABCDEF');
    expect(appMocks.publishAppConfiguration).not.toHaveBeenCalled();
  });

  it('renames and hides app tabs through the published navigation contract', async () => {
    let navigationTabs = [
      { key: 'home', pageId: 'home_page', route: '/', label: 'Home', enabled: true },
      { key: 'teams', pageId: 'teams_page', route: '/teams', label: 'Teams', enabled: true },
      { key: 'events', pageId: 'events_page', route: '/events', label: 'Events', enabled: true },
      { key: 'messaging', pageId: 'board_page', route: '/messaging', label: 'Board', enabled: true },
      { key: 'schedule', pageId: 'schedule_page', route: '/schedule', label: 'Schedule', enabled: true },
    ];
    appMocks.appConfiguration.mockImplementation(async (tenantId: string) => ({
      ...configurationSnapshot(tenantId),
      configuration: {
        ...configurationSnapshot(tenantId).configuration,
        navigationTabs,
      },
    }));
    appMocks.publishAppConfiguration.mockImplementationOnce(
      async (_tenantId: string, data: { navigationTabs: typeof navigationTabs }) => {
        navigationTabs = data.navigationTabs;
        return publishResult();
      },
    );
    render(TestedMyAppStudio);

    await fireEvent.click(await screen.findByRole('button', { name: 'Pages' }));
    expect(screen.getByText('5 of 5 active')).toBeVisible();
    await fireEvent.input(screen.getByLabelText('Tab name for Home'), {
      target: { value: 'Start' },
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Hide Teams tab' }));
    expect(screen.getByText('4 of 5 active')).toBeVisible();
    await reviewAndPublish();

    expect(
      await screen.findByText(
        'App configuration published and reloaded from the server.',
      ),
    ).toBeVisible();
    expect(appMocks.publishAppConfiguration).toHaveBeenCalledWith(
      'tenant-a',
      expect.objectContaining({
        navigationTabs: expect.arrayContaining([
          expect.objectContaining({ key: 'home', label: 'Start', enabled: true }),
          expect.objectContaining({ key: 'teams', label: 'Teams', enabled: false }),
        ]),
      }),
      expect.any(String),
      expect.any(String),
    );
  });

  it('uses tenant-neutral permanent names for legacy team tabs', async () => {
    appMocks.appConfiguration.mockImplementation(async (tenantId: string) => ({
      ...configurationSnapshot(tenantId),
      configuration: {
        ...configurationSnapshot(tenantId).configuration,
        navigationTabs: [
          { key: 'home', pageId: 'home_page', route: '/', label: 'Home', enabled: true },
          { key: 'esports', pageId: 'esports_page', route: '/team-esports', label: 'Esports', enabled: true },
          { key: 'schedule', pageId: 'schedule_page', route: '/schedule', label: 'Schedule', enabled: true },
          { key: 'messaging', pageId: 'board_page', route: '/messaging', label: 'Board', enabled: true },
        ],
      },
    }));
    render(TestedMyAppStudio);

    await fireEvent.click(await screen.findByRole('button', { name: 'Pages' }));
    expect(screen.getAllByLabelText(/Tab name for/)).toHaveLength(5);
    expect(screen.getByRole('heading', { name: 'Teams' })).toBeVisible();
    expect(screen.getByLabelText('Tab name for Teams')).toHaveValue('Esports');
    expect(screen.queryByRole('heading', { name: 'Esports' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Events' })).toBeVisible();
    expect(screen.getByLabelText('Tab name for Events')).toHaveValue('Events');
    expect(screen.queryByText(/Route:/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Hide Events tab' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText('5 of 5 active')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Publish App' })).toBeEnabled();
  });

  it('blocks publication when more than five app tabs are active', async () => {
    appMocks.appConfiguration.mockImplementation(async (tenantId: string) => ({
      ...configurationSnapshot(tenantId),
      configuration: {
        ...configurationSnapshot(tenantId).configuration,
        navigationTabs: [
          { key: 'home', pageId: 'home_page', route: '/', label: 'Home', enabled: true },
          { key: 'teams', pageId: 'teams_page', route: '/teams', label: 'Teams', enabled: true },
          { key: 'events', pageId: 'events_page', route: '/events', label: 'Events', enabled: true },
          { key: 'messaging', pageId: 'board_page', route: '/messaging', label: 'Board', enabled: true },
          { key: 'schedule', pageId: 'schedule_page', route: '/schedule', label: 'Schedule', enabled: true },
          { key: 'staff', pageId: 'staff_page', route: '/staff', label: 'Staff', enabled: true },
        ],
      },
    }));
    render(TestedMyAppStudio);

    await fireEvent.click(await screen.findByRole('button', { name: 'Pages' }));
    expect(screen.getByText('6 of 5 active')).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The app can show up to five tabs.',
    );
    expect(screen.getByRole('button', { name: 'Publish App' })).toBeDisabled();

    await fireEvent.click(screen.getByRole('button', { name: 'Hide Staff tab' }));
    expect(screen.getByText('5 of 5 active')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Publish App' })).toBeEnabled();
  });

  it('resends the authoritative draft after the selected tenant preview is ready', async () => {
    render(TestedMyAppStudio);
    const preview = await findTenantPreview('Alpha League') as HTMLIFrameElement;
    const postMessage = vi.spyOn(preview.contentWindow!, 'postMessage');

    window.dispatchEvent(new MessageEvent('message', {
      origin: previewOrigin,
      source: preview.contentWindow,
      data: JSON.stringify({
        type: 'huddleway.crm.preview.ready',
        tenantId: 'tenant-a',
      }),
    }));

    await waitFor(() => {
      expect(postMessage).toHaveBeenCalledWith(
        expect.stringContaining('"name":"Alpha League"'),
        previewOrigin,
      );
    });

    window.dispatchEvent(new MessageEvent('message', {
      origin: previewOrigin,
      source: preview.contentWindow,
      data: JSON.stringify({
        type: 'huddleway.crm.preview.applied',
        tenantId: 'tenant-a',
      }),
    }));
    expect(await screen.findByText(/375 × 812 · Synced/)).toBeVisible();
  });

  it('locks the reviewed configuration, publishes once, and verifies readback', async () => {
    const pending = deferred<void>();
    appMocks.publishAppConfiguration.mockImplementationOnce(
      async (
        tenantId: string,
        data: { name: string },
      ) => {
        await pending.promise;
        configNames.set(tenantId, data.name);
        return publishResult();
      },
    );
    render(TestedMyAppStudio);
    const nameInput = await screen.findByLabelText('App Name');
    expect(screen.getByAltText('Logo preview')).toHaveAttribute(
      'src',
      'https://cdn.example.test/logo.png',
    );
    await fireEvent.input(nameInput, {
      target: { value: 'Alpha League Updated' },
    });
    const publish = screen.getByRole('button', { name: 'Publish App' });
    await fireEvent.click(publish);
    expect(appMocks.publishAppConfiguration).not.toHaveBeenCalled();
    await fireEvent.click(screen.getByRole('checkbox', {
      name: /I confirm these changes should be published/,
    }));
    await fireEvent.click(screen.getByRole('button', { name: 'Confirm and publish' }));

    expect(appMocks.publishAppConfiguration).toHaveBeenCalledTimes(1);
    expect(nameInput).toBeDisabled();
    expect(screen.getByLabelText('Primary brand color')).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Publishing...' }),
    ).toBeDisabled();
    pending.resolve();

    expect(
      await screen.findByText(
        'App configuration published and reloaded from the server.',
      ),
    ).toBeVisible();
    expect(nameInput).toHaveValue('Alpha League Updated');
    expect(appMocks.appConfiguration).toHaveBeenCalledTimes(2);
  });

  it('accepts canonical lowercase colors in the authoritative readback', async () => {
    let secondaryColor = '#223344';
    appMocks.appConfiguration.mockImplementation(async (tenantId: string) => ({
      ...configurationSnapshot(tenantId),
      configuration: {
        ...configurationSnapshot(tenantId).configuration,
        secondaryColor,
      },
    }));
    appMocks.publishAppConfiguration.mockImplementationOnce(
      async (_tenantId: string, data: { secondaryColor: string }) => {
        secondaryColor = data.secondaryColor.toLowerCase();
        return publishResult();
      },
    );
    render(TestedMyAppStudio);

    await fireEvent.input(
      await screen.findByLabelText('Secondary brand color hex value'),
      { target: { value: '#AABBCC' } },
    );
    await reviewAndPublish();

    expect(
      await screen.findByText(
        'App configuration published and reloaded from the server.',
      ),
    ).toBeVisible();
    expect(screen.queryByText(/server readback did not match/i)).toBeNull();
    expect(screen.getByLabelText('Secondary brand color hex value')).toHaveValue(
      '#aabbcc',
    );
  });

  it('masks publish failures and reuses the same key on unchanged retry', async () => {
    appMocks.publishAppConfiguration.mockRejectedValueOnce(
      new BackendApiError({
        message: 'raw provider detail',
        status: 503,
        code: 'publish_failed',
        requestId: 'publish-support-8',
      }),
    );
    render(TestedMyAppStudio);
    await fireEvent.input(await screen.findByLabelText('App Name'), {
      target: { value: 'Alpha League Retitled' },
    });
    await reviewAndPublish();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'The app configuration could not be published.',
    );
    expect(alert).not.toHaveTextContent('publish-support-8');
    expect(alert).not.toHaveTextContent('raw provider detail');

    await reviewAndPublish('Retry Publish');
    await screen.findByText(
      'App configuration published and reloaded from the server.',
    );
    expect(appMocks.publishAppConfiguration).toHaveBeenCalledTimes(2);
    expect(
      appMocks.publishAppConfiguration.mock.calls[1][3],
    ).toBe(appMocks.publishAppConfiguration.mock.calls[0][3]);
  });

  it('rejects a mismatched readback and clears a pending prior tenant publish', async () => {
    appMocks.publishAppConfiguration.mockResolvedValueOnce(publishResult());
    render(TestedMyAppStudio);
    await fireEvent.input(await screen.findByLabelText('App Name'), {
      target: { value: 'Not Persisted' },
    });
    await reviewAndPublish();
    expect(
      await screen.findByText(/server readback did not match/i),
    ).toBeVisible();

    const pending = deferred<ReturnType<typeof publishResult>>();
    appMocks.publishAppConfiguration.mockReturnValueOnce(pending.promise);
    await fireEvent.input(screen.getByLabelText('App Name'), {
      target: { value: 'Pending Tenant A' },
    });
    await reviewAndPublish();
    await act(async () => {
      tenants.set('tenant-b');
    });
    expect(await screen.findByDisplayValue('Beta League')).toBeVisible();
    pending.resolve(publishResult());
    await pending.promise;
    expect(screen.getByLabelText('App Name')).toHaveValue('Beta League');
    expect(screen.getByRole('button', { name: 'Publish App' })).toBeDisabled();
  });

  it('loads a prior published version as an unpublished rollback draft', async () => {
    appMocks.appConfigurationHistory.mockResolvedValue({
      tenantId: 'tenant-a',
      versions: [{
        id: 'tenant-a__00000002',
        configVersion: 2,
        publishedAt: '2026-06-01T12:00:00.000Z',
        publishedBy: 'editor-2',
        auditReason: 'Published reviewed app configuration.',
        configuration: {
          ...configurationSnapshot('tenant-a').configuration,
          name: 'Alpha League Classic',
        },
      }],
      truncated: false,
      requestId: 'history-request',
    });
    render(TestedMyAppStudio);
    await findTenantPreview('Alpha League');
    await fireEvent.click(screen.getByRole('button', { name: 'Version history' }));

    expect(await screen.findByText('Version 2')).toBeVisible();
    await fireEvent.click(screen.getByRole('button', { name: 'Use as rollback draft' }));
    expect(screen.getByLabelText('App Name')).toHaveValue('Alpha League Classic');
    expect(screen.getByText(
      /Version 2 is loaded as an unpublished rollback draft/,
    )).toBeVisible();
    expect(screen.getByRole('button', { name: 'Publish App' })).toBeEnabled();
  });
});
