<script lang="ts">
  import { toast } from './ui/toast';
  import { registerLiveRefresh } from '../../lib/crm/liveRefresh';
  import { onMount as mountRefresh } from 'svelte';
  import { onDestroy, onMount } from 'svelte';
  import { tenantIdStore } from '../../lib/authStore';
  import { backendClient } from '../../lib/api/backendClient';
  import { announcementDeliveryFeedback } from '../../lib/api/AnnouncementDeliveryResult';
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
  import Icon from './ui/Icon.svelte';
  import EmailSendReview from './messages/EmailSendReview.svelte';
  import SentMessageList, { type SentItem } from './messages/SentMessageList.svelte';
  import DirectMessageComposer from './messages/DirectMessageComposer.svelte';
  import CompactMessageComposer from './messages/CompactMessageComposer.svelte';
  import CompactAnnouncementComposer from './messages/CompactAnnouncementComposer.svelte';
  import './messages/messaging.css';
  import AnnouncementPublishReview from './messages/AnnouncementPublishReview.svelte';
  import { clearPortalDraft, registerPortalDraft } from '../../lib/ui/portalDraftGuard';
  import {
    announcementImportanceOptions,
    normalizeAnnouncementImportance,
    type AnnouncementImportance,
    type AttachmentScope,
  } from '../../lib/ui/announcementAssociation';

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
    audienceVisibility?: 'everyone' | 'event_registrants';
    isSecret: boolean;
    targetEmail?: string;
    teamId: string | null;
    attachmentScope: 'all' | 'team' | 'event' | 'season';
    eventIds?: string[];
    eventTeamIds?: string[];
    seasonIds?: string[];
    eventId: string | null;
    eventTeamId: string | null;
    eventTitle: string | null;
    seasonId: string | null;
    seasonName: string | null;
    importance: string;
    createdAt: Date | null;
  };

  type ComposerKind = 'announcement' | 'email' | 'registration_email' | 'direct';
  type MessageView = 'email' | 'announcements' | 'registration' | 'conversations';
  type EmailReview = {
    kind: Extract<ComposerKind, 'email' | 'registration_email'>;
    preview: MessageAudiencePreview;
  };
  type DeliveryReceipt = { subject?: string; body?: string; messageIds?: string[]; emails?: string[]; id: string; kind: string; sentAt: string; recipientCount: number; sentCount: number; failedCount: number; sender: string; channel?: 'email' | 'in_app'; pendingCount?: number };

  const SUBJECT_MAX_LENGTH = 200;
  const BODY_MAX_LENGTH = 4_000;
  const DEFAULT_EMAIL_RECIPIENT_LIMIT = 400;
  const importanceOptions = announcementImportanceOptions;
  const historyAssociationTabs = [
    { id: 'all', label: 'All', compactLabel: 'All' },
    { id: 'organization', label: 'Organization', compactLabel: 'Org' },
    { id: 'team', label: 'Teams', compactLabel: 'Team' },
    { id: 'event', label: 'Events', compactLabel: 'Event' },
    { id: 'season', label: 'Seasons', compactLabel: 'Season' },
  ];

  let messages: WallMessage[] = [];
  let isAdding = false;
  let isLoading = true;
  let loadError = '';
  let loadRequestId = '';
  let activeTenantId = '';
  let searchQuery = '';
  const messageViews: Array<{ id: MessageView; label: string }> = [
    { id: 'conversations', label: 'Inbox' },
    { id: 'announcements', label: 'Sent' },
  ];
  let activeView: MessageView = 'conversations';
  let latestReceipt: DeliveryReceipt | null = null;
  let recipientSource: 'manual' | 'roster' | 'team' | 'event' | 'season' = 'manual';
  let recipientSourceId = '';
  let historyAudienceFilter = 'all';
  let announcementSearchOpen = false;
  let conversationUnreadCount = 0;
  let deliveryReceipts: DeliveryReceipt[] = [];
  let expandedMessageIds = new Set<string>();

  let subject = '';
  let body = '';
  let composerKind: ComposerKind = 'announcement';
  let registrationRecipientInput = '';
  let teamId = 'program';
  let attachmentScope: AttachmentScope = 'all';
  let announcementVisibility: 'everyone' | 'event_registrants' = 'everyone';
  let selectedTeamId = '';
  let selectedEventId = '';
  let selectedSeasonId = '';
  let selectedTeamIds: string[] = [];
  let selectedEventIds: string[] = [];
  let selectedSeasonIds: string[] = [];
  let selectedImportance: AnnouncementImportance = 'routine';
  let submitState: 'idle' | 'loading' | 'success' | 'error' = 'idle';
  let announcementSaved = false;
  let operationMessage = '';
  let operationRequestId = '';
  let recallingMessageId = '';
  let postIdempotencyKey = createIdempotencyKey('message-batch');
  let postMessageId = `message_${globalThis.crypto.randomUUID()}`;
  let editingMessageId = '';
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

  const normalizedImportance = normalizeAnnouncementImportance;

  function syncAssociationDefaults() {
    if (attachmentScope === 'event') {
      const event = eventOptions.find((option) => option.id === selectedEventId);
      selectedTeamId = event?.teamId || '';
      selectedSeasonId = event?.seasonId || '';
      selectedImportance = event?.importance || 'standard';
      return;
    }
    if (attachmentScope === 'season') {
      const season = seasonOptions.find((option) => option.id === selectedSeasonId);
      selectedTeamId = season?.teamId || '';
      if (selectedImportance === 'routine') selectedImportance = 'standard';
      return;
    }
    if (attachmentScope === 'team' && selectedImportance === 'routine') {
      selectedImportance = 'standard';
    }
  }

  function importancePreviewColor(value: AnnouncementImportance) {
    if (value === 'routine') return '#94a3b8';
    if (value === 'urgent') return '#dc2626';
    return eventOptions.find((event) => event.id === selectedEventId)?.associationColorHex
      || teamOptions.find((team) => team.id === selectedTeamId)?.associationColorHex
      || 'var(--crm-brand-control)';
  }

  $: eventOptions = $eventsStore
    .map((event) => ({
      id: String(event.id || '').trim(),
      title: String(event.title || event.name || event.id || 'Untitled event').trim(),
      endDate: serializedDate(event.registrationEndDate || event.endDate || event.date),
      status: String(event.lifecycleStatus || '').trim().toLowerCase(),
      isVisible: event.isVisible === true,
      isDeleted: event.isDeleted === true,
      isRegistrationEnabled: event.isRegistrationEnabled === true,
      teamId: String(event.teamId || '').trim(),
      seasonId: String(event.seasonId || '').trim(),
      imageUrl: String(event.imageUrl || '').trim(),
      importance: normalizedImportance(event.importance, event.title || event.name),
      associationColorHex: String(event.accentColorHex || '').trim(),
    }))
    .filter((event) => event.id)
    .sort((a, b) => a.title.localeCompare(b.title));
  $: eligibleEventOptions = eventOptions.filter((event) => {
    const date = event.endDate ? new Date(event.endDate) : null;
    return event.status === 'published' && event.isVisible && !event.isDeleted && event.isRegistrationEnabled
      && (!date || Number.isNaN(date.getTime()) || date.getTime() >= Date.now());
  });
  $: seasonOptions = $seasonsStore
    .map((season) => ({
      id: String(season.id || '').trim(),
      title: String(season.name || season.title || season.id || 'Untitled season').trim(),
      teamId: String(season.teamId || '').trim(),
      imageUrl: String(season.imageUrl || '').trim(),
    }))
    .filter((season) => season.id)
    .sort((a, b) => a.title.localeCompare(b.title));
  $: teamOptions = $teamsStore
    .map((team) => ({
      id: String(team.referenceId || team.id || '').trim(),
      title: String(team.name || team.title || team.id || 'Untitled team').trim(),
      associationColorHex: String(team.accentColorHex || team.colorHex || team.primaryColor || '').trim(),
    }))
    .filter((team) => team.id)
    .sort((a, b) => a.title.localeCompare(b.title));
  $: directMessages = messages.filter((message) => message.isSecret);
  $: sentItems = [
    ...messages.map((message): SentItem => ({ id: message.id, sourceId: message.id,
      kind: message.isSecret ? 'direct' : 'announcement', subject: message.isSecret ? composerContacts.find((person) => person.email === message.targetEmail)?.name || message.targetEmail || message.subject || 'Direct message' : message.subject || 'Announcement',
      body: message.body, createdAt: message.createdAt?.toISOString() || '', status: message.isSecret ? 'In app' : 'Published',
      association: message.isSecret ? message.targetEmail : attachmentLabel(message) })),
    ...deliveryReceipts.filter((receipt) => receipt.channel !== 'in_app' || !receipt.messageIds?.some((id) => messages.some((message) => message.id === id))).map((receipt): SentItem => ({ id: receipt.id, kind: receipt.channel === 'in_app' ? 'direct' : 'email',
      subject: receipt.channel === 'in_app' ? receipt.emails?.map((email) => composerContacts.find((person) => person.email === email)?.name || email).join(', ') || receipt.kind : receipt.subject || receipt.kind, body: receipt.body || '', createdAt: receipt.sentAt,
      status: receipt.channel === 'in_app' ? (receipt.pendingCount ? `${receipt.sentCount} ready · ${receipt.pendingCount} pending activation` : 'In app') : receipt.failedCount ? `${receipt.sentCount} sent · ${receipt.failedCount} failed` : 'Sent', recipientCount: receipt.recipientCount })),
  ].sort((a, b) => Date.parse(b.createdAt || '1970-01-01') - Date.parse(a.createdAt || '1970-01-01'));
  $: chatMessages = [
    ...directMessages.filter((message) => message.targetEmail && registrationRecipientResult.emails.includes(message.targetEmail))
      .map((message) => ({ id: message.id, body: message.body, sentAt: message.createdAt?.toISOString() || '', status: 'In app' })),
    ...deliveryReceipts.filter((receipt) => receipt.channel === 'in_app' && receipt.emails?.some((email) => registrationRecipientResult.emails.includes(email))
      && !receipt.messageIds?.some((id) => directMessages.some((message) => message.id === id)))
      .map((receipt) => ({ id: receipt.id, body: receipt.body || '', sentAt: receipt.sentAt,
        status: receipt.pendingCount ? `${receipt.sentCount} ready · ${receipt.pendingCount} pending activation` : 'In app' })),
  ].sort((a, b) => Date.parse(a.sentAt || '1970-01-01') - Date.parse(b.sentAt || '1970-01-01'));

  $: visibleMessages = messages.filter((message) => {
    if (message.isSecret) return false;
    const associationMatches = historyAudienceFilter === 'all'
      || (historyAudienceFilter === 'organization' ? message.attachmentScope === 'all' : message.attachmentScope === historyAudienceFilter);
    const searchMatches = !normalizedSearch || [message.authorName, message.subject, message.body,
      audienceLabel(message.teamId), attachmentLabel(message)]
      .some((value) => value?.toLocaleLowerCase().includes(normalizedSearch));
    return associationMatches && searchMatches;
  });
  $: registrationRecipientResult = parseRecipientEmails(registrationRecipientInput);
  $: composerContacts = [...new Map($registrationsStore.map((record) => {
    const email = recipientEmail(record);
    const name = String(record.guardianName || record.parentName || record.payer?.name || email).trim();
    return [email, { email, name }] as const;
  }).filter(([email]) => email)).values()];
  $: composerGroups = [
    { id: 'roster', label: 'Roster', emails: composerContacts.map((contact) => contact.email) },
    ...$teamsStore.map((team) => ({ id: `team:${team.id}`, label: team.name || team.id, emails: groupEmails('teamId', team.id) })),
    ...eventOptions.map((event) => ({ id: `event:${event.id}`, label: event.title, emails: groupEmails('eventId', event.id) })),
    ...seasonOptions.map((season) => ({ id: `season:${season.id}`, label: season.title, emails: groupEmails('seasonId', season.id) })),
  ].filter((group) => group.emails.length > 0);

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
  $: emailRecipientLimit = selectedDeliveryMode === 'connected_mailbox' ? 100 : emailQuota?.perSendLimit ? emailQuota.perSendLimit : DEFAULT_EMAIL_RECIPIENT_LIMIT;
  $: registrationTargetId = attachmentScope === 'season'
    ? selectedSeasonId
    : selectedEventId;
  $: postIsValid = composerKind === 'announcement'
    ? teamId === 'program'
        && body.trim().length > 0
        && body.trim().length <= BODY_MAX_LENGTH
        && subject.trim().length <= SUBJECT_MAX_LENGTH
        && (attachmentScope === 'all'
          || (attachmentScope === 'team' && Boolean(selectedTeamId))
          || (attachmentScope === 'event' && Boolean(selectedEventId))
          || (attachmentScope === 'season' && Boolean(selectedSeasonId)))
    : composerKind === 'direct'
      ? body.trim().length > 0 && body.trim().length <= BODY_MAX_LENGTH
        && subject.trim().length <= SUBJECT_MAX_LENGTH
        && registrationRecipientResult.invalidCount === 0
        && registrationRecipientResult.emails.length > 0
        && registrationRecipientResult.emails.length <= 100
    : composerKind === 'email'
      ? subject.trim().length > 0
        && subject.trim().length <= SUBJECT_MAX_LENGTH
        && body.trim().length > 0
        && body.trim().length <= BODY_MAX_LENGTH
        && registrationRecipientResult.invalidCount === 0
        && registrationRecipientResult.emails.length > 0
        && registrationRecipientResult.emails.length <= emailRecipientLimit
      : body.trim().length > 0
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
    activeView = 'registration';
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
      announcementVisibility,
      selectedEventId,
      selectedSeasonId,
      selectedTeamId,
      selectedImportance, selectedTeamIds, selectedEventIds, selectedSeasonIds,
      editingMessageId,
      selectedDeliveryMode,
      composerKind,
      registrationRecipientInput,
    });
    if (signature !== postPayloadSignature && submitState !== 'loading') {
      announcementSaved = false;
      announcementReview = null;
      postPayloadSignature = signature;
      saveMessageDraft();
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
      historyAudienceFilter = 'all';
      announcementSearchOpen = false;
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
      activeView = 'conversations';
      latestReceipt = null;
      recipientSource = 'manual';
      recipientSourceId = '';
      connectedMailbox = null;
      connectedMailboxError = '';
      selectedDeliveryMode = 'huddleway';
      deliveryReceipts = loadDeliveryReceipts(tenantId || '');
      restoreMessageDraft(tenantId || '');
      if (mailboxConnectionResult) { senderSettingsOpen = true; activeView = 'email'; }
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
    announcementSaved = false;
    subject = '';
    body = '';
    composerKind = 'announcement';
    registrationRecipientInput = '';
    teamId = 'program';
    attachmentScope = 'all';
    announcementVisibility = 'everyone';
    selectedTeamId = '';
    selectedEventId = '';
    selectedSeasonId = '';
    selectedImportance = 'routine';
    selectedTeamIds = []; selectedEventIds = []; selectedSeasonIds = [];
    editingMessageId = '';
    submitState = 'idle';
    emailReview = null;
    announcementReview = null;
    selectedDeliveryMode = 'huddleway';
  }

  function draftStorageKey(tenantId = activeTenantId) { return `huddleway-message-draft:${tenantId}`; }
  function receiptStorageKey(tenantId = activeTenantId) { return `huddleway-message-receipts:${tenantId}`; }
  function saveMessageDraft() {
    if (!activeTenantId || !isAdding) return;
    window.sessionStorage.setItem(draftStorageKey(), JSON.stringify({ subject, body, composerKind, registrationRecipientInput, announcementVisibility, attachmentScope, selectedTeamId, selectedEventId, selectedSeasonId, selectedImportance, selectedTeamIds, selectedEventIds, selectedSeasonIds, recipientSource, recipientSourceId }));
  }
  function returnToInbox() {
    if (submitState === 'loading') return;
    saveMessageDraft();
    announcementReview = null;
    emailReview = null;
    isAdding = false;
    activeView = 'conversations';
  }

  function discardMessageDraft() {
    if (activeTenantId) window.sessionStorage.removeItem(draftStorageKey());
    isAdding = false;
    activeView = 'conversations';
    resetComposer();
  }
  function restoreMessageDraft(tenantId: string) {
    if (!tenantId) return;
    try {
      const saved = JSON.parse(window.sessionStorage.getItem(draftStorageKey(tenantId)) || 'null');
      if (!saved || typeof saved !== 'object') return;
      subject = String(saved.subject || ''); body = String(saved.body || '');
      composerKind = ['announcement', 'email', 'registration_email', 'direct'].includes(saved.composerKind) ? saved.composerKind : 'announcement';
      registrationRecipientInput = String(saved.registrationRecipientInput || '');
      announcementVisibility = saved.announcementVisibility === 'event_registrants' ? 'event_registrants' : 'everyone';
      attachmentScope = ['all', 'team', 'event', 'season'].includes(saved.attachmentScope) ? saved.attachmentScope : 'all';
      selectedTeamId = String(saved.selectedTeamId || '');
      selectedEventId = String(saved.selectedEventId || ''); selectedSeasonId = String(saved.selectedSeasonId || '');
      selectedTeamIds = Array.isArray(saved.selectedTeamIds) ? saved.selectedTeamIds : attachmentScope === 'team' && selectedTeamId ? [selectedTeamId] : [];
      selectedEventIds = Array.isArray(saved.selectedEventIds) ? saved.selectedEventIds : attachmentScope === 'event' && selectedEventId ? [selectedEventId] : [];
      selectedSeasonIds = Array.isArray(saved.selectedSeasonIds) ? saved.selectedSeasonIds : attachmentScope === 'season' && selectedSeasonId ? [selectedSeasonId] : [];
      selectedImportance = normalizedImportance(saved.selectedImportance) as AnnouncementImportance;
      recipientSource = ['manual', 'roster', 'team', 'event', 'season'].includes(saved.recipientSource) ? saved.recipientSource : 'manual';
      recipientSourceId = String(saved.recipientSourceId || '');
      activeView = composerKind === 'email' ? 'email' : composerKind === 'announcement' ? 'announcements' : composerKind === 'direct' ? 'conversations' : 'registration';
      isAdding = Boolean(subject.trim() || body.trim() || registrationRecipientInput.trim());
    } catch { window.sessionStorage.removeItem(draftStorageKey(tenantId)); }
  }
  function loadDeliveryReceipts(tenantId: string): DeliveryReceipt[] {
    if (!tenantId) return [];
    try { const value = JSON.parse(window.sessionStorage.getItem(receiptStorageKey(tenantId)) || '[]'); return Array.isArray(value) ? value.slice(0, 10) : []; } catch { return []; }
  }
  function addDeliveryReceipt(receipt: Omit<DeliveryReceipt, 'id' | 'sentAt'>) {
    latestReceipt = { subject: subject.trim(), body: body.trim(), ...receipt, id: globalThis.crypto.randomUUID(), sentAt: new Date().toISOString() };
    deliveryReceipts = [latestReceipt, ...deliveryReceipts].slice(0, 10);
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

  function groupEmails(field: 'teamId' | 'eventId' | 'seasonId', id: string) {
    return [...new Set($registrationsStore.filter((record) => String(record[field] || '') === id).map(recipientEmail).filter(Boolean))];
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
    announcementVisibility = message.audienceVisibility || 'everyone';
    selectedTeamId = message.eventTeamId || '';
    selectedEventId = message.eventId || '';
    selectedSeasonId = message.seasonId || '';
    selectedTeamIds = message.eventTeamIds || (attachmentScope === 'team' && selectedTeamId ? [selectedTeamId] : []);
    selectedEventIds = message.eventIds || (attachmentScope === 'event' && selectedEventId ? [selectedEventId] : []);
    selectedSeasonIds = message.seasonIds || (attachmentScope === 'season' && selectedSeasonId ? [selectedSeasonId] : []);
    selectedImportance = normalizedImportance(message.importance) as AnnouncementImportance;
  }

  function editAnnouncement(message: WallMessage) {
    duplicateAnnouncement(message);
    editingMessageId = message.id;
    operationMessage = '';
    operationRequestId = '';
  }

  function announcementPayload(tenantId: string, id: string) {
    return {
      id,
      tenantId,
      teamId,
      authorName: '',
      subject: subject.trim(),
      body: body.trim(),
      isSecret: false,
      audienceVisibility: announcementVisibility,
      attachmentScope,
      eventIds: attachmentScope === 'event' ? selectedEventIds : [],
      eventTeamIds: attachmentScope === 'team' ? selectedTeamIds : attachmentScope === 'event' ? [...new Set(eventOptions.filter((item) => selectedEventIds.includes(item.id)).map((item) => item.teamId).filter(Boolean))] : attachmentScope === 'season' ? [...new Set(seasonOptions.filter((item) => selectedSeasonIds.includes(item.id)).map((item) => item.teamId).filter(Boolean))] : [],
      seasonIds: attachmentScope === 'season' ? selectedSeasonIds : attachmentScope === 'event' ? [...new Set(eventOptions.filter((item) => selectedEventIds.includes(item.id)).map((item) => item.seasonId).filter(Boolean))] : [],
      eventId: attachmentScope === 'event' ? selectedEventId : null,
      eventTeamId: selectedTeamId || null,
      eventTitle: attachmentScope === 'event'
        ? eventOptions.find((event) => event.id === selectedEventId)?.title || null
        : null,
      eventImageUrl: attachmentScope === 'event'
        ? eventOptions.find((event) => event.id === selectedEventId)?.imageUrl || null
        : attachmentScope === 'season'
          ? seasonOptions.find((season) => season.id === selectedSeasonId)?.imageUrl || null
          : null,
      seasonId: ['season', 'event'].includes(attachmentScope) ? selectedSeasonId || null : null,
      seasonTitle: selectedSeasonId
        ? seasonOptions.find((season) => season.id === selectedSeasonId)?.title || null
        : null,
      importance: selectedImportance,
      associationColorHex: eventOptions.find((event) => event.id === selectedEventId)?.associationColorHex
        || teamOptions.find((team) => team.id === selectedTeamId)?.associationColorHex
        || null,
    };
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
    latestReceipt = null;
    operationMessage = '';
    resetComposer();
    composerKind = kind;
    attachmentScope = kind === 'registration_email' ? 'event' : 'all';
    activeView = kind === 'email' ? 'email' : kind === 'announcement' ? 'announcements' : kind === 'direct' ? 'conversations' : 'registration';
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
    saveMessageDraft();
    isAdding = false;
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
      const preview = await backendClient.announcementAudiencePreview(tenantId, announcementPayload(tenantId, postMessageId));
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
      const quota = await fetchEmailQuota(tenantId, true);
      if (generation !== tenantGeneration || tenantId !== $tenantIdStore) return;
      if (!quota) throw new Error('Email availability could not be checked. Try again.');
      if (quota.emailSendingStatus === 'suspended') throw new Error('Email sending is paused for this organization. Your draft is saved.');
      if (selectedDeliveryMode === 'connected_mailbox' && !connectedMailbox?.connected) throw new Error('Connect your email before sending.');
      if (selectedDeliveryMode !== 'connected_mailbox' && quota.capacityMode === 'unavailable') throw new Error('Email sending is temporarily unavailable. Your draft is saved. Try again later.');
      const preview = await registrationOutreachApi.messageAudiencePreview({
        tenantId, emails: registrationRecipientResult.emails,
        ...(selectedDeliveryMode === 'connected_mailbox' ? { deliveryMode: selectedDeliveryMode } : {}),
        eventId: composerKind === 'registration_email' && attachmentScope === 'event' ? selectedEventId : undefined,
      });
      if (generation !== tenantGeneration || tenantId !== $tenantIdStore) return;
      submitState = 'idle';
      operationMessage = '';
      emailReview = {
        kind: composerKind === 'registration_email' ? 'registration_email' : 'email',
        preview,
      };
      if (!connectedMailbox?.connected || preview.emailEligibleCount > 100) selectedDeliveryMode = 'huddleway';
    } catch (error) {
      if (generation !== tenantGeneration || tenantId !== $tenantIdStore) return;
      submitState = 'error';
      operationMessage = error instanceof BackendApiError
        ? error.message
        : error instanceof Error ? error.message : 'Recipients and email allowance could not be checked. Try again.';
      operationRequestId = requestIdFrom(error);
    }
  }

  async function handleDirectSend() {
    if (submitState === 'loading' || composerKind !== 'direct' || !canPublish || registrationRecipientResult.emails.length !== 1) return;
    const tenantId = $tenantIdStore;
    const generation = tenantGeneration;
    if (!tenantId) return;
    const emails = [...registrationRecipientResult.emails];
    submitState = 'loading';
    operationMessage = '';
    operationRequestId = '';
    try {
      const result = await backendClient.sendMessageBatch(tenantId, emails.map((email, index) => ({
        id: `${postMessageId}_${index}`, tenantId, teamId: 'program',
        subject: subject.trim(), body: body.trim(), isSecret: true, targetEmail: email,
      })), postIdempotencyKey);
      if (generation !== tenantGeneration || tenantId !== $tenantIdStore) return;
      addDeliveryReceipt({ kind: 'Direct message', channel: 'in_app', emails, messageIds: emails.map((_, index) => `${postMessageId}_${index}`), recipientCount: emails.length,
        sentCount: result.activeRecipientCount, pendingCount: result.retainedRecipientCount,
        failedCount: 0, sender: 'HuddleWay' });
      body = '';
      subject = '';
      submitState = 'idle';
      void fetchMessages(tenantId, true);
    } catch (error) {
      if (generation !== tenantGeneration || tenantId !== $tenantIdStore) return;
      submitState = 'error';
      operationMessage = error instanceof BackendApiError ? error.message : 'Message could not be sent. Try again.';
      operationRequestId = requestIdFrom(error);
    }
  }

  async function handleOneWayEmail() {
    if (submitState === 'loading' || emailReview?.kind !== 'email' || (selectedDeliveryMode !== 'connected_mailbox' && emailQuota?.capacityMode === 'unavailable') || emailQuota?.emailSendingStatus === 'suspended') return;
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
        activeView = 'announcements';
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
    if (attachmentScope !== 'event') announcementVisibility = 'everyone';
    selectedTeamIds = []; selectedEventIds = []; selectedSeasonIds = [];
    selectedTeamId = ''; selectedEventId = ''; selectedSeasonId = '';
    if (attachmentScope === 'all') {
      selectedTeamId = '';
      selectedEventId = '';
      selectedSeasonId = '';
      selectedImportance = 'routine';
    } else if (attachmentScope === 'team') {
      selectedEventId = '';
      selectedSeasonId = '';
      selectedImportance = 'standard';
    } else if (attachmentScope === 'event') {
      selectedTeamId = '';
      selectedSeasonId = '';
    } else {
      selectedTeamId = '';
      selectedEventId = '';
    }
  }

  function audienceLabel(_messageTeamId: string | null) {
    return 'All organization account holders';
  }

  function attachmentLabel(message: WallMessage) {
    const ids = message.attachmentScope === 'team' ? message.eventTeamIds : message.attachmentScope === 'season' ? message.seasonIds : message.eventIds;
    if (ids && ids.length > 1) {
      const options = message.attachmentScope === 'team' ? teamOptions : message.attachmentScope === 'season' ? seasonOptions : eventOptions;
      return ids.map((id) => options.find((item) => item.id === id)?.title || id).join(', ');
    }
    if (message.attachmentScope === 'event' || message.eventId || message.eventTitle) {
      return `Event · ${message.eventTitle || message.eventId || 'Attached event'}`;
    }
    if (message.attachmentScope === 'season' || message.seasonId || message.seasonName) {
      return `Season · ${message.seasonName || message.seasonId || 'Attached season'}`;
    }
    if (message.attachmentScope === 'team' || message.eventTeamId) {
      return `Team · ${teamOptions.find((team) => team.id === message.eventTeamId)?.title || message.eventTeamId || 'Attached team'}`;
    }
    return 'All organization';
  }

  function draftAttachmentLabel() {
    const ids = attachmentScope === 'team' ? selectedTeamIds : attachmentScope === 'event' ? selectedEventIds : selectedSeasonIds;
    const options = attachmentScope === 'team' ? teamOptions : attachmentScope === 'event' ? eventOptions : seasonOptions;
    if (attachmentScope !== 'all' && ids.length > 1) return options.filter((item) => ids.includes(item.id)).map((item) => item.title).join(', ');
    if (attachmentScope === 'event') {
      return `Event · ${eventOptions.find((event) => event.id === selectedEventId)?.title || 'Selected event'}`;
    }
    if (attachmentScope === 'season') {
      return `Season · ${seasonOptions.find((season) => season.id === selectedSeasonId)?.title || 'Selected season'}`;
    }
    if (attachmentScope === 'team') {
      return `Team · ${teamOptions.find((team) => team.id === selectedTeamId)?.title || 'Selected team'}`;
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

  async function fetchMessages(tenantId: string, silent = false) {
    if (!silent) isLoading = true;
    loadError = '';
    loadRequestId = '';
    try {
      const records: Array<Record<string, unknown> & { id: string }> = [];
      let cursor: string | undefined;
      for (const collection of ['board_messages', 'restricted_board_messages'] as const) {
      cursor = undefined;
      do {
        const page = await backendClient.crmOperationalPage(
          tenantId,
          collection,
          { limit: 100, cursor },
        );
        records.push(...page.records);
        cursor = page.hasMore ? page.nextCursor || undefined : undefined;
      } while (cursor);
      }
      if (tenantId !== activeTenantId) return;

      messages = records
        .map((data) => {
          const createdAt = data.createdAt
            ? new Date(String(data.createdAt))
            : null;
          return {
            id: data.id,
            authorName:
              typeof data.authorName === 'string' && data.authorName.trim()
                ? data.authorName.trim()
                : null,
            subject:
              typeof data.subject === 'string' && data.subject.trim()
                ? data.subject.trim()
                : null,
            body: typeof data.body === 'string' ? data.body : '',
            audienceVisibility: data.audienceVisibility === 'event_registrants' ? 'event_registrants' as const : 'everyone' as const,
            isSecret: data.isSecret === true,
            targetEmail: typeof data.targetEmail === 'string' ? data.targetEmail.toLowerCase() : undefined,
            teamId:
              typeof data.teamId === 'string' && data.teamId
                ? data.teamId
                : null,
            attachmentScope: (data.attachmentScope === 'event' || data.eventId
                ? 'event'
                : data.attachmentScope === 'season' || data.seasonId
                  ? 'season'
                  : data.attachmentScope === 'team' || data.eventTeamId
                    ? 'team'
                    : 'all') as AttachmentScope,
            eventIds: Array.isArray(data.eventIds) ? data.eventIds : undefined,
            eventTeamIds: Array.isArray(data.eventTeamIds) ? data.eventTeamIds : undefined,
            seasonIds: Array.isArray(data.seasonIds) ? data.seasonIds : undefined,
            eventId: typeof data.eventId === 'string' && data.eventId.trim()
              ? data.eventId.trim()
              : null,
            eventTeamId: typeof data.eventTeamId === 'string' && data.eventTeamId.trim()
              ? data.eventTeamId.trim()
              : null,
            eventTitle: typeof data.eventTitle === 'string' && data.eventTitle.trim()
              ? data.eventTitle.trim()
              : null,
            seasonId: typeof data.seasonId === 'string' && data.seasonId.trim()
              ? data.seasonId.trim()
              : null,
            seasonName: typeof data.seasonName === 'string' && data.seasonName.trim()
              ? data.seasonName.trim()
              : typeof data.seasonTitle === 'string' && data.seasonTitle.trim()
                ? data.seasonTitle.trim()
              : null,
            importance: normalizedImportance(data.importance, data.subject),
            createdAt: createdAt && !Number.isNaN(createdAt.getTime())
              ? createdAt
              : null,
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
    const publishedMessageId = postMessageId;
    try {
      const result = await backendClient.sendMessageBatch(
        tenantId,
        [announcementPayload(tenantId, publishedMessageId)],
        postIdempotencyKey,
      );
      if (generation !== tenantGeneration || tenantId !== $tenantIdStore) return;
      await fetchMessages(tenantId);
      if (generation !== tenantGeneration || tenantId !== $tenantIdStore) return;
      announcementReview = null;
      searchQuery = '';
      historyAudienceFilter = 'all';
      announcementSearchOpen = false;
      expandedMessageIds = new Set([publishedMessageId]);
      const delivery = announcementDeliveryFeedback(result);
      announcementSaved = true;
      submitState = delivery.complete ? 'success' : 'error';
      operationMessage = delivery.message;
      operationRequestId = result.requestId;
      // Keep the same draft/message IDs when provider acceptance is uncertain.
      if (!delivery.complete) return;
      window.sessionStorage.removeItem(draftStorageKey());
      isAdding = false;
      subject = '';
      body = '';
      teamId = 'program';
      attachmentScope = 'all';
    announcementVisibility = 'everyone';
      selectedTeamId = '';
      selectedEventId = '';
      selectedSeasonId = '';
      selectedImportance = 'routine';
    } catch (error) {
      if (generation !== tenantGeneration || tenantId !== $tenantIdStore) return;
      submitState = 'error';
      operationMessage = error instanceof BackendApiError
        ? 'The announcement could not be published.'
        : 'The announcement could not be published. Check your connection and try again.';
      operationRequestId = requestIdFrom(error);
    }
  }

  async function handleUpdateAnnouncement() {
    if (submitState === 'loading' || !canPublish || !editingMessageId) return;
    const tenantId = $tenantIdStore;
    const generation = tenantGeneration;
    if (!tenantId) return;
    const updatedMessageId = editingMessageId;
    submitState = 'loading';
    operationMessage = '';
    operationRequestId = '';
    try {
      await backendClient.updateAnnouncement(
        tenantId,
        updatedMessageId,
        announcementPayload(tenantId, updatedMessageId),
        postIdempotencyKey,
      );
      if (generation !== tenantGeneration || tenantId !== $tenantIdStore) return;
      await fetchMessages(tenantId);
      if (generation !== tenantGeneration || tenantId !== $tenantIdStore) return;
      searchQuery = '';
      historyAudienceFilter = 'all';
      announcementSearchOpen = false;
      expandedMessageIds = new Set([updatedMessageId]);
      submitState = 'success';
      operationMessage = 'Announcement updated in Published announcements below. Edits do not send another push notification.';
      isAdding = false;
      resetComposer();
    } catch (error) {
      if (generation !== tenantGeneration || tenantId !== $tenantIdStore) return;
      submitState = 'error';
      operationMessage = 'The announcement could not be updated.';
      operationRequestId = requestIdFrom(error);
    }
  }

  function handleAnnouncementSubmit() {
    if (editingMessageId) return handleUpdateAnnouncement();
    if (announcementSaved) return handleAddMessage();
    return handleAnnouncementReview();
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
        activeView = 'announcements';
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

  mountRefresh(() => registerLiveRefresh(() => activeTenantId && !isLoading && !isAdding && submitState !== 'loading' ? Promise.all([fetchMessages(activeTenantId, true), fetchEmailQuota(activeTenantId, true)]) : undefined));
</script>

  {#if isAdding && composerKind === 'announcement' && announcementReview}
    <AnnouncementPublishReview
      {subject}
      {body}
      audienceCount={announcementReview.eligibleAccountCount}
      deviceCount={announcementReview.eligibleDeviceCount}
      audienceTruncated={announcementReview.truncated}
      attachment={draftAttachmentLabel()} audienceLabel={announcementVisibility === 'event_registrants' ? 'Registered only' : 'All users'}
      busy={submitState === 'loading'}
      onCancel={closeAnnouncementReview}
      onConfirm={handleAddMessage}
    />
  {/if}

  {#if isAdding && emailReview}
    <EmailSendReview {subject} {body} preview={emailReview.preview}
      bind:deliveryMode={selectedDeliveryMode} connectedEmail={connectedMailbox?.connected ? connectedMailbox.email || '' : ''}
      sendingAvailable={Boolean(emailQuota) && emailQuota?.emailSendingStatus !== 'suspended' && (selectedDeliveryMode === 'connected_mailbox' || emailQuota?.capacityMode !== 'unavailable')}
      busy={submitState === 'loading'} onCancel={closeEmailReview} onConfirm={confirmEmailSend}
      onSender={() => { emailReview = null; openSenderSettings(); }} />
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

<div class="crm-ui-message-root crm-message-workspace crm-auth-shell">
  <div class="crm-auth-watermark" aria-hidden="true"></div>
  <header class="crm-message-header">
    <div><h2>Messages</h2></div>
    {#if isAdding && composerKind !== 'direct' && composerKind !== 'email'}
      <button type="button" class="crm-auth-button-secondary" disabled={submitState === 'loading'} on:click={() => returnToInbox()}>Back to inbox</button>
    {/if}
  </header>

  {#if !isAdding}
    <section id="message-compose-options" class="crm-message-choices crm-auth-card" aria-labelledby="message-choices-title">
      <div class="crm-message-choice-heading"><h3 id="message-choices-title">Start a new message</h3></div>
      <div class="crm-message-choice-grid">
        <button type="button" class="crm-message-choice" aria-label="New announcement" on:click={() => openComposer('announcement')}><Icon name="messages" size={24} /><span><strong>New announcement</strong></span><Icon name="chevronRight" size={20} /></button>
        <button type="button" class="crm-message-choice" aria-label="New email" on:click={() => openComposer('email')}><Icon name="pencil" size={24} /><span><strong>New email</strong></span><Icon name="chevronRight" size={20} /></button>
        <button type="button" class="crm-message-choice" aria-label="New direct message" on:click={() => openComposer('direct')}><Icon name="myApp" size={24} /><span><strong>New direct message</strong></span><Icon name="chevronRight" size={20} /></button>
      </div>
      {#if emailQuota?.emailSendingStatus === 'suspended'}<p class="crm-ui-notice-card mt-3" role="status">Email sending is paused for this organization. In-app announcements are still available.</p>
      {:else if emailQuota?.capacityMode === 'unavailable'}<p class="crm-ui-hint mt-3" role="status">Email sending is temporarily unavailable. You can still publish an in-app announcement.</p>{/if}
    </section>
  {/if}

  {#if !isAdding}
    <nav class="crm-message-tabs" aria-label="Message workspaces">
      {#each messageViews as view}<button type="button" aria-pressed={activeView === view.id} on:click={() => { activeView = view.id; latestReceipt = null; }}>{view.label}{view.id === 'conversations' && conversationUnreadCount ? ` · ${conversationUnreadCount}` : ''}</button>{/each}
      {#if subject.trim() || body.trim() || registrationRecipientInput.trim()}<button type="button" on:click={() => { activeView = composerKind === 'announcement' ? 'announcements' : composerKind === 'email' ? 'email' : composerKind === 'direct' ? 'conversations' : 'registration'; isAdding = true; }}>Resume draft</button>{/if}
    </nav>
  {/if}

  {#if senderSettingsOpen}
    <section class="crm-ui-message-settings" aria-labelledby="connected-email-heading">
      <div class="flex items-start justify-between gap-4">
        <div>
          <p class="crm-ui-message-eyebrow">Personal sender</p>
          <h3 id="connected-email-heading" class="mt-1 text-lg font-semibold text-gray-900">Connect your email</h3>
          <p class="mt-1 text-sm text-gray-600">Connect an email for groups of 100 or fewer. Larger groups use HuddleWay.</p>
        </div>
        <button type="button" class="crm-ui-button-secondary" on:click={() => { senderSettingsOpen = false; if (composerKind === 'email') isAdding = true; }}>Close</button>
      </div>
      {#if mailboxConnectionResult === 'connected'}
        <p use:toast class="crm-ui-message-success" role="status">Email connected for messages to 100 or fewer recipients.</p>
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

  {#if operationMessage && !(isAdding && (composerKind === 'direct' || composerKind === 'email'))}
    <div use:toast={{dismiss: () => operationMessage = ''}}
      class="crm-message-feedback crm-ui-message-operation {submitState === 'error' ? 'crm-ui-message-operation-error' : 'crm-ui-message-operation-ok'}"
      role={submitState === 'error' ? 'alert' : 'status'}
    >
      <p>{operationMessage}</p>
    </div>
  {/if}

  {#if isAdding && composerKind === 'direct'}
    <DirectMessageComposer bind:body bind:recipients={registrationRecipientInput} contacts={composerContacts}
      {chatMessages} valid={canPublish && registrationRecipientResult.emails.length === 1} busy={submitState === 'loading'}
      on:send={handleDirectSend} on:close={() => returnToInbox()}>
      {#if submitState === 'error' && operationMessage}<p class="crm-compose-error" role="alert">{operationMessage}</p>{/if}
    </DirectMessageComposer>
  {/if}
  {#if isAdding && composerKind === 'email'}
    <CompactMessageComposer bind:subject bind:body bind:recipients={registrationRecipientInput}
      bind:deliveryMode={selectedDeliveryMode} connectedEmail={connectedMailbox?.connected ? connectedMailbox.email || '' : ''}
      contacts={composerContacts} groups={composerGroups} valid={canPublish} busy={submitState === 'loading'} state={submitState}
      recipientLimit={emailRecipientLimit} on:review={() => void handleEmailReview()}
      on:close={() => returnToInbox()}
      on:cancel={discardMessageDraft} on:sender={openSenderSettings}
      on:registration={() => { composerKind = 'registration_email'; activeView = 'registration'; attachmentScope = 'event'; }}>
      {#if submitState === 'error' && operationMessage}<p class="crm-compose-error" role="alert">{operationMessage}</p>
      {:else if emailQuota?.capacityMode === 'unavailable' || emailQuota?.emailSendingStatus === 'suspended' || emailQuotaError}
        <div class="crm-email-availability" role="status"><span>{emailQuota?.emailSendingStatus === 'suspended' ? 'Sending paused · Draft saved' : 'Email unavailable · Draft saved'}</span><button type="button" class="crm-auth-link" disabled={emailQuotaLoading} on:click={() => fetchEmailQuota(activeTenantId)}>Retry</button></div>
      {/if}
    </CompactMessageComposer>
  {/if}

  {#if isAdding && composerKind === 'announcement'}
    <CompactAnnouncementComposer bind:subject bind:body scope={attachmentScope} bind:importance={selectedImportance} bind:audienceVisibility={announcementVisibility}
      {selectedTeamIds} {selectedEventIds} {selectedSeasonIds} teams={teamOptions} events={eventOptions} seasons={seasonOptions}
      editing={Boolean(editingMessageId)} busy={submitState === 'loading'} valid={canPublish} saved={announcementSaved} state={submitState}
      on:scope={(event) => { attachmentScope = event.detail; handleAttachmentScopeChange(); }}
      on:association={(event) => {
        if (event.detail.kind === 'team') { selectedTeamIds = event.detail.ids; selectedTeamId = event.detail.ids[0] || ''; }
        else if (event.detail.kind === 'event') { selectedEventIds = event.detail.ids; selectedEventId = event.detail.ids[0] || ''; }
        else { selectedSeasonIds = event.detail.ids; selectedSeasonId = event.detail.ids[0] || ''; }
        syncAssociationDefaults();
      }}
      on:close={() => returnToInbox()}
      on:cancel={discardMessageDraft} on:review={handleAnnouncementSubmit}>
      {#if operationMessage && submitState === 'error'}<p class="crm-compose-error" role="alert">{operationMessage}</p>{/if}
    </CompactAnnouncementComposer>
  {/if}

  {#if isAdding && composerKind === 'registration_email' && activeView === 'registration'}
    <section class="crm-ui-message-composer" aria-labelledby="new-announcement-heading">
      <h3 id="new-announcement-heading" class="mb-4 text-lg font-bold">
        {composerKind === 'registration_email'
          ? 'Send registration email'
          : composerKind === 'email'
            ? 'Send email'
            : editingMessageId
              ? 'Edit announcement'
              : 'Create announcement'}
      </h3>
      <div class="space-y-4">
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
              <option value="team">A team</option>
            {/if}
            <option value="event">An event</option>
            <option value="season">A season</option>
          </select>
          <p class="crm-ui-hint">
            {composerKind === 'registration_email'
              ? 'The link closes automatically when registration, the event, or the season ends.'
              : 'Choose a team, event, or season. Event details and images are inherited automatically.'}
          </p>
          </div>
        {/if}
        {#if composerKind === 'announcement' && attachmentScope === 'team'}
          <div>
            <label for="announcement-team" class="crm-ui-label">Team association</label>
            <select
              id="announcement-team"
              bind:value={selectedTeamId}
              on:change={syncAssociationDefaults}
              disabled={teamOptions.length === 0}
              class="crm-ui-message-select disabled:bg-gray-100"
            >
              <option value="">Select a team</option>
              {#each teamOptions as team}<option value={team.id}>{team.title}</option>{/each}
            </select>
          </div>
        {:else if composerKind !== 'email' && attachmentScope === 'event'}
          <div>
            <label for="announcement-event" class="crm-ui-label">Event</label>
            <select
              id="announcement-event"
              bind:value={selectedEventId}
              on:change={syncAssociationDefaults}
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
              on:change={syncAssociationDefaults}
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
            on:click={discardMessageDraft}
          >
            Cancel
          </button>
          <StatusButton
            type="button"
            state={submitState}
            on:click={composerKind === 'announcement' ? handleAnnouncementSubmit : handleEmailReview}
            disabled={!canPublish || submitState === 'loading'}
            idleText={composerKind === 'announcement'
              ? editingMessageId ? 'Save changes' : 'Review announcement'
              : composerKind === 'registration_email'
                ? 'Review registration email'
                : 'Review email'}
            loadingText={composerKind === 'announcement' ? editingMessageId ? 'Saving changes…' : 'Reviewing audience…' : 'Checking allowance…'}
            successText={composerKind === 'announcement' ? editingMessageId ? 'Updated' : 'Published' : 'Email sent'}
            errorText={composerKind === 'announcement'
              ? announcementSaved ? 'Check notification status' : 'Retry publish'
              : composerKind === 'registration_email'
                ? 'Review registration email again'
                : 'Review email again'}
            class="crm-ui-button-primary"
          />
        </div>
      </div>
    </section>
  {/if}

  <div class:hidden={activeView !== 'conversations' || isAdding}><ConsumerAdminInbox registrations={$registrationsStore} teams={$teamsStore} events={$eventsStore} on:unreadCount={(event) => conversationUnreadCount = event.detail} /></div>

  {#if activeView === 'announcements' && !isAdding}
    <SentMessageList items={sentItems} loading={isLoading} error={loadError} busyId={recallingMessageId}
      on:edit={(event) => { const message = messages.find((item) => item.id === event.detail); if (message) editAnnouncement(message); }}
      on:remove={(event) => { const message = messages.find((item) => item.id === event.detail); if (message) requestRecall(message); }}
      on:retry={() => activeTenantId && fetchMessages(activeTenantId)} />
  {/if}
</div>
