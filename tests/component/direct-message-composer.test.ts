import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, expect, it } from 'vitest';
import DirectMessageComposer from '../../src/components/crm/messages/DirectMessageComposer.svelte';
afterEach(cleanup);
it('establishes one recipient and exposes no participant-changing controls in the chat', async () => {
  render(DirectMessageComposer, { contacts: [{ email: 'mia@example.test', name: 'Mia Johnson' }] });
  await fireEvent.click(screen.getByRole('button', { name: /Mia Johnson/ }));
  expect(screen.getByRole('dialog', { name: 'Chat with Mia Johnson' })).toBeVisible();
  expect(screen.queryByLabelText('Recipient emails')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Add recipients|Remove Mia/ })).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Subject')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
});
it('rejects multiple addresses before establishing the conversation', async () => {
  render(DirectMessageComposer);
  await fireEvent.input(screen.getByLabelText('Recipient emails'), { target: { value: 'mia@example.test alex@example.test' } });
  expect(screen.getByRole('button', { name: 'Start chat' })).toBeDisabled();
  expect(screen.queryByRole('log')).not.toBeInTheDocument();
});
