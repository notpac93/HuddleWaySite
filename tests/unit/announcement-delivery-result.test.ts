import { describe, expect, it, vi } from 'vitest';
import { BackendApi } from '../../src/lib/api/BackendApi';
import {
  announcementDeliveryFeedback, validAnnouncementBatchResult,
  type AnnouncementBatchResult, type NotificationState,
} from '../../src/lib/api/AnnouncementDeliveryResult';

function result(state: NotificationState = 'accepted'): AnnouncementBatchResult {
  return {
    success: true, tenantId: 'tenant-a', sendId: 'send-a', messageCount: 1,
    activeRecipientCount: 0, retainedRecipientCount: 0, publicCount: 1, requestId: 'request-a',
    notifications: {
      scope: 'tenant_account_holders', topic: null, requestedMessageCount: 1,
      sentMessageCount: 1, failedMessageCount: 0, noRecipientMessageCount: 0,
      replayedMessageCount: 0, eligibleAccountCount: 2, eligibleDeviceCount: 2,
      successCount: 2, failureCount: 0, providerErrorCodes: {}, deliveryStates: { [state]: 1 },
    },
  };
}

describe('announcement acceptance contract', () => {
  it('binds the actual HTTP response to the requested tenant, count and states', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(result()), { status: 201 }));
    const api = new BackendApi({ baseUrl: 'https://api.example.test', fetch,
      getIdToken: async () => 'fixture-token' });
    const output = await api.sendMessageBatch('tenant-a', [{ id: 'message-a', isSecret: false }], 'operation-a');
    expect(output).toEqual(result());
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][1].headers['Idempotency-Key']).toBe('operation-a');
    expect(announcementDeliveryFeedback(output)).toEqual({ complete: true,
      message: 'Announcement published. Notifications were accepted for delivery to 2 registered devices.' });
  });

  it.each(['partial', 'unknown', 'failed', 'audience_unsupported', 'in_progress', 'deferred'] as const)(
    '%s is never reported as delivered or no recipients, even with zero failureCount', (state) => {
      const output = result(state);
      expect(validAnnouncementBatchResult(output, 'tenant-a', 1, 1)).toBe(true);
      const feedback = announcementDeliveryFeedback(output);
      expect(feedback.complete).toBe(false);
      expect(feedback.message).not.toContain('No registered devices');
      expect(feedback.message).not.toContain('accepted for delivery');
      expect(feedback.message).toContain('saved draft');
    },
  );

  it('an old response with zero counts is unconfirmed, not evidence of no devices', () => {
    const output = result();
    delete output.notifications.deliveryStates;
    output.notifications.successCount = 0;
    expect(validAnnouncementBatchResult(output, 'tenant-a', 1, 1)).toBe(true);
    expect(announcementDeliveryFeedback(output)).toMatchObject({ complete: false });
  });

  it('only an explicit empty audience reports no registered devices', () => {
    const output = result('no_recipients');
    Object.assign(output.notifications, { sentMessageCount: 0, noRecipientMessageCount: 1,
      eligibleAccountCount: 0, eligibleDeviceCount: 0, successCount: 0 });
    expect(validAnnouncementBatchResult(output, 'tenant-a', 1, 1)).toBe(true);
    expect(announcementDeliveryFeedback(output)).toEqual({ complete: true,
      message: 'Announcement published. No registered devices were available for this organization.' });
  });

  it.each([
    { tenantId: 'other-tenant' }, { messageCount: 2 }, { publicCount: 2 },
    { notifications: { ...result().notifications, deliveryStates: { invented: 1 } } },
    { notifications: { ...result().notifications, deliveryStates: { accepted: 2 } } },
    { notifications: { ...result().notifications, deliveryStates: { unknown: -1 } } },
    { notifications: { ...result().notifications, deliveryStates: [] } },
    { notifications: { ...result().notifications, successCount: 0 } },
    { notifications: { ...result().notifications, failureCount: 1 } },
    { notifications: { ...result().notifications, deliveryStates: { no_recipients: 1 } } },
  ])('rejects contradictory or substituted response %j', async (change) => {
    const payload = { ...result(), ...change };
    expect(validAnnouncementBatchResult(payload, 'tenant-a', 1, 1)).toBe(false);
    const api = new BackendApi({ baseUrl: 'https://api.example.test', getIdToken: async () => 'fixture-token',
      fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 201 })) });
    await expect(api.sendMessageBatch('tenant-a', [{ id: 'message-a' }], 'operation-a')).rejects.toMatchObject({
      code: 'invalid_backend_response',
    });
  });
});
