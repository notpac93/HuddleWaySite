import { backendClient } from './backendClient';
import {
  BackendApi,
  BackendApiError,
} from './BackendApi';

export interface RegistrationInviteLinkResult {
  linkId: string;
  tenantId: string;
  targetType: 'event' | 'season';
  targetId: string;
  eventId: string;
  displayTitle: string;
  registrationKind: 'free' | 'paid';
  priceCents: number;
  currency: string;
  recipientCount: number;
  url: string;
  expiresAt: string;
  idempotentReplay: boolean;
  requestId: string;
}

export interface RegistrationEmailDeliveryResult {
  success: boolean;
  tenantId: string;
  communicationId: string;
  audienceMode: 'direct';
  deliveryMode?: 'huddleway' | 'connected_mailbox';
  recipientCount: number;
  sentCount: number;
  sentRecipients: string[];
  failedCount: number;
  failures: Array<{ email: string; error: string }>;
  suppressedCount: number;
  requestId: string;
}

export interface ConnectedMailboxSnapshot {
  success: boolean;
  tenantId: string;
  connected: boolean;
  status: string;
  provider: 'google' | 'microsoft' | null;
  email: string | null;
  displayName: string | null;
  connectedAt: string | null;
  lastCheckedAt: string | null;
  availableProviders: Array<'google' | 'microsoft'>;
  requestId: string;
}

export interface MessageAudiencePreview {
  tenantId: string;
  requestedCount: number;
  uniqueRecipientCount: number;
  inAppReadyCount: number;
  retainedPendingActivationCount: number;
  emailEligibleCount: number;
  emailSuppressedCount: number;
  invalidCount: number;
  duplicateCount: number;
  publicMessageCount: number;
  excludedCount: number;
  chunkSize: number;
  chunkCount: number;
  emailRecipientLimit: number;
  tenantEmailRemaining: number;
  tenantEmailMonthlyLimit: number;
  tenantEmailMonthKey: string;
  tenantEmailResetsAt: string;
  platformEmailRemaining: number;
  capacityMode: 'normal' | 'temporary_limited' | 'unavailable';
  monthlyAllowanceVisible: boolean;
  requestId: string;
}

export interface EmailQuotaSnapshot {
  success: boolean;
  tenantId: string;
  monthKey: string;
  resetsAt: string;
  monthlyLimit: number;
  usedCount: number;
  sentCount: number;
  localSentCount: number;
  providerSentCount: number;
  reservedCount: number;
  remainingCount: number;
  capacityMode: 'normal' | 'temporary_limited' | 'unavailable';
  monthlyAllowanceVisible: boolean;
  providerReconciliationStatus: string | null;
  providerReconciledAt: string | null;
  emailSendingStatus: 'enabled' | 'suspended';
  emailSuspensionReason: string | null;
  bounceRate: number;
  complaintRate: number;
  perSendLimit: number;
  requestId: string;
}

function invalidResponse(payload: { requestId?: string }): never {
  throw new BackendApiError({
    message: 'The HuddleWay backend returned an invalid response.',
    status: 502,
    code: 'invalid_backend_response',
    requestId: String(payload.requestId || '').trim() || null,
  });
}

function validIsoTimestamp(value: string) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
    && !Number.isNaN(Date.parse(value));
}

export class RegistrationOutreachApi {
  constructor(private readonly api: BackendApi) {}

  async emailQuota(tenantId: string) {
    const payload = await this.api.request<EmailQuotaSnapshot>(
      '/admin/messages/email-quota',
      { query: { tenantId } },
    );
    const counters = [
      payload.monthlyLimit,
      payload.usedCount,
      payload.sentCount,
      payload.localSentCount,
      payload.providerSentCount,
      payload.reservedCount,
      payload.remainingCount,
      payload.perSendLimit,
    ];
    if (
      payload.success !== true
      || payload.tenantId !== tenantId
      || !/^\d{4}-\d{2}$/.test(payload.monthKey)
      || !validIsoTimestamp(payload.resetsAt)
      || counters.some((value) => !Number.isSafeInteger(value) || value < 0)
      || payload.usedCount !== payload.sentCount + payload.reservedCount
      || payload.remainingCount !== payload.monthlyLimit - payload.usedCount
      || payload.perSendLimit < 0
      || payload.perSendLimit > 500
      || !['normal', 'temporary_limited', 'unavailable'].includes(payload.capacityMode)
      || typeof payload.monthlyAllowanceVisible !== 'boolean'
      || !['enabled', 'suspended'].includes(payload.emailSendingStatus)
      || ![payload.bounceRate, payload.complaintRate].every(
        (value) => Number.isFinite(value) && value >= 0 && value <= 1,
      )
      || !payload.requestId?.trim()
    ) invalidResponse(payload);
    return payload;
  }

