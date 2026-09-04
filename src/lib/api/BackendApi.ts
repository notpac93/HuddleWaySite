export type BackendFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface BackendApiDependencies {
  baseUrl: string;
  getIdToken: (forceRefresh: boolean) => Promise<string>;
  getAppCheckToken?: (forceRefresh: boolean) => Promise<string>;
  requireAppCheck?: boolean;
  fetch?: BackendFetch;
  timeoutMs?: number;
  createRequestId?: () => string;
}

export interface BackendErrorPayload {
  error?: string;
  message?: string;
  code?: string;
  requestId?: string;
}

export type CrmImageUploadPurpose =
  "branding-logo" | "season-banner" | "event-cover" | "program-library";

export interface CrmImageUploadResult {
  tenantId: string;
  reservationId: string;
  storagePath: string;
  contentType: string;
  sizeBytes: number;
  storageGeneration: string;
  status: "verified_private";
  previewUrl: string;
  previewExpiresAt: string;
  idempotentReplay: boolean;
  requestId: string;
}

export interface CrmImagePublicationResult {
  tenantId: string;
  reservationId: string;
  publicationId: string;
  resourceType: "event" | "program_media";
  resourceIds: string[];
  status: "draft" | "published";
  isVisible: boolean;
  publicUrl: string;
  idempotentReplay: boolean;
  operationId: string;
  requestId: string;
}

function validIsoTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

export class BackendApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly requestId: string | null;

  constructor({
    message,
    status,
    code,
    requestId,
  }: {
    message: string;
    status: number;
    code?: string | null;
    requestId?: string | null;
  }) {
    super(message);
    this.name = "BackendApiError";
    this.status = status;
    this.code = code || null;
    this.requestId = requestId || null;
  }
}

export interface DirectInvoiceRecord {
  id: string;
  invoiceNumber: string;
  title: string;
  memo: string | null;
  status:
    | "draft"
    | "issuing"
    | "open"
    | "partially_paid"
    | "paid"
    | "past_due"
    | "void"
    | "uncollectible"
    | "partially_refunded"
    | "refunded";
  agingBucket: string;
  recipientUid: string | null;
  recipientName: string | null;
  recipientEmail: string | null;
  lineItems: Array<{
    id?: string;
    description: string;
    quantity: number;
    unitAmountCents: number;
    amountCents?: number;
  }>;
  currency: string;
  subtotalCents: number;
  discountCents: number;
  taxRateBps: number;
  taxCents: number;
  totalCents: number;
  amountPaidCents: number;
  amountRefundedCents: number;
  amountDueCents: number;
  dueAt: string | null;
  issuedAt: string | null;
  paidAt: string | null;
  voidedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  hostedInvoiceUrl: string | null;
  invoicePdfUrl: string | null;
  stripeInvoiceId: string | null;
  reminderCount: number;
  manualPaymentCount: number;
  refundCount: number;
  lastPaymentAt: string | null;
  lastRefundAt: string | null;
  issueError: string | null;
  accountingReconciliationRequired: boolean;
  accountingReconciledAt: string | null;
}

export interface DirectInvoiceProviderAccounting {
  source: "stripe_balance_transactions";
  currency: string;
  chargeGrossCents: number;
  chargeFeeCents: number;
  chargeNetCents: number;
  refundGrossCents: number;
  refundFeeCents: number;
  refundNetCents: number;
  settledNetCents: number;
}

function validDirectInvoiceProviderAccounting(
  value: DirectInvoiceProviderAccounting | null,
) {
  if (value === null) return true;
  if (!value || value.source !== "stripe_balance_transactions") return false;
  const fields = [
    value.chargeGrossCents,
    value.chargeFeeCents,
    value.chargeNetCents,
    value.refundGrossCents,
    value.refundFeeCents,
    value.refundNetCents,
    value.settledNetCents,
  ];
  return (
    /^[A-Z]{3}$/.test(value.currency) &&
    fields.every(Number.isSafeInteger) &&
    value.chargeGrossCents - value.chargeFeeCents === value.chargeNetCents &&
    value.refundGrossCents - value.refundFeeCents === value.refundNetCents &&
    value.chargeNetCents + value.refundNetCents === value.settledNetCents
  );
}

export interface BillingHistory {
  tenantId: string | null;
  scope: "tenant" | "all_tenants";
  payments: Array<Record<string, unknown>>;
  invoices: Array<Record<string, unknown>>;
  requestId?: string;
}

export interface AdminInboxMessage {
  id: string;
  direction: "consumer" | "admin";
  senderName: string;
  subject: string;
  message: string;
  createdAt: string | null;
  requestId: string | null;
  deliveryProvider: string | null;
}

export interface AdminInboxThread {
  id: string;
  consumerEmail: string;
  consumerName: string | null;
  threadRecipientEmail: string;
  subject: string;
  lastMessageAt: string | null;
  messages: AdminInboxMessage[];
}

export type TenantOperationsEnvironment = "all" | "development" | "production";
export type TenantOperationsHealth = "healthy" | "warning" | "critical";

export interface TenantOperationsFinding {
  code: string;
  severity: "warning" | "critical" | "informational";
  message: string;
  environment?: Exclude<TenantOperationsEnvironment, "all">;
  tenantId?: string;
  programName?: string;
  relatedTenantIds?: string[];
}

export interface TenantOperationsTenant {
  environment: Exclude<TenantOperationsEnvironment, "all">;
  tenantId: string;
  programName: string;
  tenantState: "active" | "inactive" | "archived" | "missing";
  publicState: "public" | "hidden" | "ineligible";
  health: TenantOperationsHealth;
  counts: {
    pages: number;
    teams: number;
    events: number;
    registrations: number;
    forms: number;
    billing: number;
  };
  accounts: number;
  consumers: number;
  staff: number;
  branding: {
    exists: boolean;
    hasLogo: boolean;
  };
  home: {
    exists: boolean;
    status: string;
    visible: boolean;
  };
  updatedAt: string | null;
  findings: TenantOperationsFinding[];
}

export interface TenantOperationsSummary {
  totalTenants: number;
  publicTenants: number;
  hiddenActiveTenants: number;
  incompleteTenants: number;
  criticalTenants: number;
  warningTenants: number;
  duplicateCandidates: number;
  accounts: number;
  consumers: number;
  staff: number;
}

export interface TenantOperationsTenantPage {
  schemaVersion: "tenant_operations_v1";
  environment: TenantOperationsEnvironment;
  generatedAt: string;
  freshness: {
    source: "live" | "cache";
    generatedAt: string;
    sources?: Array<{
      environment: Exclude<TenantOperationsEnvironment, "all">;
      generatedAt: string;
      source: "live" | "cache";
    }>;
  };
  availableEnvironments: Array<Exclude<TenantOperationsEnvironment, "all">>;
  summary: TenantOperationsSummary;
  tenants: TenantOperationsTenant[];
  totalFiltered: number;
  limit: number;
  hasMore: boolean;
  nextCursor: string | null;
  actorRole: "platform_admin" | "platform_operations_viewer";
  requestId: string;
}

export interface OnboardingBootstrapResult {
  tenantId: string;
  programName: string;
  readiness: {
    state: string;
    launchReady: boolean;
    blockers: string[];
    checks: Record<string, unknown>;
  };
  seeded: {
    teams: string[];
    primaryEvents: number;
    pages: number;
    contentBlocks: number;
    domains: number;
    brandingDoc: boolean;
    runtimeConfigDoc: boolean;
  };
  idempotentReplay: boolean;
  requestId: string;
}

export interface DirectInvoiceDraft {
  tenantId: string;
  auditReason: string;
  recipientUid?: string;
  recipientEmail?: string;
  recipientName?: string;
  title: string;
  memo?: string;
  dueDays: number;
  discountCents?: number;
  taxRateBps?: number;
  lineItems: Array<{
    description: string;
    quantity: number;
    unitAmountCents: number;
  }>;
}

export interface CrmExportRequest {
  tenantId: string;
  resourceId: string;
  visibleColumnIds: string[];
  selection: {
    scope: "explicit";
    ids: string[];
  };
  filter: Record<string, unknown>;
  sort: Array<Record<string, unknown>>;
  locale: string;
  timeZone: string;
}

export type CrmEventOccurrenceInput = {
  dateKey: string;
  startTime: string;
  endTime: string;
  startAt: string;
  endAt: string;
  timeZone: string;
};

export type CrmRegistrationFieldsInput = {
  collectParentNames: boolean;
  collectParentPhone: boolean;
  collectParentEmail: boolean;
  collectEmergencyContacts: boolean;
  collectDob: boolean;
  collectGender: boolean;
  collectShirtSize: boolean;
  collectMedicalInfo: boolean;
  collectExperience: boolean;
  collectCoachRequest: boolean;
  collectVolunteer: boolean;
};

export type CrmRegistrationFormSectionInput = {
  id: string;
  title: string;
  description: string;
  isActive: true;
  fields: Array<{
    id: string;
    type: "text" | "email" | "phone" | "date" | "dropdown" | "yes_no";
    label: string;
    required: boolean;
    placeholder: string | null;
    options: string[] | null;
    isActive: true;
  }>;
};

export type CrmAppConfiguration = {
  name: string;
  primaryColor: string;
  secondaryColor: string;
  tertiaryColor: string;
  logoUrl: string | null;
  navigationTabs: Array<{
    key: string;
    pageId: string;
    route: string;
    label: string;
    enabled: boolean;
  }>;
};

export type CrmAppConfigurationSnapshot = {
  tenantId: string;
  mode: "initialize" | "update";
  configVersion: number;
  publishedAt: string | null;
  publishedBy: string | null;
  publishedByLabel?: string | null;
  versionToken: string;
  configuration: CrmAppConfiguration | null;
  requestId: string;
};

export type CrmComponentField = {
  id: string;
  type: string;
  required: boolean;
  maxLength?: number;
  urlRule?: string;
  options?: string[];
  defaultValue?: unknown;
  label?: string;
  previewTarget?: string;
};

export type CrmComponentDefinition = {
  id: string;
  type: string;
  label: string;
  category: string;
  definitionVersion: number;
  repeatable: boolean;
  fields: CrmComponentField[];
  defaultContent: Record<string, unknown>;
  presets: Array<{
    id: string;
    label: string;
    description: string;
    content: Record<string, unknown>;
  }>;
  previewSpec: { title: string; description: string; highlights: string[] };
};

export type CrmPageComponent = {
  id: string;
  definitionId: string;
  definitionVersion: number;
  type: string;
  label: string;
  enabled: boolean;
  presetId: string | null;
  starterContentReviewKey: string | null;
  isVisible: boolean;
  status: string;
  content: Record<string, unknown>;
};

export type CrmComponentStudioPage = {
  id: string;
  title: string;
  headline: string;
  subheader: string;
  route: string;
  isVisible: boolean;
  status: string;
  components: CrmPageComponent[];
};

export type CrmComponentStudioSnapshot = {
  tenantId: string;
  templateId: string;
  templateVersion: number;
  versionToken: string;
  definitions: CrmComponentDefinition[];
  pages: CrmComponentStudioPage[];
  versions?: CrmComponentLayoutVersion[];
  historyTruncated?: boolean;
  requestId: string;
};

