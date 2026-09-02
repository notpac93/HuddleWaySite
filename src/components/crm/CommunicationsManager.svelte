<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import {
    collection,
    getDocs,
    orderBy,
    query,
    where,
  } from 'firebase/firestore';
  import { db } from '../../lib/firebase';
  import { tenantIdStore } from '../../lib/authStore';
  import { backendClient } from '../../lib/api/backendClient';
  import {
    registrationOutreachApi,
    type EmailQuotaSnapshot,
    type ConnectedMailboxSnapshot,
    type MessageAudiencePreview,
  } from '../../lib/api/RegistrationOutreachApi';
  import { eventsStore, registrationsStore, seasonsStore, teamsStore } from '../../lib/services/DataStore';
  import {
    BackendApiError,
    createIdempotencyKey,
  } from '../../lib/api/BackendApi';
  import StatusButton from './ui/StatusButton.svelte';
  import { modalFocus } from '../../lib/ui/modalFocus';
  import ConsumerAdminInbox from './ConsumerAdminInbox.svelte';
  import AnnouncementPublishReview from './messages/AnnouncementPublishReview.svelte';
  import { clearPortalDraft, registerPortalDraft } from '../../lib/ui/portalDraftGuard';

  export let registrationEmailDraft: {
    token: string;
    eventId: string;
    eventTitle: string;
  } | null = null;
  export let mailboxConnectionResult: string | null = null;

  type WallMessage = {
    id: string;
    authorName: string | null;
    subject: string | null;
    body: string;
    teamId: string | null;
    attachmentScope: 'all' | 'event' | 'season';
    eventId: string | null;
    eventTitle: string | null;
    seasonId: string | null;
    seasonName: string | null;
    createdAt: Date | null;
  };

  type AttachmentScope = 'all' | 'event' | 'season';
  type ComposerKind = 'announcement' | 'email' | 'registration_email';
  type MessageView = 'email' | 'announcements' | 'registration' | 'conversations';
  type EmailReview = {
    kind: Extract<ComposerKind, 'email' | 'registration_email'>;
    preview: MessageAudiencePreview;
  };
  type DeliveryReceipt = { id: string; kind: string; sentAt: string; recipientCount: number; sentCount: number; failedCount: number; sender: string };

  const SUBJECT_MAX_LENGTH = 200;
  const BODY_MAX_LENGTH = 4_000;
  const DEFAULT_EMAIL_RECIPIENT_LIMIT = 400;

  let messages: WallMessage[] = [];
  let isAdding = false;
  let isLoading = true;
  let loadError = '';
  let loadRequestId = '';
  let activeTenantId = '';
  let searchQuery = '';
  const messageViews: Array<{ id: MessageView; label: string }> = [
    { id: 'email', label: 'Email' },
    { id: 'announcements', label: 'Announcements' },
    { id: 'registration', label: 'Registration outreach' },
    { id: 'conversations', label: 'Conversations' },
  ];
  let activeView: MessageView = 'email';
  let recipientSource: 'manual' | 'roster' | 'team' | 'event' | 'season' = 'manual';
  let recipientSourceId = '';
  let historyAudienceFilter = 'all';
  let historyDateFilter = '';
  let conversationUnreadCount = 0;
  let deliveryReceipts: DeliveryReceipt[] = [];
  let expandedMessageIds = new Set<string>();

  let subject = '';
  let body = '';
  let composerKind: ComposerKind = 'announcement';
  let registrationRecipientInput = '';
  let teamId = 'program';
  let attachmentScope: AttachmentScope = 'all';
  let selectedEventId = '';
  let selectedSeasonId = '';
  let submitState: 'idle' | 'loading' | 'success' | 'error' = 'idle';
  let operationMessage = '';
  let operationRequestId = '';
  let recallingMessageId = '';
  let postIdempotencyKey = createIdempotencyKey('message-batch');
  let postMessageId = `message_${globalThis.crypto.randomUUID()}`;
  let postPayloadSignature = '';
  const recallIdempotencyKeys = new Map<string, string>();
  let tenantGeneration = 0;
  let recallTarget: WallMessage | null = null;
  let recallReason = '';
  let consumedRegistrationDraftToken = '';
  let emailQuota: EmailQuotaSnapshot | null = null;
  let emailQuotaLoading = false;
  let emailQuotaError = '';
  let emailReview: EmailReview | null = null;
  let senderSettingsOpen = false;
  let connectedMailbox: ConnectedMailboxSnapshot | null = null;
  let connectedMailboxLoading = false;
  let connectedMailboxError = '';
  let selectedDeliveryMode: 'huddleway' | 'connected_mailbox' = 'huddleway';
  let announcementReview: {
    eligibleAccountCount: number;
    eligibleDeviceCount: number;
    truncated: boolean;
  } | null = null;

  $: normalizedSearch = searchQuery.trim().toLocaleLowerCase();
  function serializedDate(value: any) {
    if (!value) return '';
    const date = value?.toDate ? value.toDate() : new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString();
  }

  $: eventOptions = $eventsStore
    .map((event) => ({
      id: String(event.id || '').trim(),
      title: String(event.title || event.name || event.id || 'Untitled event').trim(),
      priceCents: Number.parseInt(String(event.priceCents || 0), 10) || 0,
      currency: String(event.currency || 'USD').trim().toUpperCase() || 'USD',
      endDate: serializedDate(event.registrationEndDate || event.endDate || event.date),
      status: String(event.status || '').toLowerCase(),
    }))
    .filter((event) => event.id)
    .sort((a, b) => a.title.localeCompare(b.title));
  $: eligibleEventOptions = eventOptions.filter((event) => {
    const date = event.endDate ? new Date(event.endDate) : null;
    return !['completed', 'archived', 'cancelled'].includes(event.status)
      && (!date || Number.isNaN(date.getTime()) || date.getTime() >= Date.now());
  });
  $: seasonOptions = $seasonsStore
    .map((season) => ({
      id: String(season.id || '').trim(),
      title: String(season.name || season.title || season.id || 'Untitled season').trim(),
    }))
    .filter((season) => season.id)
    .sort((a, b) => a.title.localeCompare(b.title));
  $: visibleMessages = messages.filter((message) =>
      (historyAudienceFilter === 'all' || (historyAudienceFilter === 'organization' ? message.attachmentScope === 'all' : message.attachmentScope === historyAudienceFilter))
      && (!historyDateFilter || (message.createdAt && message.createdAt.toISOString().slice(0, 10) >= historyDateFilter))
      && (!normalizedSearch ||
        [
          message.authorName,
          message.subject,
          message.body,
          audienceLabel(message.teamId),
          attachmentLabel(message),
        ].some((value) => value?.toLocaleLowerCase().includes(normalizedSearch))));
  $: registrationRecipientResult = parseRecipientEmails(registrationRecipientInput);
  $: hasMessageDraft = isAdding && Boolean(subject.trim() || body.trim() || registrationRecipientInput.trim());
  $: if (hasMessageDraft && activeTenantId) {
    registerPortalDraft({
      id: `messages:${activeTenantId}`,
      title: 'Unsent message draft',
      message: 'This message has not been sent. Keep it in this browser, discard it, or stay and finish the review.',
      retainLabel: 'Keep draft and leave',
      onRetain: saveMessageDraft,
      onDiscard: discardMessageDraft,
    });
    saveMessageDraft();
  } else if (activeTenantId) clearPortalDraft(`messages:${activeTenantId}`);
  $: emailRecipientLimit = emailQuota?.perSendLimit ?? DEFAULT_EMAIL_RECIPIENT_LIMIT;
  $: registrationTargetId = attachmentScope === 'season'
    ? selectedSeasonId
    : selectedEventId;
  $: postIsValid = composerKind === 'announcement'
    ? teamId === 'program'
        && body.trim().length > 0
        && body.trim().length <= BODY_MAX_LENGTH
        && subject.trim().length <= SUBJECT_MAX_LENGTH
        && (attachmentScope === 'all'
          || (attachmentScope === 'event' && Boolean(selectedEventId))
          || (attachmentScope === 'season' && Boolean(selectedSeasonId)))
    : composerKind === 'email'
      ? emailQuota?.emailSendingStatus !== 'suspended'
        && subject.trim().length > 0
        && subject.trim().length <= SUBJECT_MAX_LENGTH
        && body.trim().length > 0
        && body.trim().length <= BODY_MAX_LENGTH
        && registrationRecipientResult.invalidCount === 0
        && registrationRecipientResult.emails.length > 0
        && registrationRecipientResult.emails.length <= emailRecipientLimit
      : emailQuota?.emailSendingStatus !== 'suspended'
        && body.trim().length > 0
        && body.trim().length <= BODY_MAX_LENGTH
        && subject.trim().length <= SUBJECT_MAX_LENGTH
        && ['event', 'season'].includes(attachmentScope)
        && Boolean(registrationTargetId)
        && registrationRecipientResult.invalidCount === 0
        && registrationRecipientResult.emails.length > 0
        && registrationRecipientResult.emails.length <= emailRecipientLimit;
  $: canPublish = postIsValid;
  $: if (
    registrationEmailDraft
    && registrationEmailDraft.token !== consumedRegistrationDraftToken
  ) {
    consumedRegistrationDraftToken = registrationEmailDraft.token;
    resetComposer();
    composerKind = 'registration_email';
    attachmentScope = 'event';
    selectedEventId = registrationEmailDraft.eventId;
    subject = `Register for ${registrationEmailDraft.eventTitle}`;
    body = `Complete registration for ${registrationEmailDraft.eventTitle}.`;
    isAdding = true;
  }
  $: {
    const signature = JSON.stringify({
      subject: subject.trim(),
      body: body.trim(),
      teamId,
      attachmentScope,
      selectedEventId,
      selectedSeasonId,
      composerKind,
      registrationRecipientInput,
    });
    if (signature !== postPayloadSignature && submitState !== 'loading') {
      postPayloadSignature = signature;
      postIdempotencyKey = createIdempotencyKey('message-batch');
      postMessageId = `message_${globalThis.crypto.randomUUID()}`;
      if (submitState === 'error') submitState = 'idle';
    }
  }

  onMount(() => {
    const unsubscribe = tenantIdStore.subscribe((tenantId) => {
      tenantGeneration += 1;
      activeTenantId = tenantId || '';
      isAdding = false;
      searchQuery = '';
      messages = [];
      expandedMessageIds = new Set();
      resetComposer();
      operationMessage = '';
      operationRequestId = '';
      recallTarget = null;
      emailQuota = null;
      emailQuotaError = '';
      emailReview = null;
      announcementReview = null;
      senderSettingsOpen = false;
      activeView = 'email';
      recipientSource = 'manual';
      recipientSourceId = '';
      connectedMailbox = null;
      connectedMailboxError = '';
      selectedDeliveryMode = 'huddleway';
      deliveryReceipts = loadDeliveryReceipts(tenantId || '');
      restoreMessageDraft(tenantId || '');
      if (mailboxConnectionResult) senderSettingsOpen = true;
      if (tenantId) {
        void fetchMessages(tenantId);
        void fetchEmailQuota(tenantId);
        void fetchConnectedMailbox(tenantId);
      } else {
        isLoading = false;
        loadError = '';
        loadRequestId = '';
      }
    });
    return unsubscribe;
  });

  function requestIdFrom(error: unknown) {
    return error instanceof BackendApiError ? error.requestId || '' : '';
  }

  function resetComposer() {
    subject = '';
    body = '';
    composerKind = 'announcement';
    registrationRecipientInput = '';
    teamId = 'program';
    attachmentScope = 'all';
    selectedEventId = '';
    selectedSeasonId = '';
    submitState = 'idle';
    emailReview = null;
    announcementReview = null;
    selectedDeliveryMode = 'huddleway';
  }

  function draftStorageKey(tenantId = activeTenantId) { return `huddleway-message-draft:${tenantId}`; }
  function receiptStorageKey(tenantId = activeTenantId) { return `huddleway-message-receipts:${tenantId}`; }
  function saveMessageDraft() {
    if (!activeTenantId || !isAdding) return;
    window.sessionStorage.setItem(draftStorageKey(), JSON.stringify({ subject, body, composerKind, registrationRecipientInput, attachmentScope, selectedEventId, selectedSeasonId, recipientSource, recipientSourceId }));
  }
  function discardMessageDraft() {
    if (activeTenantId) window.sessionStorage.removeItem(draftStorageKey());
    isAdding = false;
    resetComposer();
  }
  function restoreMessageDraft(tenantId: string) {
    if (!tenantId) return;
    try {
      const saved = JSON.parse(window.sessionStorage.getItem(draftStorageKey(tenantId)) || 'null');
      if (!saved || typeof saved !== 'object') return;
      subject = String(saved.subject || ''); body = String(saved.body || '');
      composerKind = ['announcement', 'email', 'registration_email'].includes(saved.composerKind) ? saved.composerKind : 'announcement';
      registrationRecipientInput = String(saved.registrationRecipientInput || '');
      attachmentScope = ['all', 'event', 'season'].includes(saved.attachmentScope) ? saved.attachmentScope : 'all';
      selectedEventId = String(saved.selectedEventId || ''); selectedSeasonId = String(saved.selectedSeasonId || '');
      recipientSource = ['manual', 'roster', 'team', 'event', 'season'].includes(saved.recipientSource) ? saved.recipientSource : 'manual';
      recipientSourceId = String(saved.recipientSourceId || '');
      activeView = composerKind === 'email' ? 'email' : composerKind === 'announcement' ? 'announcements' : 'registration';
      isAdding = Boolean(subject.trim() || body.trim() || registrationRecipientInput.trim());
    } catch { window.sessionStorage.removeItem(draftStorageKey(tenantId)); }
  }
  function loadDeliveryReceipts(tenantId: string): DeliveryReceipt[] {
    if (!tenantId) return [];
    try { const value = JSON.parse(window.sessionStorage.getItem(receiptStorageKey(tenantId)) || '[]'); return Array.isArray(value) ? value.slice(0, 10) : []; } catch { return []; }
  }
  function addDeliveryReceipt(receipt: Omit<DeliveryReceipt, 'id' | 'sentAt'>) {
    deliveryReceipts = [{ ...receipt, id: globalThis.crypto.randomUUID(), sentAt: new Date().toISOString() }, ...deliveryReceipts].slice(0, 10);
    window.sessionStorage.setItem(receiptStorageKey(), JSON.stringify(deliveryReceipts));
  }

  function recipientEmail(record: Record<string, any>) {
    return String(
      record.email
      || record.participantEmail
      || record.payerEmail
      || record.guardianEmail
      || record.payer?.email
      || record.participant?.email
      || record.profile?.email
      || '',
    ).trim().toLowerCase();
  }

  function useAuthoritativeRecipients() {
    const emails = $registrationsStore.filter((registration) => {
      if (recipientSource === 'roster') return true;
      if (recipientSource === 'team') return String(registration.teamId || '') === recipientSourceId;
      if (recipientSource === 'event') return String(registration.eventId || '') === recipientSourceId;
      if (recipientSource === 'season') return String(registration.seasonId || '') === recipientSourceId;
      return false;
    }).map(recipientEmail).filter(Boolean);
    registrationRecipientInput = [...new Set(emails)].join('\n');
  }

  function duplicateAnnouncement(message: WallMessage) {
    activeView = 'announcements';
    openComposer('announcement');
    subject = message.subject || '';
    body = message.body;
    attachmentScope = message.attachmentScope;
    selectedEventId = message.eventId || '';
    selectedSeasonId = message.seasonId || '';
  }

  async function fetchConnectedMailbox(tenantId: string) {
    connectedMailboxLoading = true;
    connectedMailboxError = '';
    try {
      const snapshot = await registrationOutreachApi.connectedMailbox(tenantId);
      if (tenantId !== activeTenantId) return;
      connectedMailbox = snapshot;
    } catch {
      if (tenantId === activeTenantId) {
        connectedMailboxError = 'Email connection could not be loaded.';
      }
    } finally {
      if (tenantId === activeTenantId) connectedMailboxLoading = false;
    }
  }

  async function connectMailbox(provider: 'google' | 'microsoft') {
    if (!activeTenantId || connectedMailboxLoading) return;
    connectedMailboxLoading = true;
    connectedMailboxError = '';
    try {
      const result = await registrationOutreachApi.startMailboxConnection(activeTenantId, provider);
      window.location.assign(result.authorizationUrl);
    } catch {
      connectedMailboxError = 'Email connection is not available yet.';
      connectedMailboxLoading = false;
    }
  }

  async function disconnectMailbox() {
    if (!activeTenantId || connectedMailboxLoading) return;
    connectedMailboxLoading = true;
    connectedMailboxError = '';
    try {
      connectedMailbox = await registrationOutreachApi.disconnectMailbox(activeTenantId);
      selectedDeliveryMode = 'huddleway';
    } catch {
      connectedMailboxError = 'The email account could not be disconnected.';
    } finally {
      connectedMailboxLoading = false;
    }
  }

  function openComposer(kind: ComposerKind) {
    resetComposer();
    composerKind = kind;
    attachmentScope = kind === 'registration_email' ? 'event' : 'all';
    activeView = kind === 'email' ? 'email' : kind === 'announcement' ? 'announcements' : 'registration';
    isAdding = true;
  }

  async function fetchEmailQuota(tenantId: string, silent = false) {
    if (!silent) emailQuotaLoading = true;
    emailQuotaError = '';
    try {
      const quota = await registrationOutreachApi.emailQuota(tenantId);
      if (tenantId !== activeTenantId) return null;
      emailQuota = quota;
      return quota;
    } catch (error) {
      if (tenantId !== activeTenantId) return null;
      emailQuotaError = error instanceof BackendApiError
        ? 'Email allowance is temporarily unavailable.'
        : 'Email allowance could not be loaded. Check your connection and try again.';
      return null;
    } finally {
      if (!silent && tenantId === activeTenantId) emailQuotaLoading = false;
    }
  }

  function openSenderSettings() {
    senderSettingsOpen = true;
  }

  function closeEmailReview() {
    if (submitState === 'loading') return;
    emailReview = null;
  }

  function closeAnnouncementReview() {
    if (submitState === 'loading') return;
    announcementReview = null;
  }

  async function handleAnnouncementReview() {
    if (submitState === 'loading' || !canPublish) return;
    const tenantId = $tenantIdStore;
    const generation = tenantGeneration;
    if (!tenantId) return;
    submitState = 'loading';
    operationMessage = 'Reviewing the account and device audience…';
    operationRequestId = '';
    try {
      const preview = await backendClient.announcementAudiencePreview(tenantId);
      if (generation !== tenantGeneration || tenantId !== $tenantIdStore) return;
      announcementReview = preview;
      submitState = 'idle';
      operationMessage = '';
    } catch (error) {
      if (generation !== tenantGeneration || tenantId !== $tenantIdStore) return;
      submitState = 'error';
      operationMessage = 'The announcement audience could not be reviewed. Nothing was published.';
      operationRequestId = requestIdFrom(error);
    }
  }

  async function handleEmailReview() {
    if (submitState === 'loading' || !canPublish) return;
    const tenantId = $tenantIdStore;
    const generation = tenantGeneration;
    if (!tenantId) {
      submitState = 'error';
      operationMessage = 'Select an organization before sending.';
      return;
    }
    submitState = 'loading';
    operationMessage = 'Checking recipients and allowance…';
    operationRequestId = '';
    try {
      const [, preview] = await Promise.all([
        fetchEmailQuota(tenantId, true),
        registrationOutreachApi.messageAudiencePreview({
          tenantId,
          emails: registrationRecipientResult.emails,
          eventId: composerKind === 'registration_email' && attachmentScope === 'event'
            ? selectedEventId
            : undefined,
        }),
      ]);
      if (generation !== tenantGeneration || tenantId !== $tenantIdStore) return;
      submitState = 'idle';
      operationMessage = '';
      emailReview = {
        kind: composerKind === 'registration_email' ? 'registration_email' : 'email',
        preview,
      };
      selectedDeliveryMode = 'huddleway';
    } catch (error) {
      if (generation !== tenantGeneration || tenantId !== $tenantIdStore) return;
      submitState = 'error';
      operationMessage = error instanceof BackendApiError
        ? error.message
        : 'Recipients and email allowance could not be checked. Try again.';
      operationRequestId = requestIdFrom(error);
    }
  }

  async function handleOneWayEmail() {
    if (submitState === 'loading' || emailReview?.kind !== 'email') return;
    const tenantId = $tenantIdStore;
    const generation = tenantGeneration;
    if (!tenantId) return;
    submitState = 'loading';
    operationMessage = 'Sending email…';
    operationRequestId = '';
    try {
      const delivery = await registrationOutreachApi.sendOneWayEmail({
        tenantId,
        recipientEmails: registrationRecipientResult.emails,
        subject: subject.trim(),
        message: body.trim(),
        idempotencyKey: postIdempotencyKey,
        deliveryMode: selectedDeliveryMode,
      });
      if (generation !== tenantGeneration || tenantId !== $tenantIdStore) return;
      await fetchEmailQuota(tenantId, true);
      if (generation !== tenantGeneration || tenantId !== $tenantIdStore) return;
      emailReview = null;
      submitState = delivery.failedCount > 0 ? 'error' : 'success';
      const suppressedCopy = delivery.suppressedCount > 0
        ? ` ${delivery.suppressedCount} opted-out recipient${delivery.suppressedCount === 1 ? ' was' : 's were'} skipped.`
        : '';
      operationMessage = delivery.failedCount > 0
        ? `${delivery.sentCount} email${delivery.sentCount === 1 ? '' : 's'} sent; ${delivery.failedCount} failed.${suppressedCopy} Only failed addresses remain in the form.`
        : `${delivery.sentCount} email${delivery.sentCount === 1 ? '' : 's'} sent.${suppressedCopy}`;
      addDeliveryReceipt({ kind: 'Direct email', recipientCount: registrationRecipientResult.emails.length, sentCount: delivery.sentCount, failedCount: delivery.failedCount, sender: selectedDeliveryMode === 'connected_mailbox' ? connectedMailbox?.email || 'Connected mailbox' : 'HuddleWay' });
      operationRequestId = delivery.failedCount > 0 ? delivery.requestId : '';
      if (delivery.failedCount > 0) {
        registrationRecipientInput = delivery.failures
          .map((failure) => failure.email)
          .filter(Boolean)
          .join('\n');
      } else {
        window.sessionStorage.removeItem(draftStorageKey());
        isAdding = false;
        resetComposer();
      }
    } catch (error) {
      if (generation !== tenantGeneration || tenantId !== $tenantIdStore) return;
      emailReview = null;
      submitState = 'error';
      operationMessage = error instanceof BackendApiError
        ? error.message
        : 'The email could not be sent. Check your connection and try again.';
      operationRequestId = requestIdFrom(error);
      await fetchEmailQuota(tenantId, true);
    }
  }

  function confirmEmailSend() {
    if (emailReview?.kind === 'registration_email') {
      void handleRegistrationEmail();
    } else if (emailReview?.kind === 'email') {
      void handleOneWayEmail();
    }
  }

  function parseRecipientEmails(value: string) {
    const emails = new Set<string>();
    let invalidCount = 0;
    for (const rawEntry of value.split(/[\s,;]+/)) {
      const email = rawEntry.trim().toLocaleLowerCase();
      if (!email) continue;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) {
        invalidCount += 1;
        continue;
      }
      emails.add(email);
    }
    return {
      emails: [...emails].sort(),
      invalidCount,
    };
  }

  function handleAttachmentScopeChange() {
    if (attachmentScope === 'all') {
      selectedEventId = '';
      selectedSeasonId = '';
    } else if (attachmentScope === 'event') {
      selectedSeasonId = '';
    } else {
      selectedEventId = '';
    }
  }

  function audienceLabel(messageTeamId: string | null) {
    return messageTeamId && messageTeamId !== 'program'
      ? 'Account holders in this organization · legacy team restriction not enforced'
      : 'Account holders in this organization';
  }

  function attachmentLabel(message: WallMessage) {
    if (message.attachmentScope === 'event' || message.eventId || message.eventTitle) {
      return `Event · ${message.eventTitle || message.eventId || 'Attached event'}`;
    }
    if (message.attachmentScope === 'season' || message.seasonId || message.seasonName) {
      return `Season · ${message.seasonName || message.seasonId || 'Attached season'}`;
    }
    return 'All organization';
  }

  function draftAttachmentLabel() {
    if (attachmentScope === 'event') {
      return `Event · ${eventOptions.find((event) => event.id === selectedEventId)?.title || 'Selected event'}`;
    }
    if (attachmentScope === 'season') {
      return `Season · ${seasonOptions.find((season) => season.id === selectedSeasonId)?.title || 'Selected season'}`;
    }
    return 'All organization';
  }

  function toggleMessageDetails(messageId: string) {
    const nextExpandedIds = new Set(expandedMessageIds);
    if (nextExpandedIds.has(messageId)) {
      nextExpandedIds.delete(messageId);
    } else {
      nextExpandedIds.add(messageId);
    }
    expandedMessageIds = nextExpandedIds;
  }

  function messagePreview(messageBody: string) {
    const normalizedBody = messageBody.trim();
    if (!normalizedBody) return 'Message unavailable';
    return normalizedBody.length > 140
      ? `${normalizedBody.slice(0, 137).trimEnd()}…`
      : normalizedBody;
  }

  async function fetchMessages(tenantId: string) {
    isLoading = true;
    loadError = '';
    loadRequestId = '';
    try {
      const snapshot = await getDocs(query(
        collection(db, 'board_messages'),
        where('tenantId', '==', tenantId),
        where('isDeleted', '==', false),
        where('isSecret', '==', false),
        orderBy('createdAt', 'desc'),
      ));
      if (tenantId !== activeTenantId) return;

      messages = snapshot.docs
        .map((messageDoc) => {
          const data = messageDoc.data();
          return {
            id: messageDoc.id,
            authorName:
              typeof data.authorName === 'string' && data.authorName.trim()
                ? data.authorName.trim()
                : null,
            subject:
              typeof data.subject === 'string' && data.subject.trim()
                ? data.subject.trim()
                : null,
            body: typeof data.body === 'string' ? data.body : '',
            teamId:
              typeof data.teamId === 'string' && data.teamId
                ? data.teamId
                : null,
            attachmentScope: (data.attachmentScope === 'event' || data.eventId
                ? 'event'
                : data.attachmentScope === 'season' || data.seasonId
                  ? 'season'
                  : 'all') as "all" | "event" | "season",
            eventId: typeof data.eventId === 'string' && data.eventId.trim()
              ? data.eventId.trim()
              : null,
            eventTitle: typeof data.eventTitle === 'string' && data.eventTitle.trim()
              ? data.eventTitle.trim()
              : null,
            seasonId: typeof data.seasonId === 'string' && data.seasonId.trim()
              ? data.seasonId.trim()
              : null,
            seasonName: typeof data.seasonName === 'string' && data.seasonName.trim()
              ? data.seasonName.trim()
              : null,
            createdAt: data.createdAt?.toDate?.() || null,
          };
        })
        .sort((a, b) => {
          const dateOrder =
            (b.createdAt?.getTime() ?? Number.NEGATIVE_INFINITY)
            - (a.createdAt?.getTime() ?? Number.NEGATIVE_INFINITY);
          return dateOrder || a.id.localeCompare(b.id);
        });
    } catch (error) {
      console.error('Wall announcements could not be loaded.');
      if (tenantId !== activeTenantId) return;
      loadError = error instanceof BackendApiError && error.status === 403
        ? 'You do not have permission to view Wall announcements.'
        : 'Wall announcements could not be loaded. Check your connection and try again.';
      loadRequestId = requestIdFrom(error);
    } finally {
      if (tenantId === activeTenantId) isLoading = false;
    }
  }

  async function handleAddMessage() {
    if (submitState === 'loading' || !canPublish) return;
    const tenantId = $tenantIdStore;
    const generation = tenantGeneration;
    if (!tenantId) {
      submitState = 'error';
      operationMessage = 'Select an organization before posting.';
      return;
    }

    submitState = 'loading';
    operationMessage = '';
    operationRequestId = '';
    try {
      const result = await backendClient.sendMessageBatch(
        tenantId,
        [{
          id: postMessageId,
          tenantId,
          teamId,
          // The backend derives the authoritative actor from the verified token.
          authorName: '',
          subject: subject.trim(),
          body: body.trim(),
          isSecret: false,
          attachmentScope,
          eventId: attachmentScope === 'event' ? selectedEventId : null,
          seasonId: attachmentScope === 'season' ? selectedSeasonId : null,
        }],
        postIdempotencyKey,
      );
      if (generation !== tenantGeneration || tenantId !== $tenantIdStore) return;
      await fetchMessages(tenantId);
      if (generation !== tenantGeneration || tenantId !== $tenantIdStore) return;
      announcementReview = null;
      submitState = 'success';
      if (result.publicCount === 1 && result.notifications.successCount > 0) {
        const deviceWord = result.notifications.successCount === 1 ? 'device' : 'devices';
        operationMessage = result.notifications.failureCount > 0
          ? `Announcement published. Notification reached ${result.notifications.successCount} registered ${deviceWord}; ${result.notifications.failureCount} delivery attempt(s) failed.`
          : `Announcement published and notification sent to ${result.notifications.successCount} registered ${deviceWord}.`;
      } else if (result.publicCount === 1 && result.notifications.failureCount > 0) {
        operationMessage = 'Announcement published, but its notification could not be delivered.';
      } else if (result.publicCount === 1) {
        operationMessage = 'Announcement published. No registered devices were available for this organization.';
      } else {
        operationMessage = 'Announcement accepted by the delivery service.';
      }
      isAdding = false;
      subject = '';
      body = '';
      teamId = 'program';
      attachmentScope = 'all';
      selectedEventId = '';
      selectedSeasonId = '';
    } catch (error) {
      if (generation !== tenantGeneration || tenantId !== $tenantIdStore) return;
      submitState = 'error';
      operationMessage = error instanceof BackendApiError
        ? 'The announcement could not be published.'
        : 'The announcement could not be published. Check your connection and try again.';
      operationRequestId = requestIdFrom(error);
    }
  }

  async function handleRegistrationEmail() {
    if (
      submitState === 'loading'
      || !canPublish
      || emailReview?.kind !== 'registration_email'
    ) return;
    const tenantId = $tenantIdStore;
    const generation = tenantGeneration;
    if (!tenantId) {
      submitState = 'error';
      operationMessage = 'Select an organization before sending.';
      return;
    }

    const targetType = attachmentScope === 'season' ? 'season' : 'event';
    const targetId = targetType === 'season'
      ? selectedSeasonId
      : selectedEventId;
    const selectedEvent = eventOptions.find((event) => event.id === selectedEventId);
    const selectedSeason = seasonOptions.find((season) => season.id === selectedSeasonId);
    const targetTitle = targetType === 'season'
      ? selectedSeason?.title || 'Season registration'
      : selectedEvent?.title || 'Event registration';
    const recipientEmails = registrationRecipientResult.emails;

    submitState = 'loading';
    operationMessage = 'Creating a temporary registration page…';
    operationRequestId = '';
    try {
      const invite = await registrationOutreachApi.createInvite({
        tenantId,
        targetType,
        targetId,
        ...(targetType === 'event' ? { eventId: selectedEventId } : {}),
        recipientEmails,
        idempotencyKey: postIdempotencyKey,
      });
      if (generation !== tenantGeneration || tenantId !== $tenantIdStore) return;

      operationMessage = `Sending ${recipientEmails.length} registration email${recipientEmails.length === 1 ? '' : 's'}…`;
      const delivery = await registrationOutreachApi.sendEmail({
        tenantId,
        recipientEmails,
        subject: subject.trim(),
        message: body.trim(),
        eventTitle: invite.displayTitle || targetTitle,
        registrationUrl: invite.url,
        registrationLabel: invite.registrationKind === 'free'
          ? 'Register free'
          : 'Register and pay',
        amountCents: invite.priceCents,
        currency: invite.currency,
        eventId: selectedEventId,
        idempotencyKey: `${postIdempotencyKey}:email`,
        deliveryMode: selectedDeliveryMode,
      });
      if (generation !== tenantGeneration || tenantId !== $tenantIdStore) return;

      await fetchEmailQuota(tenantId, true);
      if (generation !== tenantGeneration || tenantId !== $tenantIdStore) return;
      emailReview = null;
      submitState = delivery.failedCount > 0 ? 'error' : 'success';
      const expiration = new Date(invite.expiresAt).toLocaleString();
      const suppressedCopy = delivery.suppressedCount > 0
        ? ` ${delivery.suppressedCount} opted-out recipient${delivery.suppressedCount === 1 ? ' was' : 's were'} skipped.`
        : '';
      operationMessage = delivery.failedCount > 0
        ? `${delivery.sentCount} email${delivery.sentCount === 1 ? '' : 's'} sent; ${delivery.failedCount} failed.${suppressedCopy} Only the failed addresses remain in the form. The registration link closes ${expiration}.`
        : `${delivery.sentCount} registration email${delivery.sentCount === 1 ? '' : 's'} sent.${suppressedCopy} The registration link closes ${expiration}.`;
      addDeliveryReceipt({ kind: 'Registration outreach', recipientCount: recipientEmails.length, sentCount: delivery.sentCount, failedCount: delivery.failedCount, sender: selectedDeliveryMode === 'connected_mailbox' ? connectedMailbox?.email || 'Connected mailbox' : 'HuddleWay' });
      operationRequestId = delivery.failedCount > 0 ? delivery.requestId : '';
      if (delivery.failedCount > 0) {
        registrationRecipientInput = delivery.failures
          .map((failure) => failure.email)
          .filter(Boolean)
          .join('\n');
      } else {
        window.sessionStorage.removeItem(draftStorageKey());
        isAdding = false;
        resetComposer();
      }
    } catch (error) {
      if (generation !== tenantGeneration || tenantId !== $tenantIdStore) return;
      emailReview = null;
      submitState = 'error';
      operationMessage = error instanceof BackendApiError
        ? error.message
        : 'The registration email could not be sent. Check your connection and try again.';
      operationRequestId = requestIdFrom(error);
      await fetchEmailQuota(tenantId, true);
    }
  }

  function requestRecall(message: WallMessage) {
    if (recallingMessageId) return;
    recallTarget = message;
    recallReason = '';
  }

  function closeRecallDialog() {
    if (recallingMessageId) return;
    recallTarget = null;
    recallReason = '';
  }

  async function handleRecallMessage() {
    if (recallingMessageId) return;
    const id = recallTarget?.id;
    if (!id || recallReason.trim().length < 3) return;

    const tenantId = $tenantIdStore;
    const generation = tenantGeneration;
    if (!tenantId) {
      operationMessage = 'Select an organization before deleting a post.';
      return;
    }
    recallingMessageId = id;
    operationMessage = '';
    operationRequestId = '';
    const idempotencyKey = recallIdempotencyKeys.get(id)
      || createIdempotencyKey(`message-recall-${id}`);
    recallIdempotencyKeys.set(id, idempotencyKey);
    try {
      await backendClient.recallMessage(
        tenantId,
        id,
        idempotencyKey,
        recallReason.trim(),
      );
      if (generation !== tenantGeneration || tenantId !== $tenantIdStore) return;
      await fetchMessages(tenantId);
      if (generation !== tenantGeneration || tenantId !== $tenantIdStore) return;
      recallIdempotencyKeys.delete(id);
      operationMessage = 'Announcement deleted.';
      recallTarget = null;
      recallReason = '';
    } catch (error) {
      if (generation !== tenantGeneration || tenantId !== $tenantIdStore) return;
      operationMessage = 'The announcement could not be deleted.';
      operationRequestId = requestIdFrom(error);
    } finally {
      if (generation === tenantGeneration && tenantId === $tenantIdStore) {
        recallingMessageId = '';
      }
    }
  }

  onDestroy(() => {
    if (activeTenantId) clearPortalDraft(`messages:${activeTenantId}`);
  });
