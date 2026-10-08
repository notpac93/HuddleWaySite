export const notificationStates = [
  'accepted', 'partial', 'failed', 'unknown', 'no_recipients',
  'audience_unsupported', 'deferred', 'in_progress',
] as const;

export type NotificationState = typeof notificationStates[number];
export interface AnnouncementBatchResult {
  success: boolean;
  tenantId: string;
  sendId: string;
  messageCount: number;
  activeRecipientCount: number;
  retainedRecipientCount: number;
  publicCount: number;
  notifications: {
    scope: 'tenant_account_holders';
    topic: null;
    requestedMessageCount: number;
    sentMessageCount: number;
    failedMessageCount: number;
    noRecipientMessageCount: number;
    replayedMessageCount: number;
    eligibleAccountCount: number;
    eligibleDeviceCount: number;
    successCount: number;
    failureCount: number;
    providerErrorCodes: Record<string, number>;
    // Old deployed versions may omit this. Their counts cannot prove delivery.
    deliveryStates?: Partial<Record<NotificationState, number>>;
  };
  requestId: string;
}

const countFields = [
  'requestedMessageCount', 'sentMessageCount', 'failedMessageCount',
  'noRecipientMessageCount', 'replayedMessageCount', 'eligibleAccountCount',
  'eligibleDeviceCount', 'successCount', 'failureCount',
] as const;
const count = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 0;
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown) => typeof value === 'string' && value.trim().length > 0;

export function validAnnouncementBatchResult(
  value: unknown, tenantId: string, messageCount: number, publicCount: number,
): value is AnnouncementBatchResult {
  if (!record(value) || value.success !== true || value.tenantId !== tenantId
    || value.messageCount !== messageCount || value.publicCount !== publicCount
    || !count(value.activeRecipientCount) || !count(value.retainedRecipientCount)
    || !text(value.sendId) || !text(value.requestId) || !record(value.notifications)) return false;
  const n = value.notifications;
  if (n.scope !== 'tenant_account_holders' || n.topic !== null
    || n.requestedMessageCount !== publicCount || countFields.some((key) => !count(n[key]))
    || !record(n.providerErrorCodes)
    || Object.entries(n.providerErrorCodes).some(([code, number]) =>
      !/^messaging\/[a-z0-9-]+$/.test(code) || !count(number))) return false;
  if (n.deliveryStates === undefined) return true;
  if (!record(n.deliveryStates)) return false;
  const entries = Object.entries(n.deliveryStates);
  if (publicCount === 1 && n.deliveryStates.accepted === 1 && Number(n.failureCount) > 0) return false;
  if (publicCount === 1 && n.deliveryStates.no_recipients === 1
    && [n.eligibleDeviceCount, n.successCount, n.failureCount].some((value) => value !== 0)) return false;
  return entries.every(([state, number]) =>
    (notificationStates as readonly string[]).includes(state) && count(number))
    && entries.reduce((total, [, number]) => total + (number as number), 0) === publicCount
    && Number(n.successCount) >= Number(n.deliveryStates.accepted || 0);
}

/** A provider acknowledgement proves acceptance, not arrival on a phone. */
export function announcementDeliveryFeedback(result: AnnouncementBatchResult): {
  complete: boolean; message: string;
} {
  const n = result.notifications;
  const states = n.deliveryStates;
  const positive = Object.entries(states || {}).filter(([, number]) => Number(number) > 0);
  if (result.publicCount === 1 && positive.length === 1 && positive[0][1] === 1) {
    const state = positive[0][0];
    if (state === 'accepted' && n.successCount > 0) {
      const devices = n.successCount === 1 ? 'device' : 'devices';
      return { complete: true, message:
        `Announcement published. Notifications were accepted for delivery to ${n.successCount} registered ${devices}.` };
    }
    if (state === 'no_recipients') return { complete: true, message:
      'Announcement published. No registered devices were available for this organization.' };
    if (state === 'deferred') return { complete: false, message:
      'Announcement published. Notifications are waiting to be attempted. Check again using this saved draft.' };
  }
  return { complete: false, message:
    'Announcement published. Notification delivery is incomplete or unconfirmed. Check again using this saved draft; do not publish a duplicate.' };
}
