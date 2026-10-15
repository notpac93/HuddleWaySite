import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import AdminQuickAccess from '../../src/components/crm/AdminQuickAccess.svelte';

describe('post-login admin quick access', () => {
  it('keeps the selected order and passes navigation to the existing shell', async () => {
    const onNavigate = vi.fn();
    const onMore = vi.fn();
    render(AdminQuickAccess, {
      tabs: [
        { name: 'My App', icon: 'myApp' },
        { name: 'Staff', icon: 'staff' },
        { name: 'Messages', icon: 'messages' },
        { name: 'Events', icon: 'events' },
        { name: 'Dashboard', icon: 'dashboard' },
      ],
      activeTab: 'Events', onNavigate, onMore,
    });
    const nav = within(screen.getByRole('navigation', { name: 'Admin quick access' }));
    expect(nav.getAllByRole('button').map((button) => button.textContent?.trim()))
      .toEqual(['Dashboard', 'Events', 'Messages', 'My App', 'More']);
    expect(nav.getByRole('button', { name: 'Events' })).toHaveAttribute('aria-current', 'page');
    await fireEvent.click(nav.getByRole('button', { name: 'My App' }));
    expect(onNavigate).toHaveBeenCalledWith('My App');
    const more = nav.getByRole('button', { name: 'More' });
    await fireEvent.click(more);
    expect(onMore).toHaveBeenCalledWith(more);
  });

  it('does not invent permissions and describes a secondary active section', () => {
    render(AdminQuickAccess, {
      tabs: [{ name: 'Tenant Operations', icon: 'tenantOperations' }],
      activeTab: 'Tenant Operations', onNavigate: vi.fn(), onMore: vi.fn(),
    });
    expect(screen.queryByRole('button', { name: 'Dashboard' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'My App' })).toBeNull();
    expect(screen.getByRole('button', { name: 'More, current section: Tenant Operations' }))
      .toHaveAttribute('aria-expanded', 'false');
  });
});
