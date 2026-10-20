import { describe, expect, it } from 'vitest';
import { authorizationFailure, credentialBoundary, CredentialBoundaryError } from '../../src/lib/api/credentialBoundary';

describe('credential boundary diagnostics', () => {
  it('distinguishes token failure before fetch without forwarding SDK detail', async () => {
    const error = await credentialBoundary('app_check', async () => {
      throw { code: 'appCheck/recaptcha-error', message: 'private token / uid / email' };
    }).catch(error => error);
    expect(error).toBeInstanceOf(CredentialBoundaryError);
    expect(authorizationFailure(error)).toEqual({phase:'app_check',reason:'recaptcha_error'});
    expect(JSON.stringify(error)).not.toContain('private');
    expect(String(error)).not.toContain('private');
  });
  it('preserves success and reports only bounded HTTP facts', async () => {
    await expect(credentialBoundary('identity_token', async () => 'fixture')).resolves.toBe('fixture');
    expect(authorizationFailure({name:'BackendApiError',status:403,message:'private',code:'private'}))
      .toEqual({phase:'authorization_http',reason:'forbidden',httpStatus:403});
    expect(authorizationFailure(new TypeError('private')))
      .toEqual({phase:'authorization_request',reason:'network_error'});
    expect(authorizationFailure({code:'private'}))
      .toEqual({phase:'authorization_request',reason:'unknown'});
  });
});
