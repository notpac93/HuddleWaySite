import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, expect, it } from 'vitest';
import SentMessageList from '../../src/components/crm/messages/SentMessageList.svelte';
afterEach(cleanup);
it('filters a shared sent list by channel and searches the selected type', async () => {
  render(SentMessageList, { items: [
    { id: 'email', kind: 'email', subject: 'Practice reminder', body: 'Bring water', createdAt: '2026-11-03T10:00:00Z', status: 'Sent' },
    { id: 'direct', kind: 'direct', subject: 'Mia Johnson', body: 'See you at six', createdAt: '2026-11-03T09:00:00Z', status: 'In app' },
    { id: 'post', kind: 'announcement', subject: 'Game update', body: 'Field two', createdAt: '2026-11-03T08:00:00Z', status: 'Published', sourceId: 'post' },
  ] });
  const filters = screen.getByRole('group', { name: 'Message type' });
  expect(screen.getAllByRole('listitem')).toHaveLength(3);
  await fireEvent.click(within(filters).getByRole('button', { name: 'Email' }));
  expect(screen.getAllByRole('listitem')).toHaveLength(1);
  expect(screen.getByText('Practice reminder')).toBeVisible();
  await fireEvent.click(within(filters).getByRole('button', { name: 'Messages' }));
  await fireEvent.click(screen.getByRole('button', { name: /Mia Johnson/ }));
  expect(screen.queryByRole('button', { name: 'Edit announcement' })).not.toBeInTheDocument();
  await fireEvent.click(screen.getByRole('button', { name: 'Search sent messages' }));
  await fireEvent.input(screen.getByRole('searchbox', { name: 'Search sent messages' }), { target: { value: 'Game update' } });
  expect(screen.getByText('No matches')).toBeVisible();
});