export type CrmComponentLayoutVersion = {
  id: string;
  versionToken: string;
  capturedAt: string | null;
  publishedBy: string | null;
  pages: CrmComponentStudioPage[];
};

export type CrmDocumentRecord = {
  id: string;
  title: string;
  fileType: string | null;
  category: string | null;
  availabilityScope: string | null;
  isAvailable: boolean;
  hasApprovedStoragePath: boolean;
  canDelete: boolean;
  deleteUnavailableReason: string | null;
  uploadedAt: string | null;
  uploadedBy: string | null;
  linkedEventIds: string[];
  storagePath: string | null;
  storageSizeBytes: number | null;
  storageContentType: string | null;
};

export type CrmDocumentInput = {
  title: string;
  downloadUrl: string;
  storagePath: string;
  isAvailable: boolean;
  eventId: string | null;
  linkedEventIds: string[];
  availabilityScope: "organization" | "selected_live_events" | "saved_for_later";
  category: string;
  uploadedAt: string;
  uploadedBy: string;
  fileType: string;
};

export type AdminStaffDirectory = {
  tenantId: string;
  staff: Array<{
    membershipId: string;
    uid: string;
    role: "owner" | "editor" | "viewer";
    status: "active" | "inactive";
    active: boolean;
    displayName: string | null;
    email: string | null;
    emailVerified: boolean;
    joinedAt: string | null;
    updatedAt: string | null;
  }>;
  pendingInvites: Array<{
    id: string;
    email: string | null;
    role: "editor" | "viewer";
    status: "pending";
    displayName: string | null;
    createdAt: string | null;
    expiresAt: string | null;
  }>;
  truncated: { staff: boolean; pendingInvites: boolean };
  requestId: string;
};

export type FinancialPeriodInput = {
  startDate: string;
  endDate: string;
  label: string;
};

export type FinancialPeriodPreview = {
  startDate: string;
  endDate: string;
  collections: Record<
    string,
    { count: number; totalCents: number; truncated: boolean }
  >;
  truncated: boolean;
};

export type FinancialPeriodRecord = {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  status: "closed" | "reopened";
  closedAt: string | null;
  reopenedAt: string | null;
  updatedAt: string | null;
};

type CrmResourceMutationResponse = {
  success: true;
  idempotentReplay: boolean;
  operationId: string;
  id?: string;
  eventIds?: string[];
  updatedCount?: number;
  configVersion?: number;
  deleted?: boolean;
  updated?: boolean;
  archived?: boolean;
  storageDeleted?: boolean;
  title?: string;
  publicationSyncStatus?: "deferred" | "succeeded" | "not_required";
  mode?: "initialize" | "update";
  versionToken?: string;
  configuration?: CrmAppConfiguration;
  requestId: string;
};

export interface AdminInviteRecord {
  id: string;
  tenantId: string;
  email: string;
  role: "editor" | "viewer";
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  teamId: string | null;
  status: "pending" | "accepted" | "revoked" | "expired";
  deliveryStatus: "not_attempted" | "queued" | "sent" | "failed";
  deliveryMessage: string | null;
  createdAt: string | null;
  expiresAt: string | null;
  acceptedAt: string | null;
  revokedAt: string | null;
}

export interface RosterChange {
  registrationId: string;
  action: "add" | "remove";
}

export interface RosterPreview {
  teamId: string;
  changes: RosterChange[];
  rows: Array<Record<string, unknown>>;
  changeSetHash: string;
  addCount: number;
  removeCount: number;
  noOpCount: number;
}

export interface RosterTransferPreview {
  destinationTeamId: string | null;
  registrationIds: string[];
  rows: Array<{
    registrationId: string;
    label: string;
    beforeTeamIds: string[];
    afterTeamIds: string[];
    addTeamIds: string[];
    removeTeamIds: string[];
    noOp: boolean;
  }>;
  changes: Array<{
    registrationId: string;
    membershipId: string;
    teamId: string;
    action: "add" | "remove";
  }>;
  changeSetHash: string;
  affectedTeamIds: string[];
  addCount: number;
  removeCount: number;
  noOpCount: number;
}

export interface FinancialOverview {
  tenantId: string;
  transactions: Array<Record<string, unknown>>;
  refunds: Array<Record<string, unknown>>;
  invoices: Array<Record<string, unknown>>;
  deposits: Array<Record<string, unknown>>;
  recordCounts: {
    transactions: number;
    payments: number;
    refunds: number;
    invoices: number;
    deposits: number;
  };
  tracking: {
    complete: boolean;
    unreconciledTransactionCount: number;
    unreconciledDepositCount: number;
    currencyIntegrityErrorCount?: number;
    providerAccounting?: {
      attempted: number;
      resolved: number;
      failed: number;
      skipped: number;
      complete: boolean;
    };
    sourceCollections: string[];
  };
  truncated: {
    transactions: boolean;
    refunds: boolean;
    invoices: boolean;
    deposits: boolean;
  };
  complete: boolean;
  operations: FinancialOperations;
  requestId: string;
}

export interface CrmAuthorization {
  tenantAccess: Array<{
    tenantId: string;
    role: 'owner' | 'editor' | 'viewer' | 'platform_admin';
  }>;
  tenantNames: Record<string, string>;
  canViewTenantOperations: boolean;
  tenantOperationsRole: 'platform_admin' | 'platform_operations_viewer' | null;
  requestId: string;
}

export type FinancialOperationView =
  "deposits" | "transactions" | "scheduled" | "overdue" | "invoices";

export interface FinancialOperationRow {
  key: string;
  kind: string;
  label: string;
  context: string;
  amountCents: number | null;
  currency: string | null;
  status: string;
  statusLabel: string;
  date: string | null;
  dateLabel: string;
  detail: string;
}

export interface FinancialOperations {
  complete: boolean;
  generatedAt: string;
  timeZone: string;
  reconciliation: {
    complete: boolean;
    unreconciledTransactionCount: number;
    unreconciledDepositCount: number;
    currencyIntegrityErrorCount: number;
  };
  views: Record<FinancialOperationView, FinancialOperationRow[]>;
}

export interface BillingPackageRecord {
  id: string;
  name: string;
  seasonId: string | null;
  eligibleTeamIds: string[];
  currency: string;
  lineItems: Array<{
    kind: "season" | "team" | "uniform" | "other";
    code: string;
    label: string;
    amountCents: number;
  }>;
  totalCents: number;
  paymentTerms: Record<string, unknown> | null;
  paymentPolicies: Record<string, unknown> | null;
  active: boolean;
  version: number;
}

export interface ParticipantRelationshipRecord {
  teamId: string;
  name: string;
  division: string;
  role: string;
  status: string;
  availability: string;
}

export interface ParticipantRelationships {
  relationships: ParticipantRelationshipRecord[];
  options: Array<{ teamId: string; name: string; division: string }>;
  canAssign: boolean;
  assignmentBlockedReason: string | null;
  requestId: string;
}

export interface ParticipantInstallmentAgreement {
  id: string;
  offering: Record<string, unknown>;
  terms: Record<string, unknown>;
  revision: number;
  status: string;
  providerSyncState: string;
  billingRecoveryState: string | null;
  pendingRevision: Record<string, unknown> | null;
  installments: Array<{
    number: number;
    amountCents: number;
    dueAt: string | null;
    dueDate: string;
    dueDateLabel: string;
    status: string;
  }>;
}

export type CrmOperationalCollection =
  | "events"
  | "registration_forms"
  | "registrations"
  | "season_registrations"
  | "seasons"
  | "teams";

export interface CrmOperationalPage {
  schemaVersion: "crm_operational_page_v1";
  tenantId: string;
  collection: CrmOperationalCollection;
  records: Array<Record<string, unknown> & { id: string }>;
  hasMore: boolean;
  nextCursor: string | null;
  limit: number;
  requestId: string;
}

export interface CrmDashboardSummary {
  schemaVersion: "crm_dashboard_summary_v1";
  tenantId: string;
  counts: {
    registrations: number;
    teams: number;
    events: number;
  };
  recentRegistrations: Array<Record<string, unknown> & { id: string }>;
  requestId: string;
}

export interface RosterParticipantImportRow {
  rowNumber: number;
  formData: Record<string, string>;
}

export interface RosterParticipantImportResult {
  tenantId: string;
  batchId: string;
  savedCount: number;
  registrationIds: string[];
  idempotentReplay: boolean;
  requestId: string;
}

export interface RosterParticipantPreviewRow {
  rowNumber: number;
  participantName: string;
  registrationEmail: string;
  status: "valid" | "rejected";
  reasonCode: string | null;
  message: string | null;
}

export interface RosterParticipantPreviewResult {
  success: true;
  tenantId: string;
  validCount: number;
  rejectedCount: number;
  rows: RosterParticipantPreviewRow[];
  requestId: string;
}

export interface RosterPlayerRecord {
  id: string;
  participantId: string | null;
  name: string;
  imageUrl: string | null;
  role: string;
  status: string;
  teamId: string | null;
  teamIds: string[];
  team: string;
  email: string | null;
}

export interface CrmAuditEventRecord {
  id: string;
  action: string;
  actionType: "create" | "update" | "delete";
  actionDescription: string;
  resourceType: string;
  outcome: "succeeded" | "failed" | "partial" | "denied";
  actorRole: string;
  actorLabel: string;
  actorEmail?: string | null;
  timestamp: string | null;
  resourceId: string | null;
  correlationId: string | null;
  source: string;
  reason: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: unknown;
  idempotencyKey?: string;
}

function defaultRequestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `request-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function safeMessage(payload: BackendErrorPayload, status: number) {
  const candidate =
    String(payload.error || "").trim() || String(payload.message || "").trim();
  return candidate || `HuddleWay request failed (${status}).`;
}

function parsePayload(text: string): Record<string, unknown> | null {
  if (!text.trim()) return null;
  try {
    const value = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function invalidBackendResponse(
  payload: Record<string, unknown> | null,
  message = "The HuddleWay backend returned an invalid response.",
): never {
  throw new BackendApiError({
    message,
    status: 502,
    code: "invalid_backend_response",
    requestId: String(payload?.requestId || "").trim() || null,
  });
}

function assertTenantEnvelope(
  payload: Record<string, unknown>,
  tenantId: string,
) {
  if (String(payload.tenantId || "").trim() !== tenantId) {
    invalidBackendResponse(
      payload,
      "The HuddleWay backend response did not match the active organization.",
    );
  }
}

function isValidAppConfiguration(value: unknown): value is CrmAppConfiguration {
  const configuration = value as CrmAppConfiguration | null;
  const tabs = configuration?.navigationTabs;
  return Boolean(
    configuration &&
    typeof configuration === "object" &&
    String(configuration.name || "").trim() &&
    configuration.name.length <= 160 &&
    [
      configuration.primaryColor,
      configuration.secondaryColor,
      configuration.tertiaryColor,
    ].every((color) => /^#[0-9a-f]{6}$/i.test(String(color || ""))) &&
    (configuration.logoUrl === null ||
      /^https:\/\/[^/]/i.test(String(configuration.logoUrl || ""))) &&
    Array.isArray(tabs) &&
    tabs.length <= 12 &&
    new Set(tabs.map((tab) => String(tab?.key || ""))).size === tabs.length &&
    tabs.every(
      (tab) =>
        Boolean(String(tab?.key || "").trim()) &&
        Boolean(String(tab?.pageId || "").trim()) &&
        Boolean(String(tab?.label || "").trim()) &&
        tab.label.length <= 80 &&
        String(tab?.route || "").startsWith("/") &&
        !String(tab.route).startsWith("//") &&
        typeof tab.enabled === "boolean",
    ),
  );
}

function assertStaffDirectoryEnvelope(
  payload: AdminStaffDirectory,
  tenantId: string,
  limit: number,
) {
  const roles = new Set(["owner", "editor", "viewer"]);
  const inviteRoles = new Set(["editor", "viewer"]);
  if (
    payload.tenantId !== tenantId ||
    !Array.isArray(payload.staff) ||
    !Array.isArray(payload.pendingInvites) ||
    payload.staff.length > limit ||
    payload.pendingInvites.length > limit ||
    typeof payload.truncated?.staff !== "boolean" ||
    typeof payload.truncated?.pendingInvites !== "boolean" ||
    !String(payload.requestId || "").trim() ||
    payload.staff.some(
      (staff) =>
        !String(staff?.membershipId || "").trim() ||
        !String(staff?.uid || "").trim() ||
        !roles.has(String(staff?.role || "")) ||
        !["active", "inactive"].includes(String(staff?.status || "")) ||
        staff.active !== (staff.status === "active") ||
        typeof staff.emailVerified !== "boolean",
    ) ||
    payload.pendingInvites.some(
      (invite) =>
        !String(invite?.id || "").trim() ||
        !inviteRoles.has(String(invite?.role || "")) ||
        invite.status !== "pending",
    )
  ) {
    invalidBackendResponse(payload as unknown as Record<string, unknown>);
  }
}

function directInvoiceFromEnvelope(
  payload: Record<string, unknown>,
  expectedInvoiceId?: string,
) {
  const invoice = payload.invoice as Partial<DirectInvoiceRecord> | undefined;
  const minorUnitFields: Array<keyof DirectInvoiceRecord> = [
    "subtotalCents",
    "discountCents",
    "taxRateBps",
    "taxCents",
    "totalCents",
    "amountPaidCents",
    "amountRefundedCents",
    "amountDueCents",
    "reminderCount",
    "manualPaymentCount",
    "refundCount",
  ];
  if (
    !invoice ||
    typeof invoice !== "object" ||
    Array.isArray(invoice) ||
    !String(invoice.id || "").trim() ||
    (expectedInvoiceId && invoice.id !== expectedInvoiceId) ||
    !String(invoice.invoiceNumber || "").trim() ||
    !String(invoice.status || "").trim() ||
    !String(payload.requestId || "").trim() ||
    !/^[A-Z]{3}$/.test(String(invoice.currency || "")) ||
    !Array.isArray(invoice.lineItems) ||
    invoice.lineItems.some(
      (line) =>
        !line ||
        typeof line !== "object" ||
        !String(line.description || "").trim() ||
        !Number.isSafeInteger(line.quantity) ||
        line.quantity < 1 ||
        !Number.isSafeInteger(line.unitAmountCents) ||
        line.unitAmountCents < 0 ||
        (line.amountCents !== undefined &&
          (!Number.isSafeInteger(line.amountCents) || line.amountCents < 0)),
    ) ||
    minorUnitFields.some(
      (field) =>
        !Number.isSafeInteger(invoice[field]) || Number(invoice[field]) < 0,
    ) ||
    Number(invoice.totalCents) !==
      Number(invoice.subtotalCents) -
        Number(invoice.discountCents) +
        Number(invoice.taxCents) ||
    invoice.lineItems.reduce(
      (sum, line) =>
        sum + Number(line.amountCents ?? line.quantity * line.unitAmountCents),
      0,
    ) !== Number(invoice.subtotalCents) ||
    typeof invoice.accountingReconciliationRequired !== "boolean"
  ) {
    invalidBackendResponse(payload);
  }
  return invoice as DirectInvoiceRecord;
}

function assertRosterPreviewEnvelope(
  payload: { preview?: RosterPreview; requestId?: string },
  teamId: string,
) {
  const preview = payload.preview;
  if (
    !preview ||
    String(preview.teamId || "").trim() !== teamId ||
    !Array.isArray(preview.changes) ||
    !Array.isArray(preview.rows) ||
    !/^[a-f0-9]{64}$/.test(String(preview.changeSetHash || "")) ||
    !Number.isSafeInteger(preview.addCount) ||
    preview.addCount < 0 ||
    !Number.isSafeInteger(preview.removeCount) ||
    preview.removeCount < 0 ||
    !Number.isSafeInteger(preview.noOpCount) ||
    preview.noOpCount < 0 ||
    !String(payload.requestId || "").trim()
  ) {
    invalidBackendResponse(payload as unknown as Record<string, unknown>);
  }
}

export class BackendApi {
  private readonly baseUrl: string;
  private readonly getIdToken: BackendApiDependencies["getIdToken"];
  private readonly getAppCheckToken:
    BackendApiDependencies["getAppCheckToken"] | null;
  private readonly requireAppCheck: boolean;
  private readonly fetchImplementation: BackendFetch;
  private readonly timeoutMs: number;
  private readonly createRequestId: () => string;

  constructor(dependencies: BackendApiDependencies) {
    this.baseUrl = dependencies.baseUrl.replace(/\/$/, "");
    this.getIdToken = dependencies.getIdToken;
    this.getAppCheckToken = dependencies.getAppCheckToken ?? null;
    this.requireAppCheck = dependencies.requireAppCheck === true;
    this.fetchImplementation =
      dependencies.fetch ?? globalThis.fetch.bind(globalThis);
    this.timeoutMs = dependencies.timeoutMs ?? 20_000;
    this.createRequestId = dependencies.createRequestId ?? defaultRequestId;
  }

  request<T>(path: string, options: RequestOptions = {}) {
    return this.send<T>(path, options);
  }

  private async send<T>(
    path: string,
    options: RequestOptions = {},
  ): Promise<T> {
    if (!path.startsWith("/")) {
      throw new Error("Backend request paths must begin with /.");
    }
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== null && value !== undefined && String(value).trim()) {
        url.searchParams.set(key, String(value));
      }
    }
    const requestId = this.createRequestId();

    const execute = async (forceRefresh: boolean) => {
      const controller = new AbortController();
      const timeout = globalThis.setTimeout(
        () => controller.abort(),
        this.timeoutMs,
      );
      try {
        const token = (await this.getIdToken(forceRefresh)).trim();
        if (!token) throw new Error("An authenticated session is required.");
        const appCheckToken = this.getAppCheckToken
          ? (await this.getAppCheckToken(forceRefresh)).trim()
          : "";
        if (this.requireAppCheck && !appCheckToken) {
          throw new Error("App Check verification is required.");
        }
        const response = await this.fetchImplementation(url, {
          method: options.method ?? "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            ...(appCheckToken ? { "X-Firebase-AppCheck": appCheckToken } : {}),
            Accept: "application/json",
            "X-Request-Id": requestId,
            ...(options.body === undefined
              ? {}
              : { "Content-Type": "application/json" }),
            ...(options.idempotencyKey
              ? {
                  "Idempotency-Key": options.idempotencyKey,
                  "X-Idempotency-Key": options.idempotencyKey,
                }
              : {}),
          },
          body:
            options.body === undefined
              ? undefined
              : JSON.stringify(options.body),
          credentials: "omit",
          signal: controller.signal,
        });
        const payload = parsePayload(await response.text());
        return { response, payload };
      } finally {
        globalThis.clearTimeout(timeout);
      }
    };

    let result;
    try {
      result = await execute(false);
      if ([401, 403].includes(result.response.status)) {
        result = await execute(true);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new BackendApiError({
          message: "The HuddleWay backend did not respond in time.",
          status: 408,
          code: "request_timeout",
          requestId,
        });
      }
      throw error;
    }

    if (!result.response.ok) {
      const payload = (result.payload ?? {}) as BackendErrorPayload;
      throw new BackendApiError({
        message: safeMessage(payload, result.response.status),
        status: result.response.status,
        code: payload.code,
        requestId:
          String(payload.requestId || "").trim() ||
          result.response.headers.get("x-request-id") ||
          requestId,
      });
    }
    if (!result.payload || Object.keys(result.payload).length === 0) {
      invalidBackendResponse(result.payload);
    }
    return result.payload as T;
  }

  async uploadImageAsset(
    tenantId: string,
    file: File,
    purpose: CrmImageUploadPurpose,
    idempotencyKey = createIdempotencyKey("image-upload"),
  ): Promise<CrmImageUploadResult> {
    const digest = await globalThis.crypto.subtle.digest(
      "SHA-256",
      await file.arrayBuffer(),
    );
    const sha256 = Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    const reservation = await this.send<{
      success: boolean;
      tenantId: string;
      reservationId: string;
      storagePath: string;
      uploadUrl: string;
      contentType: string;
      expiresAt: string;
      requestId: string;
    }>("/admin/crm/images/upload-reservations", {
      method: "POST",
      body: {
        tenantId,
        purpose,
        fileName: file.name,
        contentType: file.type,
        sizeBytes: file.size,
        sha256,
        idempotencyKey,
      },
      idempotencyKey,
    });
    if (
      reservation.success !== true ||
      reservation.tenantId !== tenantId ||
      !/^image_upload_[a-f0-9]{40}$/.test(reservation.reservationId) ||
      !String(reservation.storagePath || "").startsWith(
        `private/${tenantId}/media/`,
      ) ||
      !/^https:\/\//i.test(String(reservation.uploadUrl || "")) ||
      reservation.contentType !== file.type ||
      !validIsoTimestamp(reservation.expiresAt) ||
      !String(reservation.requestId || "").trim()
    ) {
      invalidBackendResponse(
        reservation as unknown as Record<string, unknown>,
        "The image upload reservation was invalid.",
      );
    }

    let uploadResponse: Response;
    try {
      uploadResponse = await this.fetchImplementation(reservation.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
        credentials: "omit",
      });
    } catch {
      throw new BackendApiError({
        message: "The selected image could not be uploaded.",
        status: 503,
        code: "image_upload_failed",
        requestId: reservation.requestId,
      });
    }
    if (!uploadResponse.ok) {
      throw new BackendApiError({
        message: "The selected image could not be uploaded.",
        status: uploadResponse.status || 503,
        code: "image_upload_failed",
        requestId: reservation.requestId,
      });
    }

    const completionKey = `${idempotencyKey}:complete`;
    const completion = await this.send<
      CrmImageUploadResult & { success: boolean }
    >(
      `/admin/crm/images/upload-reservations/${encodeURIComponent(reservation.reservationId)}/complete`,
      {
        method: "POST",
        body: { tenantId, idempotencyKey: completionKey },
        idempotencyKey: completionKey,
      },
    );
    if (
      completion.success !== true ||
      completion.tenantId !== tenantId ||
      completion.reservationId !== reservation.reservationId ||
      completion.storagePath !== reservation.storagePath ||
      completion.contentType !== file.type ||
      completion.sizeBytes !== file.size ||
      !/^[1-9]\d{0,30}$/.test(String(completion.storageGeneration || "")) ||
      completion.status !== "verified_private" ||
      !/^https:\/\//i.test(String(completion.previewUrl || "")) ||
      !validIsoTimestamp(completion.previewExpiresAt) ||
      typeof completion.idempotentReplay !== "boolean" ||
      !String(completion.requestId || "").trim()
    ) {
      invalidBackendResponse(
        completion as unknown as Record<string, unknown>,
        "The completed image upload was invalid.",
      );
    }
    return completion;
  }

  async publishImageAsset(
    tenantId: string,
    reservationId: string,
    resourceType: "event",
    resourceIds: string[],
    auditReason: string,
    idempotencyKey: string,
  ): Promise<CrmImagePublicationResult> {
    const payload = await this.send<
      CrmImagePublicationResult & { success: boolean }
    >(
      `/admin/crm/images/upload-reservations/${encodeURIComponent(reservationId)}/publish`,
      {
        method: "POST",
        body: {
          tenantId,
          resourceType,
          resourceIds,
          auditReason,
          idempotencyKey,
        },
        idempotencyKey,
      },
    );
    if (
      payload.success !== true ||
      payload.tenantId !== tenantId ||
      payload.reservationId !== reservationId ||
      payload.publicationId !== reservationId ||
      payload.resourceType !== resourceType ||
      !Array.isArray(payload.resourceIds) ||
      payload.resourceIds.length !== resourceIds.length ||
      payload.resourceIds.some((id) => !resourceIds.includes(id)) ||
      !["draft", "published"].includes(payload.status) ||
      payload.isVisible !== (payload.status === "published") ||
      !/^https?:\/\//i.test(String(payload.publicUrl || "")) ||
      typeof payload.idempotentReplay !== "boolean" ||
      !String(payload.operationId || "").trim() ||
      !String(payload.requestId || "").trim()
    ) {
      invalidBackendResponse(
        payload as unknown as Record<string, unknown>,
        "The image publication response was invalid.",
      );
    }
    return payload;
  }

  async publishProgramMedia(
    tenantId: string,
    reservationId: string,
    metadata: {
      fileName: string;
      category: string;
      purpose: string;
      altText: string;
      width: number | null;
      height: number | null;
    },
    auditReason: string,
    idempotencyKey: string,
  ) {
    const payload = await this.send<CrmImagePublicationResult & { success: boolean }>(
      `/admin/crm/images/upload-reservations/${encodeURIComponent(reservationId)}/publish`,
      {
        method: "POST",
        body: {
          tenantId,
          resourceType: "program_media",
          resourceIds: [reservationId],
          metadata,
          auditReason,
          idempotencyKey,
        },
        idempotencyKey,
      },
    );
    if (
      payload.success !== true
      || payload.tenantId !== tenantId
      || payload.reservationId !== reservationId
      || payload.publicationId !== reservationId
      || payload.resourceType !== "program_media"
      || payload.status !== "published"
      || payload.isVisible !== true
      || !/^https?:\/\//i.test(String(payload.publicUrl || ""))
      || typeof payload.idempotentReplay !== "boolean"
      || !String(payload.operationId || "").trim()
      || !String(payload.requestId || "").trim()
    ) {
      invalidBackendResponse(payload as unknown as Record<string, unknown>);
    }
    return payload;
  }

  async updateMedia(
    tenantId: string,
    mediaId: string,
    data: { fileName: string; category: string; purpose: string; altText: string },
    auditReason: string,
    idempotencyKey: string,
  ) {
    const payload = await this.crmResourceMutation(tenantId, "media.update", {
      resourceId: mediaId,
      data,
      auditReason,
      idempotencyKey,
    });
    if (payload.id !== mediaId || payload.updated !== true) {
      invalidBackendResponse(payload as unknown as Record<string, unknown>);
    }
    return payload;
  }

  async deleteMedia(
    tenantId: string,
    mediaId: string,
    auditReason: string,
    idempotencyKey: string,
  ) {
    const payload = await this.crmResourceMutation(tenantId, "media.delete", {
      resourceId: mediaId,
      data: {},
      auditReason,
      idempotencyKey,
    });
    if (payload.id !== mediaId || payload.archived !== true) {
      invalidBackendResponse(payload as unknown as Record<string, unknown>);
    }
    return payload;
  }

  billingHistory(tenantId: string, limit = 100) {
    return this.send<BillingHistory>("/admin/billing/history", {
      query: { tenantId, limit },
    });
  }

  tenantOperationsTenants({
    environment = "all",
    search = "",
    status = "all",
    publicState = "all",
    health = "all",
    limit = 100,
    cursor = "",
    refresh = false,
  }: {
    environment?: TenantOperationsEnvironment;
    search?: string;
    status?: string;
    publicState?: string;
    health?: string;
    limit?: number;
    cursor?: string;
    refresh?: boolean;
  } = {}) {
    return this.send<TenantOperationsTenantPage>(
      "/admin/crm/tenant-operations/tenants",
      {
        query: {
          environment,
          search,
          status,
          publicState,
          health,
          limit,
          cursor,
          refresh: refresh ? "true" : "",
        },
      },
    );
  }

  billingRuntimeStatus(tenantId: string, limit = 20) {
    return this.send<Record<string, unknown>>("/admin/billing/runtime-status", {
      query: { tenantId, limit },
    });
  }

  async crmOperationalPage(
    tenantId: string,
    collection: CrmOperationalCollection,
    { limit = 100, cursor }: { limit?: number; cursor?: string } = {},
  ) {
    const payload = await this.send<CrmOperationalPage>(
      "/admin/crm/operational-records",
      { query: { tenantId, collection, limit, cursor } },
    );
    assertTenantEnvelope(
      payload as unknown as Record<string, unknown>,
      tenantId,
    );
    if (
      payload.schemaVersion !== "crm_operational_page_v1" ||
      payload.collection !== collection ||
      !Array.isArray(payload.records) ||
      payload.records.some(
        (record) =>
          !record ||
          typeof record !== "object" ||
          !String(record.id || "").trim(),
      ) ||
      typeof payload.hasMore !== "boolean" ||
      (payload.hasMore && !String(payload.nextCursor || "").trim()) ||
      !Number.isSafeInteger(payload.limit) ||
      payload.limit < 1 ||
      !String(payload.requestId || "").trim()
    ) {
      invalidBackendResponse(payload as unknown as Record<string, unknown>);
    }
    return payload;
  }

  async crmDashboardSummary(tenantId: string) {
    const payload = await this.send<CrmDashboardSummary>(
      "/admin/crm/dashboard-summary",
      { query: { tenantId } },
    );
    assertTenantEnvelope(
      payload as unknown as Record<string, unknown>,
      tenantId,
    );
    if (
      payload.schemaVersion !== "crm_dashboard_summary_v1" ||
      !payload.counts ||
      ["registrations", "teams", "events"].some(
        (key) =>
          !Number.isSafeInteger(
            payload.counts[key as keyof typeof payload.counts],
          ) || payload.counts[key as keyof typeof payload.counts] < 0,
      ) ||
      !Array.isArray(payload.recentRegistrations) ||
      payload.recentRegistrations.some(
        (record) =>
          !record ||
          typeof record !== "object" ||
          !String(record.id || "").trim(),
      ) ||
      !String(payload.requestId || "").trim()
    ) {
      invalidBackendResponse(payload as unknown as Record<string, unknown>);
    }
    return payload;
  }

  async importRosterParticipants(
    tenantId: string,
    rows: RosterParticipantImportRow[],
    batchId = createIdempotencyKey("crm-roster-participant-import"),
  ): Promise<RosterParticipantImportResult> {
    const payload = await this.send<RosterParticipantImportResult>(
      "/admin/roster/participants/import",
      {
        method: "POST",
        body: { tenantId, rows, batchId },
        idempotencyKey: batchId,
      },
    );
    assertTenantEnvelope(
      payload as unknown as Record<string, unknown>,
      tenantId,
    );
    if (
      typeof payload.batchId !== "string" ||
      !payload.batchId ||
      !Number.isSafeInteger(payload.savedCount) ||
      payload.savedCount < 1 ||
      !Array.isArray(payload.registrationIds) ||
      payload.registrationIds.length !== payload.savedCount ||
      payload.registrationIds.some(
        (id) => typeof id !== "string" || !id.trim(),
      ) ||
      typeof payload.idempotentReplay !== "boolean" ||
      !String(payload.requestId || "").trim()
    ) {
      invalidBackendResponse(payload as unknown as Record<string, unknown>);
    }
    return payload;
  }

  async previewRosterParticipants(
    tenantId: string,
    rows: RosterParticipantImportRow[],
  ): Promise<RosterParticipantPreviewResult> {
    const payload = await this.send<RosterParticipantPreviewResult>(
      "/admin/roster/participants/preview",
      { method: "POST", body: { tenantId, rows } },
    );
    assertTenantEnvelope(
      payload as unknown as Record<string, unknown>,
      tenantId,
    );
    if (
      payload.success !== true ||
      !Number.isSafeInteger(payload.validCount) ||
      payload.validCount < 0 ||
      !Number.isSafeInteger(payload.rejectedCount) ||
      payload.rejectedCount < 0 ||
      !Array.isArray(payload.rows) ||
      payload.rows.length !== payload.validCount + payload.rejectedCount ||
      payload.rows.some((row) =>
        !Number.isSafeInteger(row?.rowNumber) ||
        row.rowNumber < 2 ||
        !["valid", "rejected"].includes(row.status) ||
        typeof row.participantName !== "string" ||
        typeof row.registrationEmail !== "string" ||
        (row.status === "rejected" && !String(row.message || "").trim())
      ) ||
      !String(payload.requestId || "").trim()
    ) {
      invalidBackendResponse(payload as unknown as Record<string, unknown>);
    }
    return payload;
  }

  async financialOverview(tenantId: string) {
    const payload = await this.send<FinancialOverview>(
      "/admin/crm/financial-overview",
      {
        query: { tenantId },
      },
    );
    assertTenantEnvelope(
      payload as unknown as Record<string, unknown>,
      tenantId,
    );
    if (
      !Array.isArray(payload.transactions) ||
      !Array.isArray(payload.refunds) ||
      !Array.isArray(payload.invoices) ||
      !Array.isArray(payload.deposits) ||
      !payload.recordCounts ||
      typeof payload.recordCounts !== "object" ||
      Object.values(payload.recordCounts).some(
        (count) => !Number.isSafeInteger(count) || count < 0,
      ) ||
      !payload.tracking ||
      typeof payload.tracking !== "object" ||
      typeof payload.tracking.complete !== "boolean" ||
      !Number.isSafeInteger(payload.tracking.unreconciledTransactionCount) ||
      !Number.isSafeInteger(payload.tracking.unreconciledDepositCount) ||
      !Array.isArray(payload.tracking.sourceCollections) ||
      !payload.truncated ||
      typeof payload.truncated !== "object" ||
      Object.values(payload.truncated).some(
        (truncated) => typeof truncated !== "boolean",
      ) ||
      typeof payload.complete !== "boolean" ||
      !payload.operations ||
      typeof payload.operations !== "object" ||
      typeof payload.operations.complete !== "boolean" ||
      !payload.operations.views ||
      (
        [
          "deposits",
          "transactions",
          "scheduled",
          "overdue",
          "invoices",
        ] as const
      ).some((view) => !Array.isArray(payload.operations.views[view])) ||
      !String(payload.requestId || "").trim()
    ) {
      invalidBackendResponse(payload as unknown as Record<string, unknown>);
    }
    return payload;
  }

  async crmAuthorization() {
    return this.send<CrmAuthorization>('/admin/crm/authorization');
  }

  async rosterPlayersPage(tenantId: string, teamId?: string) {
    const payload = await this.send<{
      tenantId: string;
      teamId: string | null;
      players: RosterPlayerRecord[];
      truncated: {
        registrations: boolean;
        privateRegistrations?: boolean;
        memberships: boolean;
        teams: boolean;
      };
      requestId: string;
    }>("/admin/roster/players", { query: { tenantId, teamId } });
    assertTenantEnvelope(
      payload as unknown as Record<string, unknown>,
      tenantId,
    );
    if (
      !Array.isArray(payload.players) ||
      !payload.truncated ||
      typeof payload.truncated !== "object"
    ) {
      invalidBackendResponse(payload as unknown as Record<string, unknown>);
    }
    return payload;
  }

  async rosterPlayers(tenantId: string, teamId?: string) {
    const payload = await this.rosterPlayersPage(tenantId, teamId);
    return payload.players ?? [];
  }

  async auditEvents(tenantId: string, limit = 50) {
    const payload = await this.auditEventPage(tenantId, limit);
    return payload.events;
  }

  async auditEventPage(tenantId: string, limit = 50, cursor?: string) {
    const payload = await this.send<{
      events: CrmAuditEventRecord[];
      truncated: boolean;
      hasMore: boolean;
      nextCursor: string | null;
      limit: number;
      requestId: string;
    }>("/admin/crm/audit-events", { query: { tenantId, limit, cursor } });
    if (
      !Array.isArray(payload.events) ||
      typeof payload.truncated !== "boolean" ||
      typeof payload.hasMore !== "boolean" ||
      (payload.hasMore && !String(payload.nextCursor || "").trim())
    ) {
      invalidBackendResponse(payload as unknown as Record<string, unknown>);
    }
    return payload;
  }

  private async crmResourceMutation(
    tenantId: string,
    action: string,
    {
      resourceId,
      data,
      auditReason,
      idempotencyKey,
    }: {
      resourceId?: string;
      data?: Record<string, unknown>;
      auditReason: string;
      idempotencyKey: string;
    },
  ) {
    const payload = await this.send<CrmResourceMutationResponse>(
      "/admin/crm/resource-mutations",
      {
        method: "POST",
        body: {
          tenantId,
          action,
          ...(resourceId ? { resourceId } : {}),
          data: data ?? {},
          auditReason,
          idempotencyKey,
        },
        idempotencyKey,
      },
    );
    if (
      payload.success !== true ||
      !String(payload.operationId || "").trim() ||
      !String(payload.requestId || "").trim() ||
      typeof payload.idempotentReplay !== "boolean"
    ) {
      invalidBackendResponse(payload as unknown as Record<string, unknown>);
    }
    return payload;
  }

  createTeam(
    tenantId: string,
    data: { name: string; description: string; parentTeamId: string | null },
    auditReason: string,
    idempotencyKey: string,
  ) {
    return this.crmResourceMutation(tenantId, "team.create", {
      data,
      auditReason,
      idempotencyKey,
    });
  }

  updateTeam(
    tenantId: string,
    teamId: string,
    data: { name: string; description: string; parentTeamId: string | null },
    auditReason: string,
    idempotencyKey: string,
  ) {
    return this.crmResourceMutation(tenantId, "team.update", {
      resourceId: teamId,
      data,
      auditReason,
      idempotencyKey,
    });
  }

  async deleteTeam(
    tenantId: string,
    teamId: string,
    auditReason: string,
    idempotencyKey: string,
  ) {
    const payload = await this.crmResourceMutation(tenantId, "team.delete", {
      resourceId: teamId,
      data: {},
      auditReason,
      idempotencyKey,
    });
    if (payload.id !== teamId || payload.deleted !== true) {
      invalidBackendResponse(payload as unknown as Record<string, unknown>);
    }
    return payload;
  }

  async createEventSeries(
    tenantId: string,
    data: {
      teamId: string;
      title: string;
      type: string;
      occurrences: CrmEventOccurrenceInput[];
      location: string;
      notes: string;
      imageReservationId?: string | null;
      seasonId: string | null;
      registrationFormId: string | null;
      publishMode: "immediate" | "draft";
      priceCents?: number;
      paymentTerms?: Record<string, unknown>;
      paymentPolicies?: Record<string, unknown> | null;
    },
    auditReason: string,
    idempotencyKey: string,
  ) {
    const payload = await this.crmResourceMutation(
      tenantId,
      "event.create_series",
      {
        data,
        auditReason,
        idempotencyKey,
      },
    );
    if (
      !String(payload.id || "").trim() ||
      !Array.isArray(payload.eventIds) ||
      payload.eventIds.length === 0 ||
      payload.eventIds.some((id) => !String(id || "").trim()) ||
      !["deferred", "not_required"].includes(
        String(payload.publicationSyncStatus || ""),
      )
    ) {
      invalidBackendResponse(payload as unknown as Record<string, unknown>);
    }
    return payload;
  }

  async duplicateEvent(
    tenantId: string,
    eventId: string,
    occurrences: CrmEventOccurrenceInput[],
    auditReason: string,
    idempotencyKey: string,
  ) {
    const payload = await this.crmResourceMutation(
      tenantId,
      "event.duplicate",
      {
        resourceId: eventId,
        data: { occurrences },
        auditReason,
        idempotencyKey,
      },
    );
    if (
      !String(payload.id || "").trim() ||
      !Array.isArray(payload.eventIds) ||
      payload.eventIds.length === 0 ||
      payload.eventIds.some((id) => !String(id || "").trim())
    ) {
      invalidBackendResponse(payload as unknown as Record<string, unknown>);
    }
    return payload;
  }

  async updateEvent(
    tenantId: string,
    eventId: string,
    data: {
      title?: string;
      location?: string;
      teamId?: string;
      lifecycleStatus?: string;
      imageReservationId?: string | null;
      dateKey?: string;
      startTime?: string;
      endTime?: string;
      startAt?: string;
      endAt?: string;
      timeZone?: string;
      seasonId?: string | null;
      applyToSeries?: boolean;
      priceCents?: number;
      paymentTerms?: Record<string, unknown>;
      paymentPolicies?: Record<string, unknown> | null;
    },
    auditReason: string,
    idempotencyKey: string,
  ) {
    const payload = await this.crmResourceMutation(tenantId, "event.update", {
      resourceId: eventId,
      data,
      auditReason,
      idempotencyKey,
    });
    if (
      payload.id !== eventId ||
      !Array.isArray(payload.eventIds) ||
      payload.eventIds.length < 1 ||
      payload.eventIds.some((id) => !String(id || "").trim()) ||
      !Number.isSafeInteger(payload.updatedCount) ||
      Number(payload.updatedCount) < 1 ||
      !["succeeded", "not_required"].includes(
        String(payload.publicationSyncStatus || ""),
      )
    ) {
      invalidBackendResponse(payload as unknown as Record<string, unknown>);
    }
    return payload;
  }

  createRegistrationForm(
    tenantId: string,
    data: {
      title: string;
      description: string;
      fields: CrmRegistrationFieldsInput;
      sections: CrmRegistrationFormSectionInput[];
      status: "active" | "archived";
    },
    auditReason: string,
    idempotencyKey: string,
  ) {
    return this.crmResourceMutation(tenantId, "registration_form.create", {
      data,
      auditReason,
      idempotencyKey,
    });
  }

  updateRegistrationForm(
    tenantId: string,
    formId: string,
    data: {
      title: string;
      description: string;
      fields: CrmRegistrationFieldsInput;
      sections: CrmRegistrationFormSectionInput[];
      status: "active" | "archived";
    },
    auditReason: string,
    idempotencyKey: string,
  ) {
    return this.crmResourceMutation(tenantId, "registration_form.update", {
      resourceId: formId,
      data,
      auditReason,
      idempotencyKey,
    });
  }

  createSeason(
    tenantId: string,
    data: {
      name: string;
      status: string;
      startDate: string | null;
      endDate: string | null;
      teamId: string | null;
      registrationFormId: string | null;
      imageReservationId?: string | null;
    },
    auditReason: string,
    idempotencyKey: string,
  ) {
    return this.crmResourceMutation(tenantId, "season.create", {
      data,
      auditReason,
      idempotencyKey,
    });
  }

  updateSeason(
    tenantId: string,
    seasonId: string,
    data: {
      name?: string;
      description?: string;
      status?: string;
      startDate?: string | null;
      endDate?: string | null;
      teamId?: string | null;
      registrationFormId?: string | null;
      imageReservationId?: string | null;
    },
    auditReason: string,
    idempotencyKey: string,
  ) {
    return this.crmResourceMutation(tenantId, "season.update", {
      resourceId: seasonId,
      data,
      auditReason,
      idempotencyKey,
    });
  }

  deleteDocument(
    tenantId: string,
    documentId: string,
    auditReason: string,
    idempotencyKey: string,
  ) {
    return this.crmResourceMutation(tenantId, "document.delete", {
      resourceId: documentId,
      auditReason,
      idempotencyKey,
    });
  }

  async uploadDocumentAsset(
    tenantId: string,
    documentId: string,
    file: File,
    idempotencyKey = createIdempotencyKey("document-upload"),
  ) {
    const reservation = await this.send<{
      success: boolean;
      documentId: string;
      storagePath: string;
      uploadUrl: string;
      contentType: string;
      expiresAt: string;
      requestId: string;
    }>("/admin/crm/documents/upload-reservations", {
      method: "POST",
      body: {
        tenantId,
        documentId,
        fileName: file.name,
        contentType: file.type,
        sizeBytes: file.size,
        idempotencyKey,
      },
      idempotencyKey,
    });
    if (
      reservation.success !== true
      || reservation.documentId !== documentId
      || !String(reservation.storagePath || "").startsWith(`documents/${tenantId}/documents/${documentId}/`)
      || !/^https:\/\//i.test(String(reservation.uploadUrl || ""))
      || reservation.contentType !== file.type
      || !validIsoTimestamp(reservation.expiresAt)
    ) {
      invalidBackendResponse(reservation as unknown as Record<string, unknown>);
    }
    let response: Response;
    try {
      response = await this.fetchImplementation(reservation.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
        credentials: "omit",
      });
    } catch {
      throw new BackendApiError({
        message: "The selected document could not be uploaded.",
        status: 503,
        code: "document_upload_failed",
        requestId: reservation.requestId,
      });
    }
    if (!response.ok) {
      throw new BackendApiError({
        message: "The selected document could not be uploaded.",
        status: response.status || 503,
        code: "document_upload_failed",
        requestId: reservation.requestId,
      });
    }
    return {
      storagePath: reservation.storagePath,
      requestId: reservation.requestId,
    };
  }

  createDocument(
    tenantId: string,
    documentId: string,
    data: CrmDocumentInput,
    auditReason: string,
    idempotencyKey: string,
  ) {
    return this.crmResourceMutation(tenantId, "document.create", {
      resourceId: documentId,
      data,
      auditReason,
      idempotencyKey,
    });
  }

  managedDocumentDownloadUrl(documentId: string) {
    return `${this.baseUrl}/documents/${encodeURIComponent(documentId)}/download`;
  }

  updateDocument(
    tenantId: string,
    documentId: string,
    data: CrmDocumentInput,
    auditReason: string,
    idempotencyKey: string,
  ) {
    return this.crmResourceMutation(tenantId, "document.update", {
      resourceId: documentId,
      data,
      auditReason,
      idempotencyKey,
    });
  }

  documentAccessUrl(tenantId: string, documentId: string) {
    return this.send<{
      documentId: string;
      accessUrl: string;
      expiresInSeconds: number;
      requestId: string;
    }>(`/admin/crm/documents/${encodeURIComponent(documentId)}/access-url`, {
      query: { tenantId },
    });
  }

  async documents(tenantId: string, limit = 100) {
    return this.send<{
      tenantId: string;
      documents: CrmDocumentRecord[];
      truncated: boolean;
      requestId: string;
    }>(
      `/admin/crm/documents?tenantId=${encodeURIComponent(tenantId)}&limit=${encodeURIComponent(String(limit))}`,
      { method: "GET" },
    );
  }

  async adminStaffDirectory(tenantId: string, limit = 100) {
    const payload = await this.send<AdminStaffDirectory>(
      `/admin/staff?tenantId=${encodeURIComponent(tenantId)}&limit=${encodeURIComponent(String(limit))}`,
      { method: "GET" },
    );
    assertStaffDirectoryEnvelope(payload, tenantId, limit);
    return payload;
  }

  async updateStaffMembership({
    tenantId,
    membershipId,
    role,
    status,
    auditReason,
    idempotencyKey,
  }: {
    tenantId: string;
    membershipId: string;
    role?: "owner" | "editor" | "viewer";
    status?: "active" | "inactive";
    auditReason: string;
    idempotencyKey: string;
  }) {
    const payload = await this.send<{
      success: true;
      idempotentReplay: boolean;
      membershipId: string;
      uid: string;
      role: "owner" | "editor" | "viewer";
      status: "active" | "inactive";
      requestId: string;
    }>(`/admin/staff/${encodeURIComponent(membershipId)}`, {
      method: "PATCH",
      body: {
        tenantId,
        ...(role ? { role } : {}),
        ...(status ? { status } : {}),
        auditReason,
        idempotencyKey,
      },
      idempotencyKey,
    });
    if (
      payload.success !== true ||
      typeof payload.idempotentReplay !== "boolean" ||
      payload.membershipId !== membershipId ||
      !String(payload.uid || "").trim() ||
      !["owner", "editor", "viewer"].includes(payload.role) ||
      !["active", "inactive"].includes(payload.status) ||
      !String(payload.requestId || "").trim()
    ) {
      invalidBackendResponse(payload as unknown as Record<string, unknown>);
    }
    return payload;
  }

  async revokeAdminInvite({
    tenantId,
    inviteId,
    auditReason,
    idempotencyKey,
  }: {
    tenantId: string;
    inviteId: string;
    auditReason: string;
    idempotencyKey: string;
  }) {
    const payload = await this.send<{
      success: true;
      idempotentReplay: boolean;
      inviteId: string;
      status: "revoked";
      requestId: string;
    }>(`/admin/invites/${encodeURIComponent(inviteId)}/revoke`, {
      method: "POST",
      body: { tenantId, auditReason, idempotencyKey },
      idempotencyKey,
    });
    if (
      payload.success !== true ||
      typeof payload.idempotentReplay !== "boolean" ||
      payload.inviteId !== inviteId ||
      payload.status !== "revoked" ||
      !String(payload.requestId || "").trim()
    ) {
      invalidBackendResponse(payload as unknown as Record<string, unknown>);
    }
    return payload;
  }

  async resendAdminInvite({
    tenantId,
    inviteId,
    idempotencyKey,
  }: {
    tenantId: string;
    inviteId: string;
    idempotencyKey: string;
  }) {
    const payload = await this.send<{
      success: true;
      idempotentReplay: boolean;
      inviteId: string;
      deliveryStatus: "sent";
      requestId: string;
    }>(`/admin/invites/${encodeURIComponent(inviteId)}/resend`, {
      method: "POST",
      body: { tenantId, idempotencyKey },
      idempotencyKey,
    });
    if (
      payload.success !== true ||
      typeof payload.idempotentReplay !== "boolean" ||
      payload.inviteId !== inviteId ||
      payload.deliveryStatus !== "sent" ||
      !String(payload.requestId || "").trim()
    ) {
      invalidBackendResponse(payload as unknown as Record<string, unknown>);
    }
    return payload;
  }

  async previewFinancialPeriod(tenantId: string, period: FinancialPeriodInput) {
    const payload = await this.send<{
      tenantId: string;
      preview: FinancialPeriodPreview;
      requestId: string;
    }>("/admin/financial-periods/preview", {
      method: "POST",
      body: { tenantId, period },
    });
    assertTenantEnvelope(
      payload as unknown as Record<string, unknown>,
      tenantId,
    );
    if (
      !payload.preview ||
      typeof payload.preview !== "object" ||
      typeof payload.preview.truncated !== "boolean" ||
      !payload.preview.collections ||
      typeof payload.preview.collections !== "object"
    ) {
      invalidBackendResponse(payload as unknown as Record<string, unknown>);
    }
    return payload;
  }

  async financialPeriods(tenantId: string, limit = 100) {
    const payload = await this.send<{
      tenantId: string;
      periods: FinancialPeriodRecord[];
      truncated: boolean;
      limit: number;
      requestId: string;
    }>("/admin/financial-periods", {
      query: { tenantId, limit: String(limit) },
    });
    assertTenantEnvelope(
      payload as unknown as Record<string, unknown>,
      tenantId,
    );
    if (
      !Array.isArray(payload.periods) ||
      typeof payload.truncated !== "boolean" ||
      !Number.isSafeInteger(payload.limit)
    ) {
      invalidBackendResponse(payload as unknown as Record<string, unknown>);
    }
    return payload;
  }

  async closeFinancialPeriod(
    tenantId: string,
    period: FinancialPeriodInput,
    auditReason: string,
    idempotencyKey: string,
  ) {
    const payload = await this.send<{
      success: true;
      idempotentReplay: boolean;
      periodId: string;
      status: "closed";
      preview: FinancialPeriodPreview;
      requestId: string;
    }>("/admin/financial-periods/close", {
      method: "POST",
      body: { tenantId, period, auditReason, idempotencyKey },
      idempotencyKey,
    });
    if (
      payload.success !== true ||
      payload.status !== "closed" ||
      !String(payload.periodId || "").trim() ||
      typeof payload.idempotentReplay !== "boolean" ||
      !payload.preview
    ) {
      invalidBackendResponse(payload as unknown as Record<string, unknown>);
    }
    return payload;
  }

  async reopenFinancialPeriod(
    tenantId: string,
    periodId: string,
    auditReason: string,
    idempotencyKey: string,
  ) {
    const payload = await this.send<{
      success: true;
      idempotentReplay: boolean;
      periodId: string;
      status: "reopened";
      requestId: string;
    }>(`/admin/financial-periods/${encodeURIComponent(periodId)}/reopen`, {
      method: "POST",
      body: { tenantId, auditReason, idempotencyKey },
      idempotencyKey,
    });
    if (
      payload.success !== true ||
      payload.status !== "reopened" ||
      !String(payload.periodId || "").trim() ||
      typeof payload.idempotentReplay !== "boolean"
    ) {
      invalidBackendResponse(payload as unknown as Record<string, unknown>);
    }
    return payload;
  }

  async appConfiguration(tenantId: string) {
    const payload = await this.send<CrmAppConfigurationSnapshot>(
      "/admin/crm/app-configuration",
      { query: { tenantId } },
    );
    assertTenantEnvelope(
      payload as unknown as Record<string, unknown>,
      tenantId,
    );
    if (
      !["initialize", "update"].includes(payload.mode) ||
      !Number.isSafeInteger(payload.configVersion) ||
      payload.configVersion < 0 ||
      (payload.publishedAt !== null && !validIsoTimestamp(payload.publishedAt)) ||
      (payload.publishedBy !== null && typeof payload.publishedBy !== "string") ||
      (payload.publishedByLabel !== undefined && payload.publishedByLabel !== null && typeof payload.publishedByLabel !== "string") ||
      !String(payload.versionToken || "").trim() ||
      !String(payload.requestId || "").trim() ||
      (payload.mode === "initialize"
        ? payload.configuration !== null
        : !isValidAppConfiguration(payload.configuration))
    ) {
      invalidBackendResponse(payload as unknown as Record<string, unknown>);
    }
    return payload;
  }

  async appConfigurationHistory(tenantId: string) {
    const payload = await this.send<{
      tenantId: string;
      versions: Array<{
        id: string;
        configVersion: number;
        publishedAt: string | null;
        publishedBy: string | null;
        publishedByLabel?: string | null;
        auditReason: string | null;
        configuration: CrmAppConfiguration;
      }>;
      truncated: boolean;
      requestId: string;
    }>("/admin/crm/app-configuration/history", { query: { tenantId } });
    assertTenantEnvelope(payload as unknown as Record<string, unknown>, tenantId);
    if (!Array.isArray(payload.versions) || typeof payload.truncated !== "boolean" || !String(payload.requestId || "").trim() || payload.versions.some((version) => !String(version.id || "").trim() || !Number.isSafeInteger(version.configVersion) || version.configVersion < 1 || (version.publishedAt !== null && !validIsoTimestamp(version.publishedAt)) || (version.publishedBy !== null && typeof version.publishedBy !== "string") || (version.publishedByLabel !== undefined && version.publishedByLabel !== null && typeof version.publishedByLabel !== "string") || (version.auditReason !== null && typeof version.auditReason !== "string") || !isValidAppConfiguration(version.configuration))) {
      invalidBackendResponse(payload as unknown as Record<string, unknown>);
    }
    return payload;
  }

  async componentStudio(tenantId: string) {
    const payload = await this.send<CrmComponentStudioSnapshot>(
      "/admin/crm/component-studio",
      { query: { tenantId } },
    );
    assertTenantEnvelope(payload as unknown as Record<string, unknown>, tenantId);
    if (
      !String(payload.templateId || "").trim() ||
      !Number.isSafeInteger(payload.templateVersion) ||
      !String(payload.versionToken || "").trim() ||
      !String(payload.requestId || "").trim() ||
      !Array.isArray(payload.definitions) ||
      !Array.isArray(payload.pages) ||
      (payload.versions !== undefined && !Array.isArray(payload.versions)) ||
      (payload.historyTruncated !== undefined && typeof payload.historyTruncated !== "boolean") ||
      payload.definitions.some((definition) =>
        !String(definition?.id || "").trim() ||
        !String(definition?.type || "").trim() ||
        !Number.isSafeInteger(definition?.definitionVersion) ||
        !Array.isArray(definition?.fields)
      ) ||
      payload.pages.some((page) =>
        !String(page?.id || "").trim() ||
        !String(page?.route || "").startsWith("/") ||
        !Array.isArray(page?.components)
      ) ||
      (payload.versions || []).some((version) =>
        !String(version?.id || "").trim() ||
        !String(version?.versionToken || "").trim() ||
        (version.capturedAt !== null && !validIsoTimestamp(version.capturedAt)) ||
        !Array.isArray(version.pages)
      )
    ) {
      invalidBackendResponse(payload as unknown as Record<string, unknown>);
    }
    return payload;
  }

  async publishPageLayout(
    tenantId: string,
    data: {
      templateId: string;
      templateVersion: number;
      expectedVersionToken: string;
      pages: CrmComponentStudioPage[];
      stalePageIds: string[];
      staleComponentIds: string[];
    },
    auditReason: string,
    idempotencyKey: string,
  ) {
    return this.crmResourceMutation(tenantId, "page_layout.publish_full", {
      resourceId: data.templateId,
      data: {
        ...data,
        pages: data.pages.map((page) => ({
          id: page.id,
          title: page.title,
          headline: page.headline,
          subheader: page.subheader,
          route: page.route,
          isVisible: page.isVisible,
          components: page.components.map(({ status: _status, ...component }) => component),
        })),
      },
      auditReason,
      idempotencyKey,
    });
  }

  async publishAppConfiguration(
    tenantId: string,
    data: CrmAppConfiguration & {
      mode: "initialize" | "update";
      expectedVersionToken: string;
    },
    auditReason: string,
    idempotencyKey: string,
  ) {
    const payload = await this.crmResourceMutation(
      tenantId,
      "app_configuration.publish",
      { data, auditReason, idempotencyKey },
    );
    if (
      payload.id !== tenantId ||
      payload.mode !== "update" ||
      !String(payload.versionToken || "").trim() ||
      !["succeeded", "deferred"].includes(
        String(payload.publicationSyncStatus || ""),
      ) ||
      !isValidAppConfiguration(payload.configuration)
    ) {
      invalidBackendResponse(payload as unknown as Record<string, unknown>);
    }
    return payload;
  }

  async directInvoicePage(
    tenantId: string,
    {
      limit = 100,
      cursor,
      status,
    }: { limit?: number; cursor?: string; status?: string } = {},
  ) {
    const payload = await this.send<{
      tenantId: string;
      status: string | null;
      invoices: DirectInvoiceRecord[];
      truncated: boolean;
      hasMore: boolean;
      nextCursor: string | null;
      limit: number;
      requestId: string;
    }>("/admin/direct-invoices", {
      query: { tenantId, limit, cursor, status },
    });
    assertTenantEnvelope(
      payload as unknown as Record<string, unknown>,
      tenantId,
    );
    if (
      !Array.isArray(payload.invoices) ||
      typeof payload.truncated !== "boolean" ||
      typeof payload.hasMore !== "boolean" ||
      (payload.hasMore && !String(payload.nextCursor || "").trim()) ||
      !Number.isSafeInteger(payload.limit) ||
      !String(payload.requestId || "").trim()
    ) {
      invalidBackendResponse(payload as unknown as Record<string, unknown>);
    }
    for (const invoice of payload.invoices) {
      directInvoiceFromEnvelope({
        invoice,
        requestId: payload.requestId,
      });
    }
    return payload;
  }

  async directInvoices(tenantId: string) {
    const payload = await this.directInvoicePage(tenantId);
    return payload.invoices ?? [];
  }

  async createDirectInvoice(draft: DirectInvoiceDraft, idempotencyKey: string) {
    const payload = await this.send<{ invoice: DirectInvoiceRecord }>(
      "/admin/direct-invoices",
      {
        method: "POST",
        body: { ...draft, idempotencyKey },
        idempotencyKey,
      },
    );
    return directInvoiceFromEnvelope(
      payload as unknown as Record<string, unknown>,
    );
  }

  async directInvoiceAction(
    tenantId: string,
    invoiceId: string,
    action: "issue" | "remind" | "void",
    idempotencyKey?: string,
    auditReason?: string,
  ) {
    const payload = await this.send<{ invoice: DirectInvoiceRecord }>(
      `/admin/direct-invoices/${encodeURIComponent(invoiceId)}/${action}`,
      {
        method: "POST",
        body: {
          tenantId,
          ...(idempotencyKey ? { idempotencyKey } : {}),
          ...(auditReason ? { auditReason } : {}),
        },
        idempotencyKey,
      },
    );
    return directInvoiceFromEnvelope(
      payload as unknown as Record<string, unknown>,
      invoiceId,
    );
  }

  async recordManualPayment({
    tenantId,
    invoiceId,
    amountCents,
    method,
    reference,
    note,
    auditReason,
    receivedAt,
    idempotencyKey,
  }: {
    tenantId: string;
    invoiceId: string;
    amountCents: number;
    method: "cash" | "check" | "bank_transfer" | "other";
    reference: string;
    note?: string;
    auditReason: string;
    receivedAt: string;
    idempotencyKey: string;
  }) {
    const payload = await this.send<{ invoice: DirectInvoiceRecord }>(
      `/admin/direct-invoices/${encodeURIComponent(invoiceId)}/manual-payment`,
      {
        method: "POST",
        body: {
          tenantId,
          amountCents,
          method,
          reference,
          note,
          auditReason,
          receivedAt,
          idempotencyKey,
        },
        idempotencyKey,
      },
    );
    return directInvoiceFromEnvelope(
      payload as unknown as Record<string, unknown>,
      invoiceId,
    );
  }

  async refundDirectInvoice({
    tenantId,
    invoiceId,
    amountCents,
    reason,
    note,
    idempotencyKey,
  }: {
    tenantId: string;
    invoiceId: string;
    amountCents: number;
    reason: string;
    note: string;
    idempotencyKey: string;
  }) {
    const payload = await this.send<{ invoice: DirectInvoiceRecord }>(
      `/admin/direct-invoices/${encodeURIComponent(invoiceId)}/refund`,
      {
        method: "POST",
        body: {
          tenantId,
          amountCents,
          reason,
          note,
          idempotencyKey,
        },
        idempotencyKey,
      },
    );
    return directInvoiceFromEnvelope(
      payload as unknown as Record<string, unknown>,
      invoiceId,
    );
  }

  async reconcileDirectInvoice(
    tenantId: string,
    invoiceId: string,
    auditReason: string,
  ) {
    const payload = await this.send<{ invoice: DirectInvoiceRecord }>(
      `/admin/direct-invoices/${encodeURIComponent(invoiceId)}/reconcile`,
      {
        method: "POST",
        body: { tenantId, auditReason },
      },
    );
    return directInvoiceFromEnvelope(
      payload as unknown as Record<string, unknown>,
      invoiceId,
    );
  }

  async directInvoiceLedger(tenantId: string, invoiceId: string) {
    const payload = await this.send<{
      tenantId: string;
      invoice: DirectInvoiceRecord;
      events: Array<Record<string, unknown>>;
      payments: Array<Record<string, unknown>>;
      refunds: Array<Record<string, unknown>>;
      providerAccounting: DirectInvoiceProviderAccounting | null;
      truncated: {
        events: boolean;
        payments: boolean;
        refunds: boolean;
      };
      limits: {
        events: number;
        payments: number;
        refunds: number;
      };
      requestId: string;
    }>(`/admin/direct-invoices/${encodeURIComponent(invoiceId)}/ledger`, {
      query: { tenantId },
    });
    assertTenantEnvelope(
      payload as unknown as Record<string, unknown>,
      tenantId,
    );
    if (
      !Array.isArray(payload.events) ||
      !Array.isArray(payload.payments) ||
      !Array.isArray(payload.refunds) ||
      !payload.truncated ||
      Object.values(payload.truncated).some(
        (truncated) => typeof truncated !== "boolean",
      ) ||
      !payload.limits ||
      Object.values(payload.limits).some(
        (limit) => !Number.isSafeInteger(limit) || limit < 1,
      ) ||
      !String(payload.requestId || "").trim() ||
      !validDirectInvoiceProviderAccounting(payload.providerAccounting)
    ) {
      invalidBackendResponse(payload as unknown as Record<string, unknown>);
    }
    directInvoiceFromEnvelope(
      payload as unknown as Record<string, unknown>,
      invoiceId,
    );
    return payload;
  }

  resendPaymentReceipt(
    tenantId: string,
    paymentId: string,
    auditReason: string,
    idempotencyKey: string,
  ) {
    return this.send<Record<string, unknown>>(
      `/admin/billing/payments/${encodeURIComponent(paymentId)}/resend-receipt`,
      {
        method: "POST",
        body: { tenantId, auditReason },
        idempotencyKey,
      },
    );
  }

  stripeConnectStatus(tenantId: string) {
    return this.send<{
      connected: boolean;
      stripeAccountId: string | null;
      detailsSubmitted: boolean;
      chargesEnabled: boolean;
      payoutsEnabled: boolean;
      requirementsDueCount: number;
    }>("/stripe/connect/status", { query: { tenantId } });
  }

  stripeConnectAccountLink(
    tenantId: string,
    idempotencyKey = crypto.randomUUID(),
  ) {
    return this.send<{
      onboardingUrl: string;
      stripeAccountId: string;
      expiresAt: number | null;
      idempotentReplay: boolean;
    }>("/stripe/connect/account-link", {
      method: "POST",
      body: { tenantId },
      idempotencyKey,
    });
  }

  onboardingStatus(tenantId: string) {
    return this.send<Record<string, unknown>>("/admin/onboarding/status", {
      query: { tenantId },
    });
  }

  async bootstrapOrganization(
    body: Record<string, unknown>,
    idempotencyKey: string,
  ) {
    const tenantId = String(body.tenantId || "").trim();
    const payload = await this.send<OnboardingBootstrapResult>(
      "/admin/onboarding/bootstrap",
      {
        method: "POST",
        body: { ...body, operationKey: idempotencyKey },
        idempotencyKey,
      },
    );
    assertTenantEnvelope(
      payload as unknown as Record<string, unknown>,
      tenantId,
    );
    if (
      !String(payload.programName || "").trim() ||
      !payload.readiness ||
      typeof payload.readiness !== "object" ||
      !String(payload.readiness.state || "").trim() ||
      typeof payload.readiness.launchReady !== "boolean" ||
      !Array.isArray(payload.readiness.blockers) ||
      payload.readiness.blockers.some(
        (blocker) => typeof blocker !== "string" || !blocker.trim(),
      ) ||
      !payload.readiness.checks ||
      typeof payload.readiness.checks !== "object" ||
      !payload.seeded ||
      typeof payload.seeded !== "object" ||
      !Array.isArray(payload.seeded.teams) ||
      payload.seeded.teams.some(
        (teamId) => typeof teamId !== "string" || !teamId.trim(),
      ) ||
      typeof payload.idempotentReplay !== "boolean" ||
      !String(payload.requestId || "").trim()
    ) {
      invalidBackendResponse(payload as unknown as Record<string, unknown>);
    }
    return payload;
  }

  async createCrmExport(body: CrmExportRequest, idempotencyKey: string) {
    const payload = await this.send<{
      tenantId?: string;
      exportId: string;
      resourceId: string;
      rowCount: number;
      visibleColumnIds: string[];
      checksum: string;
      expiresAt: string;
      csvBase64: string;
      idempotentReplay: boolean;
      requestId?: string;
    }>("/admin/crm/exports", {
      method: "POST",
      body,
      idempotencyKey,
    });
    if (
      (payload.tenantId && payload.tenantId !== body.tenantId) ||
      !String(payload.exportId || "").trim() ||
      payload.resourceId !== body.resourceId ||
      !Number.isSafeInteger(payload.rowCount) ||
      payload.rowCount < 0 ||
      !Array.isArray(payload.visibleColumnIds) ||
      payload.visibleColumnIds.length === 0 ||
      payload.visibleColumnIds.some(
        (columnId) => typeof columnId !== "string" || !columnId.trim(),
      ) ||
      !/^[a-f0-9]{64}$/i.test(String(payload.checksum || "")) ||
      !validIsoTimestamp(payload.expiresAt) ||
      !String(payload.csvBase64 || "").trim() ||
      typeof payload.idempotentReplay !== "boolean" ||
      (payload.requestId !== undefined &&
        !String(payload.requestId || "").trim())
    ) {
      invalidBackendResponse(payload as unknown as Record<string, unknown>);
    }
    return payload;
  }

  async sendMessageBatch(
    tenantId: string,
    messages: Array<Record<string, unknown>>,
    idempotencyKey: string,
  ) {
    const payload = await this.send<{
      success: boolean;
      sendId: string;
      messageCount: number;
      activeRecipientCount: number;
      retainedRecipientCount: number;
      publicCount: number;
      notifications: {
        scope: "tenant_account_holders";
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
      };
      requestId: string;
    }>("/admin/messages/batch", {
      method: "POST",
      body: { tenantId, messages },
      idempotencyKey,
    });
    const notificationCounts = [
      "requestedMessageCount",
      "sentMessageCount",
      "failedMessageCount",
      "noRecipientMessageCount",
      "replayedMessageCount",
      "eligibleAccountCount",
      "eligibleDeviceCount",
      "successCount",
      "failureCount",
    ] as const;
    if (
      payload.success !== true ||
      !String(payload.sendId || "").trim() ||
      !String(payload.requestId || "").trim() ||
      payload.notifications?.scope !== "tenant_account_holders" ||
      payload.notifications?.topic !== null ||
      notificationCounts.some(
        (field) =>
          !Number.isSafeInteger(payload.notifications?.[field]) ||
          Number(payload.notifications?.[field]) < 0,
      ) ||
      !payload.notifications?.providerErrorCodes ||
      Object.entries(payload.notifications.providerErrorCodes).some(
        ([code, count]) =>
          !/^messaging\/[a-z0-9-]+$/.test(code) ||
          !Number.isSafeInteger(count) ||
          count < 0,
      )
    ) {
      invalidBackendResponse(payload as unknown as Record<string, unknown>);
    }
    return payload;
  }

  async announcementAudiencePreview(tenantId: string) {
    const payload = await this.send<{
      success: boolean;
      tenantId: string;
      scope: "tenant_account_holders";
      eligibleAccountCount: number;
      eligibleDeviceCount: number;
      truncated: boolean;
      requestId: string;
    }>("/admin/messages/announcement-preview", {
      method: "POST",
      body: { tenantId },
    });
    if (
      payload.success !== true ||
      payload.tenantId !== tenantId ||
      payload.scope !== "tenant_account_holders" ||
      !Number.isSafeInteger(payload.eligibleAccountCount) ||
      payload.eligibleAccountCount < 0 ||
      !Number.isSafeInteger(payload.eligibleDeviceCount) ||
      payload.eligibleDeviceCount < 0 ||
      typeof payload.truncated !== "boolean" ||
      !String(payload.requestId || "").trim()
    ) {
      invalidBackendResponse(payload as unknown as Record<string, unknown>);
    }
    return payload;
  }

  async adminInboxThreads(tenantId: string) {
    const payload = await this.send<{
      success: boolean;
      tenantId: string;
      threads: AdminInboxThread[];
      truncated: boolean;
      requestId: string;
    }>("/admin/inbox/threads", { query: { tenantId } });
    assertTenantEnvelope(
      payload as unknown as Record<string, unknown>,
      tenantId,
    );
    if (
      payload.success !== true ||
      !Array.isArray(payload.threads) ||
      typeof payload.truncated !== "boolean" ||
      !String(payload.requestId || "").trim() ||
      payload.threads.some(
        (thread) =>
          !String(thread.id || "").trim() ||
          !String(thread.consumerEmail || "").trim() ||
          !Array.isArray(thread.messages) ||
          thread.messages.some(
            (message) =>
              !String(message.id || "").trim() ||
              !["consumer", "admin"].includes(message.direction) ||
              !String(message.message || "").trim(),
          ),
      )
    ) {
      invalidBackendResponse(payload as unknown as Record<string, unknown>);
    }
    return payload;
  }

  async replyAdminInbox({
    tenantId,
    consumerEmail,
    threadRecipientEmail,
    subject,
    message,
    requestId,
  }: {
    tenantId: string;
    consumerEmail: string;
    threadRecipientEmail: string;
    subject: string;
    message: string;
    requestId?: string | null;
  }) {
    const payload = await this.send<{
      success: boolean;
      tenantId: string;
      replyId: string;
      senderAddress: string;
      requestId: string;
    }>("/admin/inbox/reply", {
      method: "POST",
      body: {
        tenantId,
        consumerEmail,
        threadRecipientEmail,
        subject,
        message,
        requestId: requestId || null,
      },
    });
    assertTenantEnvelope(
      payload as unknown as Record<string, unknown>,
      tenantId,
    );
    if (
      payload.success !== true ||
      !String(payload.replyId || "").trim() ||
      !String(payload.requestId || "").trim()
    ) {
      invalidBackendResponse(payload as unknown as Record<string, unknown>);
    }
    return payload;
  }

  recallMessage(tenantId: string, messageId: string, idempotencyKey: string, auditReason = "Announcement removed by an authorized administrator.") {
    return this.send<{
      success: boolean;
      idempotentReplay: boolean;
      messageId: string;
      requestId: string;
    }>(`/admin/messages/${encodeURIComponent(messageId)}/recall`, {
      method: "POST",
      body: { tenantId, idempotencyKey, auditReason },
      idempotencyKey,
    });
  }

  async adminInvites(tenantId: string) {
    const payload = await this.send<{ invites: AdminInviteRecord[] }>(
      "/admin/invites",
      { query: { tenantId } },
    );
    return payload.invites ?? [];
  }

  async createAdminInvite({
    tenantId,
    email,
    role,
    firstName,
    lastName,
    idempotencyKey,
  }: {
    tenantId: string;
    email: string;
    role: "editor" | "viewer";
    firstName?: string;
    lastName?: string;
    idempotencyKey: string;
  }) {
    const payload = await this.send<{ invite: AdminInviteRecord }>(
      "/admin/invites",
      {
        method: "POST",
        body: {
          tenantId,
          email,
          role,
          firstName,
          lastName,
        },
        idempotencyKey,
      },
    );
    return payload.invite;
  }

  async previewRosterChanges(
    tenantId: string,
    teamId: string,
    changes: RosterChange[],
  ) {
    const payload = await this.send<{
      tenantId: string;
      preview: RosterPreview;
      requestId: string;
    }>(`/admin/teams/${encodeURIComponent(teamId)}/roster/preview`, {
      method: "POST",
      body: { tenantId, changes },
    });
    assertTenantEnvelope(
      payload as unknown as Record<string, unknown>,
      tenantId,
    );
    assertRosterPreviewEnvelope(payload, teamId);
    return payload.preview;
  }

  async commitRosterChanges(
    tenantId: string,
    teamId: string,
    preview: RosterPreview,
    idempotencyKey: string,
  ) {
    const payload = await this.send<{
      success: boolean;
      idempotentReplay?: boolean;
      tenantId: string;
      operationId: string;
      preview: RosterPreview;
      requestId: string;
    }>(`/admin/teams/${encodeURIComponent(teamId)}/roster/commit`, {
      method: "POST",
      body: {
        tenantId,
        changes: preview.changes,
        changeSetHash: preview.changeSetHash,
      },
      idempotencyKey,
    });
    assertTenantEnvelope(
      payload as unknown as Record<string, unknown>,
      tenantId,
    );
    assertRosterPreviewEnvelope(payload, teamId);
    if (
      payload.success !== true ||
      !String(payload.operationId || "").trim() ||
      !String(payload.requestId || "").trim() ||
      (payload.idempotentReplay !== undefined &&
        typeof payload.idempotentReplay !== "boolean")
    ) {
      invalidBackendResponse(payload as unknown as Record<string, unknown>);
    }
    return payload;
  }

  async previewRosterTransfer(
    tenantId: string,
    registrationIds: string[],
    destinationTeamId: string | null,
  ) {
    const payload = await this.send<{
      tenantId: string;
      preview: RosterTransferPreview;
      requestId: string;
    }>("/admin/roster/transfers/preview", {
      method: "POST",
      body: {
        tenantId,
        registrationIds,
        destinationTeamId,
      },
    });
    return payload.preview;
  }

  commitRosterTransfer(
    tenantId: string,
    preview: RosterTransferPreview,
    idempotencyKey: string,
  ) {
    return this.send<{
      success: boolean;
      idempotentReplay: boolean;
      tenantId: string;
      operationId: string;
      auditEventId: string | null;
      preview: RosterTransferPreview;
      requestId: string;
    }>("/admin/roster/transfers/commit", {
      method: "POST",
      body: {
        tenantId,
        registrationIds: preview.registrationIds,
        destinationTeamId: preview.destinationTeamId,
        changeSetHash: preview.changeSetHash,
      },
      idempotencyKey,
    });
  }

  assignSeasonParticipants(
    tenantId: string,
    seasonId: string,
    registrationIds: string[],
    idempotencyKey: string,
  ) {
    return this.send<{
      success: boolean;
      idempotentReplay: boolean;
      tenantId: string;
      seasonId: string;
      registrationIds: string[];
      assignedCount: number;
      alreadyAssignedCount: number;
      operationId: string;
      auditEventId: string | null;
      requestId: string;
    }>(`/admin/seasons/${encodeURIComponent(seasonId)}/participants/assign`, {
      method: "POST",
      body: {
        tenantId,
        registrationIds,
      },
      idempotencyKey,
    });
  }

  refundTransaction({
    tenantId,
    transactionId,
    amountCents,
    reason,
    note,
    idempotencyKey,
  }: {
    tenantId: string;
    transactionId: string;
    amountCents?: number;
    reason: "duplicate" | "fraudulent" | "requested_by_customer";
    note: string;
    idempotencyKey: string;
  }) {
    return this.send<{
      success: boolean;
      idempotentReplay: boolean;
      transactionId: string;
      refund: Record<string, unknown>;
      requestId: string;
    }>("/admin/refund", {
      method: "POST",
      body: {
        tenantId,
        transactionId,
        amountCents,
        reason,
        note,
      },
      idempotencyKey,
    });
  }
}

export function createIdempotencyKey(prefix: string) {
  const safePrefix =
    prefix
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .slice(0, 40) || "operation";
  return `${safePrefix}:${defaultRequestId()}`;
}
