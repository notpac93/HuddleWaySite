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

export interface AppPagePreviewDraft {
  id: string;
  route: string;
  title: string;
  components: CrmPageComponent[];
  editMode?: boolean;
  editSessionId?: string;
  provisionalId?: string | null;
  editableFields?: Record<string, Array<{ id: string; label: string; maxLength?: number }>>;
  availableComponents?: Array<{ id: string; label: string }>;
}

export type CanvasAction = {
  action: 'add' | 'remove' | 'move-up' | 'move-down' | 'confirm-add' | 'cancel-add' | 'text-begin' | 'text-change' | 'text-end' | 'text-cancel' | 'navigate';
  pageId: string;
  componentId?: string;
  definitionId?: string;
  beforeId?: string | null;
  fieldId?: string;
  value?: string;
  editSessionId?: string;
  route?: string;
};

export function parseCanvasAction(value: unknown): CanvasAction | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const actions = ['add', 'remove', 'move-up', 'move-down', 'confirm-add', 'cancel-add', 'text-begin', 'text-change', 'text-end', 'text-cancel', 'navigate'];
  if (!actions.includes(String(item.action)) || typeof item.pageId !== 'string' || !item.pageId || item.pageId.length > 200) return null;
  for (const key of ['componentId', 'definitionId', 'fieldId', 'editSessionId']) {
    if (item[key] !== undefined && (typeof item[key] !== 'string' || !(item[key] as string).length || (item[key] as string).length > 200)) return null;
  }
  if (item.beforeId !== undefined && item.beforeId !== null && (typeof item.beforeId !== 'string' || item.beforeId.length > 200)) return null;
  if (item.value !== undefined && (typeof item.value !== 'string' || item.value.length > 20000)) return null;
  if (item.route !== undefined && (typeof item.route !== 'string' || !item.route.startsWith('/') || item.route.startsWith('//') || item.route.length > 240)) return null;
  return item as CanvasAction;
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
  pageDraft?: AppPagePreviewDraft | null,
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
    ...(pageDraft ? { pageDraft } : {}),
  });
}

export function parseAppPreviewMessage(
  data: unknown,
  session: AppPreviewSession,
  onInvalid: (reason: string) => void = () => {},
) {
  let payload: Record<string, unknown>;
  try {
    const decoded = typeof data === 'string' ? JSON.parse(data) : data;
    if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) {
      onInvalid('invalid-object');
      return null;
    }
    payload = decoded as Record<string, unknown>;
  } catch {
    onInvalid('invalid-json');
    return null;
  }
  const expected = { protocolVersion: APP_PREVIEW_PROTOCOL_VERSION, tenantId: session.tenantId,
    environment: session.environment, sessionId: session.sessionId, nonce: session.nonce };
  for (const [field, value] of Object.entries(expected)) {
    if (payload[field] !== value) { onInvalid(`wrong-${field}`); return null; }
  }
  if (
    payload.type !== 'huddleway.crm.preview.ready'
    && payload.type !== 'huddleway.crm.preview.applied'
    && payload.type !== 'huddleway.crm.preview.rejected'
    && payload.type !== 'huddleway.crm.preview.field-selected'
    && payload.type !== 'huddleway.crm.preview.interaction'
    && payload.type !== 'huddleway.crm.preview.canvas-action'
  ) { onInvalid('unsupported-type'); return null; }
  return payload;
}

function randomToken() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
