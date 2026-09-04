import { describe, expect, it } from 'vitest';
import {
  APP_PREVIEW_PROTOCOL_VERSION,
  buildAppPreviewUpdate,
  buildAppPreviewUrl,
  parseAppPreviewMessage,
  resolveAppPreviewEnvironment,
  type AppPreviewSession,
} from '../../src/lib/crm/appPreviewProtocol';

const session: AppPreviewSession = {
  tenantId: 'stem-it-up-sports',
  environment: 'stage',
  sessionId: 'session-1',
  nonce: 'nonce-1',
};

describe('app preview protocol', () => {
  it('builds an exact-origin, session-bound iframe URL', () => {
    const url = new URL(buildAppPreviewUrl(
      'https://huddleway-app-preview-canary.web.app',
      'https://huddleway-crm-canary.web.app',
      session,
    ));
    expect(url.origin).toBe('https://huddleway-app-preview-canary.web.app');
    expect(url.searchParams.get('forcedTenant')).toBe('stem-it-up-sports');
    expect(url.searchParams.get('parentOrigin')).toBe('https://huddleway-crm-canary.web.app');
    expect(url.searchParams.get('previewNonce')).toBe('nonce-1');
  });

  it('sends the versioned environment-bound draft contract', () => {
    const payload = JSON.parse(buildAppPreviewUpdate(session, 4, {
      name: 'STEM It Up Sports',
      primaryColor: '#0b5c42',
      secondaryColor: '#0f2747',
      tertiaryColor: '#f4b41a',
      logoUrl: null,
      navigationTabs: [],
    }));
    expect(payload).toMatchObject({
      protocolVersion: APP_PREVIEW_PROTOCOL_VERSION,
      environment: 'stage',
      tenantId: 'stem-it-up-sports',
      revision: 4,
    });
  });

  it('carries one canonical component draft without changing the base protocol', () => {
    const payload = JSON.parse(buildAppPreviewUpdate(session, 5, {
      name: 'STEM It Up Sports',
      primaryColor: '#0b5c42',
      secondaryColor: '#0f2747',
      tertiaryColor: '#f4b41a',
      logoUrl: null,
      navigationTabs: [],
    }, {
      pageRoute: '/',
      selectedFieldId: 'headline',
      component: {
        id: 'home_hero_1',
        definitionId: 'home_hero',
        definitionVersion: 3,
        type: 'hero_section',
        label: 'Home Hero',
        enabled: true,
        presetId: null,
        starterContentReviewKey: null,
        isVisible: true,
        status: 'draft',
        content: { headline: 'Welcome families' },
      },
    }));
    expect(payload.componentDraft).toMatchObject({
      pageRoute: '/',
      selectedFieldId: 'headline',
      component: {
        id: 'home_hero_1',
        definitionId: 'home_hero',
        definitionVersion: 3,
        content: { headline: 'Welcome families' },
      },
    });
  });

  it('rejects forged, stale-protocol, and cross-environment responses', () => {
    const ready = {
      type: 'huddleway.crm.preview.ready',
      protocolVersion: APP_PREVIEW_PROTOCOL_VERSION,
      tenantId: session.tenantId,
      environment: session.environment,
      sessionId: session.sessionId,
      nonce: session.nonce,
    };
    expect(parseAppPreviewMessage(ready, session)).not.toBeNull();
    expect(parseAppPreviewMessage({ ...ready, nonce: 'forged' }, session)).toBeNull();
    expect(parseAppPreviewMessage({ ...ready, environment: 'prod' }, session)).toBeNull();
    expect(parseAppPreviewMessage({ ...ready, protocolVersion: 0 }, session)).toBeNull();
    expect(parseAppPreviewMessage({
      ...ready,
      type: 'huddleway.crm.preview.rejected',
      reason: 'invalid-update',
    }, session)?.type).toBe('huddleway.crm.preview.rejected');
    expect(parseAppPreviewMessage({
      ...ready,
      type: 'huddleway.crm.preview.field-selected',
      fieldId: 'headline',
    }, session)?.fieldId).toBe('headline');
  });

  it('derives stage and prod independently from build mode', () => {
    expect(resolveAppPreviewEnvironment({
      PROD: true,
      PUBLIC_FIREBASE_PROJECT_ID: 'huddleway-dev',
    })).toBe('stage');
    expect(resolveAppPreviewEnvironment({
      PROD: true,
      PUBLIC_FIREBASE_PROJECT_ID: 'sports-team-apps',
    })).toBe('prod');
  });
});