  async connectedMailbox(tenantId: string) {
    const payload = await this.api.request<ConnectedMailboxSnapshot>(
      '/admin/communications/connected-mailbox',
      { query: { tenantId } },
    );
    if (
      payload.success !== true
      || payload.tenantId !== tenantId
      || typeof payload.connected !== 'boolean'
      || !Array.isArray(payload.availableProviders)
      || payload.availableProviders.some(
        (provider) => !['google', 'microsoft'].includes(provider),
      )
      || (payload.connected && (
        !['google', 'microsoft'].includes(String(payload.provider))
        || !payload.email
        || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)
      ))
      || (!payload.connected && payload.status === 'connected')
      || (payload.connectedAt !== null && !validIsoTimestamp(payload.connectedAt))
      || (payload.lastCheckedAt !== null && !validIsoTimestamp(payload.lastCheckedAt))
      || !payload.requestId?.trim()
    ) invalidResponse(payload);
    return payload;
  }

  async startMailboxConnection(tenantId: string, provider: 'google' | 'microsoft') {
    const payload = await this.api.request<{
      success: true;
      tenantId: string;
      authorizationUrl: string;
      requestId: string;
    }>('/admin/communications/connected-mailbox/start', {
      method: 'POST',
      body: { tenantId, provider },
    });
    if (
      payload.success !== true
      || payload.tenantId !== tenantId
      || !payload.authorizationUrl?.startsWith('https://')
      || !payload.requestId?.trim()
    ) invalidResponse(payload);
    return payload;
  }

  async disconnectMailbox(tenantId: string) {
    const payload = await this.api.request<ConnectedMailboxSnapshot>(
      '/admin/communications/connected-mailbox/disconnect',
      { method: 'POST', body: { tenantId } },
    );
    if (payload.success !== true || payload.tenantId !== tenantId || payload.connected) {
      invalidResponse(payload);
    }
    return payload;
  }

  async messageAudiencePreview({
    tenantId,
    emails,
    eventId,
  }: {
    tenantId: string;
    emails: string[];
    eventId?: string;
  }) {
    const payload = await this.api.request<MessageAudiencePreview>(
      '/admin/messages/audience-preview',
      {
        method: 'POST',
        body: {
          tenantId,
          emails,
          ...(eventId ? { eventId } : {}),
          emailRequested: true,
          alsoPostPublicly: false,
        },
      },
    );
    const counters = [
      payload.requestedCount,
      payload.uniqueRecipientCount,
      payload.emailEligibleCount,
      payload.emailSuppressedCount,
      payload.invalidCount,
      payload.duplicateCount,
      payload.emailRecipientLimit,
      payload.tenantEmailRemaining,
      payload.tenantEmailMonthlyLimit,
      payload.platformEmailRemaining,
    ];
    if (
      payload.tenantId !== tenantId
      || counters.some((value) => !Number.isSafeInteger(value) || value < 0)
      || payload.uniqueRecipientCount > payload.requestedCount
      || payload.emailEligibleCount > payload.uniqueRecipientCount
      || payload.emailRecipientLimit < 1
      || payload.emailRecipientLimit > 500
      || !['normal', 'temporary_limited', 'unavailable'].includes(payload.capacityMode)
      || typeof payload.monthlyAllowanceVisible !== 'boolean'
      || !/^\d{4}-\d{2}$/.test(payload.tenantEmailMonthKey)
      || !validIsoTimestamp(payload.tenantEmailResetsAt)
      || !payload.requestId?.trim()
    ) invalidResponse(payload);
    return payload;
  }

  async createInvite({
    tenantId,
    targetType,
    targetId,
    eventId,
    recipientEmails,
    idempotencyKey,
  }: {
    tenantId: string;
    targetType: 'event' | 'season';
    targetId: string;
    eventId?: string;
    recipientEmails: string[];
    idempotencyKey: string;
  }) {
    const payload = await this.api.request<RegistrationInviteLinkResult>(
      '/admin/registration-links',
      {
        method: 'POST',
        body: {
          tenantId,
          targetType,
          targetId,
          ...(eventId ? { eventId } : {}),
          recipientEmails,
          operationKey: idempotencyKey,
        },
        idempotencyKey,
      },
    );
    if (
      payload.tenantId !== tenantId
      || payload.targetType !== targetType
      || payload.targetId !== targetId
      || !payload.eventId?.trim()
      || !payload.displayTitle?.trim()
      || !['free', 'paid'].includes(payload.registrationKind)
      || !Number.isSafeInteger(payload.priceCents)
      || payload.priceCents < 0
      || !/^[A-Z]{3}$/.test(payload.currency)
      || payload.recipientCount !== recipientEmails.length
      || !/^https:\/\//i.test(payload.url)
      || !validIsoTimestamp(payload.expiresAt)
      || typeof payload.idempotentReplay !== 'boolean'
      || !payload.requestId?.trim()
    ) invalidResponse(payload);
    return payload;
  }

  async createShareableLink({
    tenantId,
    eventId,
    idempotencyKey,
  }: {
    tenantId: string;
    eventId: string;
    idempotencyKey: string;
  }) {
    const payload = await this.createInvite({
      tenantId,
      targetType: 'event',
      targetId: eventId,
      eventId,
      recipientEmails: [],
      idempotencyKey,
    });
    if (payload.recipientCount !== 0) invalidResponse(payload);
    return payload;
  }

  async sendEmail({
    tenantId,
    recipientEmails,
    subject,
    message,
    eventTitle,
    registrationUrl,
    registrationLabel,
    amountCents,
    currency,
    eventId,
    idempotencyKey,
    deliveryMode = 'huddleway',
  }: {
    tenantId: string;
    recipientEmails: string[];
    subject: string;
    message: string;
    eventTitle: string;
    registrationUrl: string;
    registrationLabel: string;
    amountCents: number;
    currency: string;
    eventId?: string;
    idempotencyKey: string;
    deliveryMode?: 'huddleway' | 'connected_mailbox';
  }) {
    const payload = await this.api.request<RegistrationEmailDeliveryResult>(
      '/communications/one-way-email',
      {
        method: 'POST',
        body: {
          tenantId,
          deliveryMode,
          audience: { mode: 'direct', emails: recipientEmails },
          channels: { push: false },
          communication: {
            type: 'update',
            subject,
            message,
            eventTitle,
            registrationUrl,
            registrationLabel,
            amountCents,
            currency,
            ...(eventId ? { eventId } : {}),
          },
        },
        idempotencyKey,
      },
    );
    if (
      payload.tenantId !== tenantId
      || payload.audienceMode !== 'direct'
      || (payload.deliveryMode !== undefined
        && !['huddleway', 'connected_mailbox'].includes(payload.deliveryMode))
      || !payload.communicationId?.trim()
      || ![
        payload.recipientCount,
        payload.sentCount,
        payload.failedCount,
        payload.suppressedCount,
      ].every(Number.isSafeInteger)
      || !Array.isArray(payload.sentRecipients)
      || !Array.isArray(payload.failures)
      || !payload.requestId?.trim()
    ) invalidResponse(payload);
    return { ...payload, deliveryMode: payload.deliveryMode || 'huddleway' };
  }

  sendOneWayEmail({
    tenantId,
    recipientEmails,
    subject,
    message,
    idempotencyKey,
    deliveryMode = 'huddleway',
  }: {
    tenantId: string;
    recipientEmails: string[];
    subject: string;
    message: string;
    idempotencyKey: string;
    deliveryMode?: 'huddleway' | 'connected_mailbox';
  }) {
    return this.sendEmail({
      tenantId,
      recipientEmails,
      subject,
      message,
      eventTitle: '',
      registrationUrl: '',
      registrationLabel: '',
      amountCents: 0,
      currency: 'USD',
      idempotencyKey,
      deliveryMode,
    });
  }
}

export const registrationOutreachApi = new RegistrationOutreachApi(
  backendClient,
);
