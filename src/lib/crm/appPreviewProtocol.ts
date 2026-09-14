import type { CrmAppConfiguration, CrmPageComponent } from '../api/BackendApi';
import type { PublicEnvironment } from '../config/publicEnvironment';

export const APP_PREVIEW_PROTOCOL_VERSION = 1;

export type AppPreviewEnvironment = 'dev' | 'stage' | 'prod';

export interface AppPreviewSession {
  tenantId: string;
  environment: AppPreviewEnvironment;
  sessionId: string;
  nonce: string;
}

export interface AppPreviewAttestation {
  sourceCommit: string;
  releaseId: string;
}

export interface AppComponentPreviewDraft {
  pageRoute: string;
  teamId?: string | null;
  component: CrmPageComponent;
  selectedFieldId?: string | null;
  selectedItemId?: string | null;
}

export function resolveAppPreviewEnvironment(
  environment: PublicEnvironment,
): AppPreviewEnvironment {
  const explicit = String(environment.PUBLIC_APP_PREVIEW_ENVIRONMENT || '')
    .trim()
    .toLowerCase();
  if (explicit === 'dev' || explicit === 'stage' || explicit === 'prod') {
    return explicit;
  }
  if (environment.PUBLIC_FIREBASE_PROJECT_ID === 'sports-team-apps') {
    return 'prod';
  }
  return environment.PROD ? 'stage' : 'dev';
}

export function createAppPreviewSession(
  tenantId: string,
  environment: AppPreviewEnvironment,
): AppPreviewSession {
  return {
    tenantId,
    environment,
    sessionId: randomToken(),
    nonce: randomToken(),
  };
}

export function buildAppPreviewUrl(
  previewOrigin: string,
  parentOrigin: string,
  session: AppPreviewSession,
) {
  const url = new URL('/', previewOrigin);
  url.searchParams.set('crmPreview', '1');
  url.searchParams.set('forcedTenant', session.tenantId);
  url.searchParams.set('parentOrigin', parentOrigin);
  url.searchParams.set('previewSession', session.sessionId);
  url.searchParams.set('previewNonce', session.nonce);
  return url.toString();
}

export function buildAppPreviewUpdate(
  session: AppPreviewSession,
  revision: number,
  configuration: CrmAppConfiguration,
  componentDraft?: AppComponentPreviewDraft | null,
) {
  return JSON.stringify({
    type: 'huddleway.crm.preview.update',
    protocolVersion: APP_PREVIEW_PROTOCOL_VERSION,
    tenantId: session.tenantId,
    environment: session.environment,
    sessionId: session.sessionId,
    nonce: session.nonce,
    revision,
    configuration,
    ...(componentDraft ? { componentDraft } : {}),
  });
}

export function parseAppPreviewMessage(
  data: unknown,
  session: AppPreviewSession,
) {
  let payload: Record<string, unknown>;
  try {
    const decoded = typeof data === 'string' ? JSON.parse(data) : data;
    if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) {
      return null;
    }
    payload = decoded as Record<string, unknown>;
  } catch {
    return null;
  }
  if (
    payload.protocolVersion !== APP_PREVIEW_PROTOCOL_VERSION
    || payload.tenantId !== session.tenantId
    || payload.environment !== session.environment
    || payload.sessionId !== session.sessionId
    || payload.nonce !== session.nonce
  ) return null;
  if (
    payload.type !== 'huddleway.crm.preview.ready'
    && payload.type !== 'huddleway.crm.preview.applied'
    && payload.type !== 'huddleway.crm.preview.rejected'
    && payload.type !== 'huddleway.crm.preview.field-selected'
  ) return null;
  return payload;
}

function randomToken() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
