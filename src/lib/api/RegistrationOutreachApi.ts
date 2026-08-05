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
  recipientCount: number;
  sentCount: number;
  sentRecipients: string[];
  failedCount: number;
  failures: Array<{ email: string; error: string }>;
  suppressedCount: number;
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
    idempotencyKey,
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
    idempotencyKey: string;
  }) {
    const payload = await this.api.request<RegistrationEmailDeliveryResult>(
      '/communications/one-way-email',
      {
        method: 'POST',
        body: {
          tenantId,
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
          },
        },
        idempotencyKey,
      },
    );
    if (
      payload.tenantId !== tenantId
      || payload.audienceMode !== 'direct'
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
    return payload;
  }
}

export const registrationOutreachApi = new RegistrationOutreachApi(
  backendClient,
);
