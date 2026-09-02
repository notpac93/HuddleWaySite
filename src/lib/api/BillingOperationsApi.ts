import { backendClient } from './backendClient';
import type {
  BillingPackageRecord,
  ParticipantInstallmentAgreement,
  ParticipantRelationships,
} from './BackendApi';

function requireTenant(payload: { tenantId?: unknown }, tenantId: string) {
  if (String(payload.tenantId || '').trim() !== tenantId) {
    throw new Error('The billing response did not match the active organization.');
  }
}

export const billingOperationsApi = {
  async billingPackages(tenantId: string) {
    const payload = await backendClient.request<{
      tenantId: string;
      packages: BillingPackageRecord[];
      requestId: string;
    }>('/admin/billing-packages', { query: { tenantId } });
    requireTenant(payload, tenantId);
    if (!Array.isArray(payload.packages)) {
      throw new Error('Billing packages could not be read.');
    }
    return payload.packages;
  },

  async saveBillingPackage(
    tenantId: string,
    data: Record<string, unknown>,
    idempotencyKey: string,
    packageId?: string,
  ) {
    const payload = await backendClient.request<{
      package: BillingPackageRecord;
      requestId: string;
    }>(
      packageId
        ? `/admin/billing-packages/${encodeURIComponent(packageId)}`
        : '/admin/billing-packages',
      {
        method: packageId ? 'PATCH' : 'POST',
        body: { tenantId, ...data },
        idempotencyKey,
      },
    );
    if (!payload.package || !String(payload.package.id || '').trim()) {
      throw new Error('The saved billing package could not be read.');
    }
    return payload.package;
  },

  async participantRelationships(
    tenantId: string,
    participantId: string,
    registrationId: string,
  ) {
    const payload = await backendClient.request<ParticipantRelationships>(
      `/admin/participants/${encodeURIComponent(participantId)}/relationships`,
      { query: { tenantId, registrationId } },
    );
    if (
      !Array.isArray(payload.relationships)
      || !Array.isArray(payload.options)
      || typeof payload.canAssign !== 'boolean'
    ) {
      throw new Error('Participant relationships could not be read.');
    }
    return payload;
  },

  async participantTechnicalDetails(
    tenantId: string,
    participantId: string,
    registrationId: string,
  ) {
    const payload = await backendClient.request<{
      entries: Array<{ label: string; value: string }>;
      requestId: string;
    }>(
      `/admin/participants/${encodeURIComponent(participantId)}/technical-details`,
      { query: { tenantId, registrationId } },
    );
    if (!Array.isArray(payload.entries)) {
      throw new Error('Participant technical details could not be read.');
    }
    return payload;
  },

  async participantInstallmentAgreements(
    tenantId: string,
    participantId: string,
  ) {
    const payload = await backendClient.request<{
      agreements: ParticipantInstallmentAgreement[];
      requestId: string;
    }>(
      `/admin/participants/${encodeURIComponent(participantId)}/installment-agreements`,
      { query: { tenantId } },
    );
    if (!Array.isArray(payload.agreements)) {
      throw new Error('Participant payment plans could not be read.');
    }
    return payload.agreements;
  },

  proposeParticipantInstallmentRevision({
    tenantId,
    participantId,
    agreementId,
    data,
    idempotencyKey,
  }: {
    tenantId: string;
    participantId: string;
    agreementId: string;
    data: Record<string, unknown>;
    idempotencyKey: string;
  }) {
    return backendClient.request<Record<string, unknown>>(
      `/admin/participants/${encodeURIComponent(participantId)}`
        + `/installment-agreements/${encodeURIComponent(agreementId)}/revisions`,
      {
        method: 'POST',
        body: { tenantId, ...data },
        idempotencyKey,
      },
    );
  },
};
