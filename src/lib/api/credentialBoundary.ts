export type CredentialPhase = 'identity_ready' | 'identity_token' | 'app_check';

const reasons: Record<string, string> = {
  'auth/network-request-failed': 'network_error',
  'auth/user-token-expired': 'token_expired',
  'auth/id-token-revoked': 'token_revoked',
  'auth/user-disabled': 'user_disabled',
  'appCheck/fetch-network-error': 'network_error',
  'appCheck/fetch-status-error': 'fetch_status',
  'appCheck/recaptcha-error': 'recaptcha_error',
  'appCheck/throttled': 'throttled',
  'appCheck/use-before-activation': 'not_initialized',
};

export class CredentialBoundaryError extends Error {
  readonly reason: string;
  constructor(readonly phase: CredentialPhase, error: unknown) {
    super('Backend credential preparation failed.');
    this.name = 'CredentialBoundaryError';
    const code = error && typeof error === 'object' && 'code' in error
      ? String(error.code) : '';
    this.reason = reasons[code] || (error instanceof TypeError ? 'network_error' : 'unknown');
  }
}

export async function credentialBoundary<T>(phase: CredentialPhase, work: () => Promise<T>): Promise<T> {
  try { return await work(); }
  catch (error) { throw new CredentialBoundaryError(phase, error); }
}

export function authorizationFailure(error: unknown) {
  if (error instanceof CredentialBoundaryError) {
    return { phase: error.phase, reason: error.reason };
  }
  if (error && typeof error === 'object' && 'name' in error && error.name === 'BackendApiError') {
    const status = 'status' in error && Number.isInteger(error.status)
      && Number(error.status) >= 100 && Number(error.status) <= 599 ? Number(error.status) : undefined;
    const reason = status === 408 ? 'deadline' : status === 401 ? 'unauthenticated'
      : status === 403 ? 'forbidden' : 'http_error';
    return { phase: 'authorization_http', reason, ...(status ? { httpStatus: status } : {}) };
  }
  return { phase: 'authorization_request', reason: error instanceof TypeError ? 'network_error' : 'unknown' };
}
