import {
  BackendApiError,
  type CrmAppConfiguration,
  type CrmAppConfigurationSnapshot,
} from '../../../lib/api/BackendApi';
import { backendClient } from '../../../lib/api/backendClient';
import type { AppVersion } from './appConfigurationDraft';

export type SavedAppStudioDraft = {
  versionToken: string;
  savedAt: string;
  configuration: CrmAppConfiguration;
};

export type ConfigurationLoadResult =
  | { status: 'ready'; snapshot: CrmAppConfigurationSnapshot }
  | { status: 'stale' }
  | {
      status: 'error';
      loadState: 'error' | 'permission';
      message: string;
      requestId: string;
    };

export type HistoryLoadResult =
  | { status: 'ready'; versions: AppVersion[]; truncated: boolean }
  | { status: 'stale' | 'error' };

export type PublishResult =
  | { status: 'published' }
  | { status: 'stale' }
  | { status: 'conflict'; requestId: string }
  | { status: 'error'; requestId: string };

type AppStudioApi = Pick<
  typeof backendClient,
  | 'appConfiguration'
  | 'appConfigurationHistory'
  | 'publishAppConfiguration'
  | 'publishBrandingLogo'
  | 'uploadImageAsset'
>;

function loadMessage(error: unknown) {
  const code = String((error as { code?: unknown })?.code || '').toLowerCase();
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (
    code.includes('auth/')
    || message.includes('sign in to continue')
    || message.includes('authenticated session')
  ) return 'Your administrator session is still loading. Retry in a moment.';
  if (
    code.includes('network')
    || message.includes('failed to fetch')
    || message.includes('network')
  ) return 'The app configuration service could not be reached. Retry in a moment.';
  if (error instanceof BackendApiError && error.status === 403) {
    return 'You do not have permission to edit app configuration.';
  }
  if (error instanceof BackendApiError && error.status >= 500) {
    return 'The app configuration service returned an invalid response. Retry in a moment.';
  }
  return 'The authoritative app configuration could not be loaded. Publishing is disabled.';
}

function storageKey(tenantId: string) {
  return `huddleway.crm.app-configuration-draft:${tenantId}`;
}

function browserStorage() {
  return typeof window === 'undefined' ? null : window.localStorage;
}

export function createAppStudioController(api: AppStudioApi = backendClient) {
  let selectedTenantId = '';
  let loadSequence = 0;

  function selectTenant(tenantId: string) {
    selectedTenantId = tenantId;
    loadSequence += 1;
  }

  function isCurrent(tenantId: string, sequence: number) {
    return tenantId === selectedTenantId && sequence === loadSequence;
  }

  async function loadConfiguration(tenantId: string): Promise<ConfigurationLoadResult> {
    const sequence = ++loadSequence;
    try {
      const snapshot = await api.appConfiguration(tenantId);
      if (!isCurrent(tenantId, sequence)) return { status: 'stale' };
      if (snapshot.tenantId !== tenantId) {
        throw new Error('The configuration response did not match the selected organization.');
      }
      return { status: 'ready', snapshot };
    } catch (error) {
      if (!isCurrent(tenantId, sequence)) return { status: 'stale' };
      const code = String((error as { code?: unknown })?.code || '');
      return {
        status: 'error',
        loadState: (error instanceof BackendApiError && error.status === 403)
          || code.includes('permission-denied')
          ? 'permission'
          : 'error',
        message: loadMessage(error),
        requestId: error instanceof BackendApiError ? error.requestId || '' : '',
      };
    }
  }

  async function loadHistory(tenantId: string): Promise<HistoryLoadResult> {
    const sequence = loadSequence;
    try {
      const result = await api.appConfigurationHistory(tenantId);
      if (!isCurrent(tenantId, sequence)) return { status: 'stale' };
      return { status: 'ready', versions: result.versions, truncated: result.truncated };
    } catch {
      return isCurrent(tenantId, sequence) ? { status: 'error' } : { status: 'stale' };
    }
  }

  async function publish(request: {
    tenantId: string;
    configuration: CrmAppConfiguration;
    mode: 'initialize' | 'update';
    expectedVersionToken: string;
    idempotencyKey: string;
  }): Promise<PublishResult> {
    try {
      await api.publishAppConfiguration(
        request.tenantId,
        {
          ...request.configuration,
          mode: request.mode,
          expectedVersionToken: request.expectedVersionToken,
        },
        'Publish reviewed app branding and navigation configuration from CRM.',
        request.idempotencyKey,
      );
      return selectedTenantId === request.tenantId
        ? { status: 'published' }
        : { status: 'stale' };
    } catch (error) {
      if (selectedTenantId !== request.tenantId) return { status: 'stale' };
      const requestId = error instanceof BackendApiError ? error.requestId || '' : '';
      return error instanceof BackendApiError && error.status === 409
        ? { status: 'conflict', requestId }
        : { status: 'error', requestId };
    }
  }

  async function publishLogo(request: {
    tenantId: string;
    file: File;
    uploadIdempotencyKey: string;
    publicationIdempotencyKey: string;
  }): Promise<
    | { status: 'published'; publicUrl: string }
    | { status: 'stale' }
    | { status: 'error'; requestId: string }
  > {
    try {
      const upload = await api.uploadImageAsset(
        request.tenantId,
        request.file,
        'branding-logo',
        request.uploadIdempotencyKey,
      );
      if (selectedTenantId !== request.tenantId) return { status: 'stale' };
      const publication = await api.publishBrandingLogo(
        request.tenantId,
        upload.reservationId,
        'Publish the reviewed organization logo for the family app.',
        request.publicationIdempotencyKey,
      );
      return selectedTenantId === request.tenantId
        ? { status: 'published', publicUrl: publication.publicUrl }
        : { status: 'stale' };
    } catch (error) {
      if (selectedTenantId !== request.tenantId) return { status: 'stale' };
      return {
        status: 'error',
        requestId: error instanceof BackendApiError ? error.requestId || '' : '',
      };
    }
  }

  function saveDraft(tenantId: string, draft: SavedAppStudioDraft) {
    browserStorage()?.setItem(storageKey(tenantId), JSON.stringify(draft));
  }

  function readDraft(tenantId: string): SavedAppStudioDraft | null {
    try {
      const raw = browserStorage()?.getItem(storageKey(tenantId));
      if (!raw) return null;
      const draft = JSON.parse(raw) as Partial<SavedAppStudioDraft>;
      if (
        typeof draft.versionToken !== 'string'
        || typeof draft.savedAt !== 'string'
        || !draft.configuration
        || !Array.isArray(draft.configuration.navigationTabs)
      ) return null;
      return draft as SavedAppStudioDraft;
    } catch {
      return null;
    }
  }

  function removeDraft(tenantId: string) {
    browserStorage()?.removeItem(storageKey(tenantId));
  }

  return {
    selectTenant,
    loadConfiguration,
    loadHistory,
    publish,
    publishLogo,
    saveDraft,
    readDraft,
    removeDraft,
  };
}