</script>

  {#if announcementReview}
    <AnnouncementPublishReview
      {subject}
      {body}
      audienceCount={announcementReview.eligibleAccountCount}
      deviceCount={announcementReview.eligibleDeviceCount}
      audienceTruncated={announcementReview.truncated}
      attachment={draftAttachmentLabel()}
      busy={submitState === 'loading'}
      onCancel={closeAnnouncementReview}
      onConfirm={handleAddMessage}
    />
  {/if}

  {#if emailReview}
  <div class="crm-ui-modal-root" role="dialog" aria-modal="true" aria-labelledby="email-review-title">
    <div class="flex min-h-full items-center justify-center p-4">
      <button
        type="button"
        class="fixed inset-0 z-0 h-full w-full bg-slate-950/70"
        aria-label="Close email review"
        tabindex="-1"
        disabled={submitState === 'loading'}
        on:click={closeEmailReview}
      ></button>
      <div
        class="crm-ui-message-modal-lg"
        tabindex="-1"
        use:modalFocus={{ onEscape: closeEmailReview, initialFocusSelector: '[data-email-review-cancel]' }}
      >
        <h3 id="email-review-title" class="text-lg font-semibold text-gray-900">Review email send</h3>
        <p class="mt-2 text-sm text-gray-600">
          This will send to {emailReview.preview.emailEligibleCount.toLocaleString()} eligible
          {emailReview.preview.emailEligibleCount === 1 ? ' recipient' : ' recipients'}.
        </p>
        <fieldset class="mt-4 rounded-lg border border-gray-200 p-4">
          <legend class="px-1 text-sm font-semibold text-gray-900">Send from</legend>
          {#if emailReview.preview.emailEligibleCount > 100}
            <div class="crm-theme-surface rounded-md p-3 text-sm">
              <p class="font-medium">{emailReview.preview.emailEligibleCount.toLocaleString()} recipients · HuddleWay delivery</p>
              <p class="mt-1 text-xs">Over 100 recipients use HuddleWay automatically. Replies go to your account email.</p>
            </div>
          {:else}
            <label class="crm-ui-message-radio cursor-pointer">
              <input type="radio" bind:group={selectedDeliveryMode} value="huddleway" class="mt-1" />
              <span><span class="block text-sm font-medium text-gray-900">Organization via HuddleWay</span><span class="block text-xs text-gray-600">Reliable default.</span></span>
            </label>
            <label class="crm-ui-message-radio mt-2 {connectedMailbox?.connected ? 'cursor-pointer' : 'crm-ui-message-radio-disabled'}">
              <input type="radio" bind:group={selectedDeliveryMode} value="connected_mailbox" disabled={!connectedMailbox?.connected} class="mt-1" />
              <span>
                <span class="block text-sm font-medium text-gray-900">{connectedMailbox?.connected ? `My email · ${connectedMailbox.email}` : 'My connected email'}</span>
                <span class="block text-xs text-gray-600">{connectedMailbox?.connected ? 'Customers see your connected address.' : 'Connect Google or Microsoft first.'}</span>
              </span>
            </label>
          {/if}
        </fieldset>
        <dl class="crm-ui-message-summary">
          <div>
            <dt class="crm-ui-message-term">Unique addresses</dt>
            <dd class="mt-1 font-semibold text-gray-900">{emailReview.preview.uniqueRecipientCount.toLocaleString()}</dd>
          </div>
          <div>
            <dt class="crm-ui-message-term">Opted out</dt>
            <dd class="mt-1 font-semibold text-gray-900">{emailReview.preview.emailSuppressedCount.toLocaleString()}</dd>
          </div>
          {#if selectedDeliveryMode === 'connected_mailbox'}
            <div class="sm:col-span-2">
              <dt class="crm-ui-message-term">Personal email limit</dt>
              <dd class="mt-1 font-semibold text-gray-900">Up to 100 recipients for this message.</dd>
            </div>
          {:else if emailReview.preview.monthlyAllowanceVisible}
            <div>
              <dt class="crm-ui-message-term">Monthly allowance before send</dt>
              <dd class="mt-1 font-semibold text-gray-900">
                {emailReview.preview.tenantEmailRemaining.toLocaleString()} of {emailReview.preview.tenantEmailMonthlyLimit.toLocaleString()} left
              </dd>
            </div>
            <div>
              <dt class="crm-ui-message-term">After this send</dt>
              <dd class="mt-1 font-semibold text-gray-900">
                {Math.max(0, emailReview.preview.tenantEmailRemaining - emailReview.preview.emailEligibleCount).toLocaleString()} left
              </dd>
            </div>
          {:else}
            <div class="sm:col-span-2">
              <dt class="crm-ui-message-term">Temporary sending limit</dt>
              <dd class="mt-1 font-semibold text-gray-900">Up to 100 recipients per email are available right now.</dd>
            </div>
          {/if}
        </dl>
        {#if selectedDeliveryMode === 'connected_mailbox'}
          <p class="mt-3 text-xs text-gray-500">Your provider may apply its own limits. Personal sends do not use the HuddleWay allowance.</p>
        {:else if emailReview.preview.monthlyAllowanceVisible}
          <p class="mt-3 text-xs text-gray-500">
            The allowance resets {new Date(emailReview.preview.tenantEmailResetsAt).toLocaleDateString()}.
            The allowance resets monthly per organization. Accepted sends count toward the {emailReview.preview.tenantEmailMonthlyLimit.toLocaleString()}-email limit.
          </p>
        {:else}
          <p class="mt-3 text-xs text-gray-500">Larger sends will return automatically when normal sending capacity is available.</p>
        {/if}
        {#if emailReview.preview.emailEligibleCount === 0}
          <p class="mt-3 text-sm text-amber-800" role="alert">No eligible recipients remain after preferences are applied.</p>
        {/if}
        <div class="mt-6 flex justify-end gap-3">
          <button
            type="button"
            data-email-review-cancel
            disabled={submitState === 'loading'}
            class="crm-ui-button-secondary"
            on:click={closeEmailReview}
          >Cancel</button>
          <button
            type="button"
            disabled={submitState === 'loading' || emailReview.preview.emailEligibleCount === 0}
            class="crm-ui-button-primary"
            on:click={confirmEmailSend}
          >
            {submitState === 'loading'
              ? 'Sending…'
              : `Send ${emailReview.preview.emailEligibleCount.toLocaleString()} email${emailReview.preview.emailEligibleCount === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

{#if recallTarget}
  <div class="crm-ui-modal-root" role="dialog" aria-modal="true" aria-labelledby="recall-announcement-title">
    <div class="flex min-h-full items-center justify-center p-4">
      <button
        type="button"
        class="fixed inset-0 z-0 h-full w-full bg-slate-950/70"
        aria-label="Close delete confirmation"
        tabindex="-1"
        disabled={Boolean(recallingMessageId)}
        on:click={closeRecallDialog}
      ></button>
      <div
        class="crm-ui-message-modal-md"
        tabindex="-1"
        use:modalFocus={{ onEscape: closeRecallDialog, initialFocusSelector: '[data-recall-cancel]' }}
      >
        <h3 id="recall-announcement-title" class="text-lg font-semibold text-gray-900">Delete announcement?</h3>
        <p class="mt-2 text-sm text-gray-600">
          Delete “{recallTarget.subject || 'Untitled announcement'}” from {audienceLabel(recallTarget.teamId)}. The Wall post will no longer be available to that audience.
        </p>
        <label class="mt-4 block text-sm font-medium text-gray-700">Audit reason<textarea class="mt-1 block w-full rounded-md border border-gray-300 p-2" rows="2" minlength="3" maxlength="500" bind:value={recallReason}></textarea></label>
        <div class="mt-6 flex justify-end gap-3">
          <button
            type="button"
            data-recall-cancel
            disabled={Boolean(recallingMessageId)}
            class="crm-ui-button-secondary"
            on:click={closeRecallDialog}
          >Cancel</button>
          <button
            type="button"
            disabled={Boolean(recallingMessageId) || recallReason.trim().length < 3}
            class="crm-ui-danger-button"
            on:click={handleRecallMessage}
          >{recallingMessageId ? 'Deleting…' : 'Delete announcement'}</button>
        </div>
      </div>
    </div>
  </div>
{/if}

<div class="crm-ui-message-root">
  <div class="max-w-3xl">
    <h2 class="text-xl font-bold text-gray-900">Messages & email</h2>
    <p class="mt-1 text-sm text-gray-500">Choose the type of outreach you want to send. Each tool below serves a different audience and purpose.</p>
  </div>

  <nav class="flex flex-wrap gap-2 rounded-lg border border-gray-200 bg-white p-2" aria-label="Message workspaces">
    {#each messageViews as view}
      <button type="button" aria-pressed={activeView === view.id} class="rounded-md px-4 py-2 text-sm font-medium {activeView === view.id ? 'crm-theme-selected' : 'text-gray-600 hover:bg-gray-50'}" on:click={() => activeView = view.id}>{view.label}{view.id === 'conversations' && conversationUnreadCount ? ` (${conversationUnreadCount})` : ''}</button>
    {/each}
  </nav>

  <section class="crm-ui-message-direct" class:hidden={activeView !== 'email'} aria-labelledby="direct-email-heading">
    <div class="crm-ui-message-split">
      <div class="max-w-2xl">
        <p class="crm-ui-message-eyebrow">Customer outreach</p>
        <h3 id="direct-email-heading" class="mt-1 text-lg font-semibold text-gray-900">Direct email</h3>
        <p class="mt-1 text-sm text-gray-600">Send one email or a group message. Use your connected email for up to 100 recipients.</p>
      </div>
      <div class="flex shrink-0 flex-wrap gap-2">
        <button
          type="button"
          disabled={emailQuota?.emailSendingStatus === 'suspended' || emailQuota?.capacityMode === 'unavailable'}
          class="crm-ui-message-primary"
          on:click={() => openComposer('email')}
        >
          New email
        </button>
        <button
          type="button"
          class="crm-ui-message-secondary-blue"
          on:click={openSenderSettings}
        >
          Email connection
        </button>
      </div>
    </div>
    <div class="mt-4">
      {#if emailQuota}
        <div class="crm-ui-message-allowance {emailQuota.emailSendingStatus === 'suspended' ? 'crm-ui-message-allowance-paused' : emailQuota.capacityMode === 'normal' ? 'crm-ui-message-allowance-normal' : 'crm-ui-message-allowance-limited'}" role="status" aria-label="Email allowance">
          {#if emailQuota.emailSendingStatus === 'suspended'}
            <div class="mb-3 border-b border-red-200 pb-3">
              <p class="text-sm font-semibold text-red-900">Email sending is paused for this organization</p>
              <p class="mt-1 text-xs text-red-800">Email is paused after high bounce or complaint rates. Review is required.</p>
            </div>
          {/if}
          <div class="crm-ui-message-allowance-heading">
            {#if emailQuota.capacityMode === 'temporary_limited'}
              <div>
                <p class="text-sm font-semibold text-gray-800">Temporary sending limit</p>
                <p class="mt-1 text-xs text-gray-600">Up to 100 recipients per email are available. Larger sends will return automatically.</p>
              </div>
            {:else if emailQuota.capacityMode === 'unavailable'}
              <p class="text-sm font-semibold text-gray-700">Email sending is temporarily unavailable</p>
            {:else}
              <p class="text-sm font-semibold {emailQuota.emailSendingStatus === 'suspended' ? 'crm-ui-message-title-paused' : 'crm-ui-message-title-ready'}">
                {emailQuota.remainingCount.toLocaleString()} of {emailQuota.monthlyLimit.toLocaleString()} emails left this month
              </p>
              <p class="crm-theme-link shrink-0 text-xs font-medium">Resets {new Date(emailQuota.resetsAt).toLocaleDateString()}</p>
            {/if}
          </div>
          <div class="crm-ui-message-allowance-meta {emailQuota.capacityMode === 'normal' ? 'crm-ui-message-meta-normal' : 'crm-ui-message-meta-limited'}">
            <p>
              {emailQuota.providerReconciliationStatus === 'verified'
                ? `Email usage checked${emailQuota.providerReconciledAt ? ` ${new Date(emailQuota.providerReconciledAt).toLocaleString()}` : ''}`
                : emailQuota.providerReconciliationStatus === 'unavailable'
                  ? 'Protected counter active · usage check will retry'
                  : 'Protected tenant counter active'}
            </p>
            <p class="sm:text-right">
              {connectedMailbox?.connected && connectedMailbox.email
                ? `Personal sender available up to 100 · ${connectedMailbox.email}`
                : 'HuddleWay sender ready · connect a personal email for smaller groups'}
            </p>
          </div>
        </div>
      {:else if emailQuotaLoading}
        <p class="text-xs text-gray-500" role="status">Loading email allowance…</p>
      {:else if emailQuotaError}
        <button
          type="button"
          class="crm-ui-notice-sm"
          on:click={() => activeTenantId && fetchEmailQuota(activeTenantId)}
        >Email allowance unavailable · Retry</button>
      {/if}
    </div>
  </section>

  {#if activeView === 'email' && deliveryReceipts.length}
    <section class="rounded-lg border border-gray-200 bg-white p-4" aria-labelledby="delivery-receipts-title"><h3 id="delivery-receipts-title" class="font-semibold text-gray-900">Recent delivery receipts</h3><p class="mt-1 text-xs text-gray-500">The 10 most recent sends retained in this browser session.</p><ul class="mt-3 divide-y divide-gray-100">{#each deliveryReceipts as receipt (receipt.id)}<li class="grid gap-1 py-3 text-sm sm:grid-cols-4"><span class="font-medium">{receipt.kind}</span><span>{receipt.sentCount}/{receipt.recipientCount} sent</span><span>{receipt.failedCount} failed · {receipt.sender}</span><time datetime={receipt.sentAt}>{new Date(receipt.sentAt).toLocaleString()}</time></li>{/each}</ul></section>
  {/if}

  <div class="grid gap-4 md:grid-cols-2">
    <section class="crm-ui-message-card" class:hidden={activeView !== 'announcements'} aria-labelledby="app-announcement-heading">
      <p class="crm-ui-message-eyebrow">In-app communication</p>
      <h3 id="app-announcement-heading" class="mt-1 text-lg font-semibold text-gray-900">App announcement</h3>
      <p class="mt-1 flex-1 text-sm text-gray-600">Publish an update for registered account holders and notify their active devices.</p>
      <button
        type="button"
        class="crm-ui-message-secondary-blue mt-4 w-full"
        on:click={() => openComposer('announcement')}
      >
        New announcement
      </button>
    </section>

    <section class="crm-ui-message-card" class:hidden={activeView !== 'registration'} aria-labelledby="registration-outreach-heading">
      <p class="crm-ui-message-eyebrow">Enrollment</p>
      <h3 id="registration-outreach-heading" class="mt-1 text-lg font-semibold text-gray-900">Registration outreach</h3>
      <p class="mt-1 flex-1 text-sm text-gray-600">Create a temporary registration link and email it to prospective participants.</p>
      <button
        type="button"
      disabled={emailQuota?.emailSendingStatus === 'suspended' || emailQuota?.capacityMode === 'unavailable'}
        class="crm-ui-message-primary mt-4 w-full"
        on:click={() => openComposer('registration_email')}
      >
        Start registration email
      </button>
    </section>
  </div>

  {#if senderSettingsOpen && activeView === 'email'}
    <section class="crm-ui-message-settings" aria-labelledby="connected-email-heading">
      <div class="flex items-start justify-between gap-4">
        <div>
          <p class="crm-ui-message-eyebrow">Personal sender</p>
          <h3 id="connected-email-heading" class="mt-1 text-lg font-semibold text-gray-900">Connect your email</h3>
          <p class="mt-1 text-sm text-gray-600">Connect an email for groups of 100 or fewer. Larger groups use HuddleWay.</p>
        </div>
        <button type="button" class="crm-ui-button-secondary" on:click={() => { senderSettingsOpen = false; }}>Close</button>
      </div>
      {#if mailboxConnectionResult === 'connected'}
        <p class="crm-ui-message-success" role="status">Email connected for messages to 100 or fewer recipients.</p>
      {:else if mailboxConnectionResult === 'error'}
        <p class="crm-ui-notice-card mt-4" role="alert">Email was not connected. Try again.</p>
      {/if}
      {#if connectedMailboxLoading}
        <p class="mt-4 text-sm text-gray-500" role="status">Loading email connection…</p>
      {:else if connectedMailbox?.connected}
        <div class="crm-ui-message-connected-card">
          <p class="font-semibold">Connected: {connectedMailbox.email}</p>
          <p class="mt-1 text-sm">Ready for messages to 100 or fewer recipients.</p>
          <button type="button" class="crm-ui-message-disconnect" on:click={disconnectMailbox}>Disconnect</button>
        </div>
      {:else}
        <div class="mt-4 grid gap-3 sm:grid-cols-2">
          <button type="button" disabled={!connectedMailbox?.availableProviders.includes('google')} class="crm-ui-message-provider" on:click={() => connectMailbox('google')}>
            Connect Google or Gmail{connectedMailbox && !connectedMailbox.availableProviders.includes('google') ? ' · Not configured' : ''}
          </button>
          <button type="button" disabled={!connectedMailbox?.availableProviders.includes('microsoft')} class="crm-ui-message-provider" on:click={() => connectMailbox('microsoft')}>
            Connect Microsoft or Outlook{connectedMailbox && !connectedMailbox.availableProviders.includes('microsoft') ? ' · Not configured' : ''}
          </button>
        </div>
        <p class="mt-3 text-xs text-gray-500">HuddleWay never receives your password. If a provider is not configured, ask a platform administrator to enable its OAuth connection.</p>
      {/if}
      {#if connectedMailboxError}
        <p class="crm-ui-notice-card mt-4" role="alert">{connectedMailboxError}</p>
      {/if}
    </section>
  {/if}

  {#if operationMessage}
    <div
      class="crm-ui-message-operation {submitState === 'error' ? 'crm-ui-message-operation-error' : 'crm-ui-message-operation-ok'}"
      role={submitState === 'error' ? 'alert' : 'status'}
    >
      <p>{operationMessage}</p>
    </div>
  {/if}

  {#if isAdding && ((composerKind === 'email' && activeView === 'email') || (composerKind === 'announcement' && activeView === 'announcements') || (composerKind === 'registration_email' && activeView === 'registration'))}
    <section class="crm-ui-message-composer" aria-labelledby="new-announcement-heading">
      <h3 id="new-announcement-heading" class="mb-4 text-lg font-bold">
        {composerKind === 'registration_email'
          ? 'Send registration email'
          : composerKind === 'email'
            ? 'Send email'
            : 'Create announcement'}
      </h3>
      <div class="space-y-4">
        <div>
          <p class="crm-ui-label">Audience</p>
          <p class="crm-ui-message-audience">
            {#if composerKind === 'registration_email'}
              Paste recipient emails. HuddleWay sends a temporary registration link using the same form and payment rules as the app.
            {:else if composerKind === 'email'}
              Paste one or more addresses. Duplicates are removed before the allowance check. Replies go to the selected sender; groups over 100 must use the HuddleWay sender.
            {:else}
              Only this organization’s account holders receive this announcement and notification.
            {/if}
          </p>
        </div>
        {#if composerKind !== 'email'}
          <div>
          <label for="announcement-attachment" class="crm-ui-label">
            {composerKind === 'registration_email' ? 'Registration for' : 'Attach announcement to'}
          </label>
          <select
            id="announcement-attachment"
            bind:value={attachmentScope}
            on:change={handleAttachmentScopeChange}
            class="crm-ui-message-select"
          >
            {#if composerKind === 'announcement'}
              <option value="all">All organization account holders</option>
            {/if}
            <option value="event">An event</option>
            <option value="season">A season</option>
          </select>
          <p class="crm-ui-hint">
            {composerKind === 'registration_email'
              ? 'The link closes automatically when registration, the event, or the season ends.'
              : 'Choose one event, one season, or leave it for everyone.'}
          </p>
          </div>
        {/if}
        {#if composerKind !== 'email' && attachmentScope === 'event'}
          <div>
            <label for="announcement-event" class="crm-ui-label">Event</label>
            <select
              id="announcement-event"
              bind:value={selectedEventId}
              disabled={eventOptions.length === 0}
              class="crm-ui-message-select disabled:bg-gray-100"
            >
              <option value="">Select an event</option>
              {#each composerKind === 'registration_email' ? eligibleEventOptions : eventOptions as event}
                <option value={event.id}>{event.title}{composerKind === 'registration_email' && event.endDate ? ` · closes ${new Date(event.endDate).toLocaleDateString()}` : ''}</option>
              {/each}
            </select>
            {#if eventOptions.length === 0}<p class="crm-ui-hint">No events are available for this organization.</p>{/if}
          </div>
        {:else if composerKind !== 'email' && attachmentScope === 'season'}
          <div>
            <label for="announcement-season" class="crm-ui-label">Season</label>
            <select
              id="announcement-season"
              bind:value={selectedSeasonId}
              disabled={seasonOptions.length === 0}
              class="crm-ui-message-select disabled:bg-gray-100"
            >
              <option value="">Select a season</option>
              {#each seasonOptions as season}
                <option value={season.id}>{season.title}</option>
              {/each}
            </select>
            {#if seasonOptions.length === 0}<p class="crm-ui-hint">No seasons are available for this organization.</p>{/if}
          </div>
        {/if}
        {#if composerKind !== 'announcement'}
          <div>
            <div class="mb-3 rounded-md border border-gray-200 bg-gray-50 p-3">
              <label for="recipient-source" class="crm-ui-label">Recipient source</label>
              <div class="grid gap-2 sm:grid-cols-[1fr,1fr,auto]">
                <select id="recipient-source" class="crm-ui-message-select" bind:value={recipientSource} on:change={() => recipientSourceId = ''}><option value="manual">Manual addresses</option><option value="roster">Entire loaded roster</option><option value="team">Team</option><option value="event">Event</option><option value="season">Season</option></select>
                {#if recipientSource === 'team'}<select aria-label="Recipient team" class="crm-ui-message-select" bind:value={recipientSourceId}><option value="">Select team</option>{#each $teamsStore as team}<option value={team.id}>{team.name || team.id}</option>{/each}</select>
                {:else if recipientSource === 'event'}<select aria-label="Recipient event" class="crm-ui-message-select" bind:value={recipientSourceId}><option value="">Select event</option>{#each eventOptions as event}<option value={event.id}>{event.title}</option>{/each}</select>
                {:else if recipientSource === 'season'}<select aria-label="Recipient season" class="crm-ui-message-select" bind:value={recipientSourceId}><option value="">Select season</option>{#each seasonOptions as season}<option value={season.id}>{season.title}</option>{/each}</select>
                {/if}
                {#if recipientSource !== 'manual'}<button type="button" class="crm-ui-button-secondary" disabled={recipientSource !== 'roster' && !recipientSourceId} on:click={useAuthoritativeRecipients}>Use recipients</button>{/if}
              </div>
              <p class="mt-2 text-xs text-gray-500">Portal records are the primary source. Manual addresses remain available for exceptional recipients.</p>
            </div>
            <label for="registration-recipient-emails" class="crm-ui-label">Recipient emails</label>
            <textarea
              id="registration-recipient-emails"
              bind:value={registrationRecipientInput}
              rows="5"
              placeholder="family@example.com&#10;another-family@example.com"
              class="crm-ui-message-recipient {registrationRecipientResult.invalidCount > 0 ? 'crm-ui-message-recipient-invalid' : 'crm-ui-message-recipient-valid'}"
              aria-invalid={registrationRecipientResult.invalidCount > 0 ? 'true' : 'false'}
              aria-describedby="registration-recipient-help"
            ></textarea>
            <p
              id="registration-recipient-help"
              class="{registrationRecipientResult.invalidCount > 0 ? 'crm-ui-message-invalid-hint' : 'crm-ui-hint'}"
              role={registrationRecipientResult.invalidCount > 0 ? 'alert' : undefined}
            >
              {registrationRecipientResult.emails.length}/{emailRecipientLimit} unique valid addresses
              {#if registrationRecipientResult.invalidCount > 0}
                · Remove {registrationRecipientResult.invalidCount} invalid {registrationRecipientResult.invalidCount === 1 ? 'entry' : 'entries'} to continue
              {/if}
            </p>
          </div>
        {/if}
        <div>
          <label for="announcement-subject" class="crm-ui-label">
            Subject{composerKind === 'email' ? '' : ' (optional)'}
          </label>
          <input
            id="announcement-subject"
            type="text"
            bind:value={subject}
            maxlength={SUBJECT_MAX_LENGTH}
            class="crm-ui-message-field"
            aria-describedby="announcement-subject-help"
          />
          <p id="announcement-subject-help" class="crm-ui-hint">{subject.length}/{SUBJECT_MAX_LENGTH} characters</p>
        </div>
        <div>
          <label for="announcement-body" class="crm-ui-label">Message</label>
          <textarea
            id="announcement-body"
            bind:value={body}
            rows="5"
            maxlength={BODY_MAX_LENGTH}
            class="crm-ui-message-field"
            aria-describedby="announcement-body-help"
          ></textarea>
          <p id="announcement-body-help" class="crm-ui-hint">{body.length}/{BODY_MAX_LENGTH} characters</p>
        </div>
        <div class="flex flex-wrap justify-end gap-3">
          <button
            type="button"
            class="crm-ui-button-secondary bg-white text-gray-700"
            disabled={submitState === 'loading'}
            on:click={() => { isAdding = false; resetComposer(); }}
          >
            Cancel
          </button>
          <StatusButton
            type="button"
            state={submitState}
            on:click={composerKind === 'announcement' ? handleAnnouncementReview : handleEmailReview}
            disabled={!canPublish || submitState === 'loading'}
            idleText={composerKind === 'announcement'
              ? 'Publish announcement'
              : composerKind === 'registration_email'
                ? 'Review registration email'
                : 'Review email'}
            loadingText={composerKind === 'announcement' ? 'Reviewing audience…' : 'Checking allowance…'}
            successText={composerKind === 'announcement' ? 'Published' : 'Email sent'}
            errorText={composerKind === 'announcement'
              ? 'Retry publish'
              : composerKind === 'registration_email'
                ? 'Review registration email again'
                : 'Review email again'}
            class="crm-ui-button-primary"
          />
        </div>
      </div>
    </section>
  {/if}

  <div class:hidden={activeView !== 'conversations'}><ConsumerAdminInbox registrations={$registrationsStore} teams={$teamsStore} events={$eventsStore} on:unreadCount={(event) => conversationUnreadCount = event.detail} /></div>

  <section class="crm-ui-message-list" class:hidden={activeView !== 'announcements'} aria-labelledby="wall-announcements-heading">
    <div class="border-b border-gray-200 p-4">
      <div class="crm-ui-message-list-header">
        <div class="flex flex-wrap gap-2">
          <h3 id="wall-announcements-heading" class="font-semibold text-gray-900">Published announcements</h3>
          <p class="crm-ui-hint">
            {messages.length} published
          </p>
        </div>
        <div>
          <label for="announcement-search" class="block text-xs font-medium text-gray-600">Search loaded announcements</label>
          <input
            id="announcement-search"
            type="search"
            bind:value={searchQuery}
            class="crm-ui-input sm:w-72"
          />
          <select aria-label="Filter announcement audience" class="crm-ui-input" bind:value={historyAudienceFilter}><option value="all">All audiences</option><option value="organization">Organization-wide</option><option value="event">Event</option><option value="season">Season</option></select>
          <input aria-label="Announcements since date" type="date" class="crm-ui-input" bind:value={historyDateFilter} />
        </div>
      </div>
    </div>

    {#if isLoading}
      <div class="p-8 text-center text-gray-500" role="status">Loading announcements…</div>
    {:else if loadError}
      <div class="p-8 text-center" role="alert">
        <p class="text-sm text-red-700">{loadError}</p>
        <button type="button" class="crm-ui-button-secondary mt-4" on:click={() => activeTenantId && fetchMessages(activeTenantId)}>Try again</button>
      </div>
    {:else if messages.length === 0}
      <div class="p-8 text-center text-gray-500">No Wall announcements have been published.</div>
    {:else if visibleMessages.length === 0}
      <div class="p-8 text-center text-gray-500">No loaded announcements match “{searchQuery}”.</div>
    {:else}
      <ul class="divide-y divide-gray-200">
        {#each visibleMessages as message (message.id)}
          <li class="hover:bg-gray-50">
            <div class="flex items-start gap-4 p-4">
              <button
                type="button"
                class="crm-ui-message-row-button"
                aria-expanded={expandedMessageIds.has(message.id)}
                aria-controls={`announcement-details-${message.id}`}
                on:click={() => toggleMessageDetails(message.id)}
              >
                <div class="flex items-start justify-between gap-4">
                  <div class="min-w-0">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="font-bold text-gray-900">{message.authorName || 'Actor unavailable'}</span>
                      <span class="crm-ui-hint-xs">• {message.createdAt ? message.createdAt.toLocaleString() : 'Timestamp unavailable'}</span>
                    </div>
                    <p class="mt-1 text-sm font-medium text-gray-900">{message.subject || 'Announcement'}</p>
                    {#if !expandedMessageIds.has(message.id)}
                      <p class="mt-1 break-words text-sm text-gray-600">{messagePreview(message.body)}</p>
                    {/if}
                  </div>
                  <svg class="crm-ui-message-chevron {expandedMessageIds.has(message.id) ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                  </svg>
                </div>
              </button>
              <button
                type="button"
                class="crm-ui-message-delete"
                on:click={() => requestRecall(message)}
                disabled={Boolean(recallingMessageId)}
              >
                {recallingMessageId === message.id ? 'Deleting…' : 'Delete'}
              </button>
            </div>
            {#if expandedMessageIds.has(message.id)}
              <div id={`announcement-details-${message.id}`} class="crm-ui-message-detail-panel">
                <h4 class="crm-ui-message-details">Details</h4>
                <p class="crm-ui-message-detail-body">{message.body || 'Message unavailable'}</p>
                <dl class="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                  <div>
                    <dt class="crm-ui-message-term">Audience</dt>
                    <dd class="mt-1 text-gray-900">{audienceLabel(message.teamId)}</dd>
                  </div>
                  <div>
                    <dt class="crm-ui-message-term">Attachment</dt>
                    <dd class="mt-1 text-gray-900">{attachmentLabel(message)}</dd>
                  </div>
                  <div>
                    <dt class="crm-ui-message-term">Published by</dt>
                    <dd class="mt-1 text-gray-900">{message.authorName || 'Actor unavailable'}</dd>
                  </div>
                  <div>
                    <dt class="crm-ui-message-term">Published</dt>
                    <dd class="mt-1 text-gray-900">{message.createdAt ? message.createdAt.toLocaleString() : 'Timestamp unavailable'}</dd>
                  </div>
                </dl>
                <button type="button" class="crm-ui-button-secondary mt-4" on:click={() => duplicateAnnouncement(message)}>Duplicate as new</button>
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</div>
