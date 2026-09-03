import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import type { Component } from 'svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMocks = vi.hoisted(() => ({
  createUser: vi.fn(),
  sendVerification: vi.fn(),
  setPersistence: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  reset: vi.fn(),
}));

vi.mock('../../src/lib/firebase', () => ({ auth: {} }));
vi.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: authMocks.createUser,
  sendEmailVerification: authMocks.sendVerification,
  setPersistence: authMocks.setPersistence,
  browserLocalPersistence: { type: 'LOCAL' },
  signInWithEmailAndPassword: authMocks.signIn,
  signOut: authMocks.signOut,
  sendPasswordResetEmail: authMocks.reset,
}));

import Login from '../../src/components/crm/Login.svelte';

const TestedLogin = Login as unknown as Component;

async function fillLogin() {
  await fireEvent.input(screen.getByLabelText('Email address'), {
    target: { value: 'admin@example.test' },
  });
  await fireEvent.input(screen.getByLabelText('Password'), {
    target: { value: 'secret-password' },
  });
}

describe('Login safe interaction states', () => {
  beforeEach(() => {
    authMocks.signIn.mockReset();
    authMocks.reset.mockReset();
    authMocks.createUser.mockReset();
    authMocks.sendVerification.mockReset();
    authMocks.setPersistence.mockReset();
    authMocks.setPersistence.mockResolvedValue(undefined);
    authMocks.signOut.mockReset();
  });

  it('uses the HuddleWay logo and branded background treatment', () => {
    render(TestedLogin);

    expect(screen.getByRole('img', { name: 'HuddleWay' })).toHaveAttribute(
      'src',
      '/logo.webp',
    );
    expect(screen.getByTestId('huddleway-background-logo')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Operations Portal' })).toBeVisible();
  });

  it('offers free self-service signup and maps raw sign-in failures safely', async () => {
    authMocks.signIn.mockRejectedValue(
      Object.assign(new Error('Firebase: user-not-found for secret@example.test'), {
        code: 'auth/user-not-found',
      }),
    );
    render(TestedLogin);
    expect(
      screen.getByRole('button', { name: 'Create free administrator account' }),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Change password' })).toBeNull();
    await fillLogin();
    await fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'Sign-in failed. Check your email and password, then try again.',
    );
    expect(alert).not.toHaveTextContent('secret@example.test');
  });

  it('creates a free account, sends verification, and signs out before setup', async () => {
    const user = { uid: 'new-owner', email: 'owner@example.test' };
    authMocks.createUser.mockResolvedValue({ user });
    authMocks.sendVerification.mockResolvedValue(undefined);
    authMocks.signOut.mockResolvedValue(undefined);

    render(TestedLogin);
    await fireEvent.click(
      screen.getByRole('button', { name: 'Create free administrator account' }),
    );
    await fireEvent.input(screen.getByLabelText('Email address'), {
      target: { value: 'owner@example.test' },
    });
    await fireEvent.input(screen.getByLabelText('Password'), {
      target: { value: 'secure-password' },
    });
    await fireEvent.input(screen.getByLabelText('Confirm password'), {
      target: { value: 'secure-password' },
    });
    await fireEvent.click(
      screen.getByRole('button', { name: 'Create free administrator account' }),
    );

    expect(authMocks.createUser).toHaveBeenCalledWith(
      {},
      'owner@example.test',
      'secure-password',
    );
    expect(authMocks.sendVerification).toHaveBeenCalledWith(user);
    expect(authMocks.signOut).toHaveBeenCalledWith({});
    expect(
      await screen.findByText(/free admin account was created/i),
    ).toBeVisible();
  });

  it('guards against a duplicate sign-in submission', async () => {
    let resolveSignIn!: () => void;
    authMocks.signIn.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveSignIn = resolve;
      }),
    );
    render(TestedLogin);
    await fillLogin();
    const submit = screen.getByRole('button', { name: 'Sign in' });
    await fireEvent.click(submit);
    await fireEvent.click(submit);
    expect(authMocks.signIn).toHaveBeenCalledTimes(1);
    expect(authMocks.setPersistence).toHaveBeenCalledWith(
      {},
      { type: 'LOCAL' },
    );
    resolveSignIn();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled(),
    );
  });

  it('keeps password-reset failures non-enumerating', async () => {
    authMocks.reset.mockRejectedValue(
      Object.assign(new Error('Firebase says account does not exist'), {
        code: 'auth/user-not-found',
      }),
    );
    render(TestedLogin);
    await fireEvent.click(
      screen.getByRole('button', { name: 'Forgot your password?' }),
    );
    await fireEvent.input(screen.getByLabelText('Email address'), {
      target: { value: 'missing@example.test' },
    });
    await fireEvent.click(
      screen.getByRole('button', { name: 'Send reset link' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The reset request could not be completed. Try again later.',
    );
  });

});
