import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import AdminQuickAccess from '../../src/components/crm/AdminQuickAccess.svelte';
import AdminMoreScreen from '../../src/components/crm/AdminMoreScreen.svelte';

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

  it('limits the More page to supplied destinations and delegates account actions', async () => {
    const onNavigate = vi.fn(), onSwitchProgram = vi.fn(), onSignOut = vi.fn();
    render(AdminMoreScreen, {
      tabs: [{ name: 'Roster', label: 'Members', icon: 'roster' }],
      programs: [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Bravo' }],
      currentProgram: 'a', onNavigate, onSwitchProgram, onSignOut,
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Financials' })).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Members' }));
    expect(onNavigate).toHaveBeenCalledWith('Roster');
    const programs = screen.getByLabelText('Switch program');
    await fireEvent.change(programs, { target: { value: 'b' } });
    expect(onSwitchProgram).toHaveBeenCalledWith('b');
    expect(programs).toHaveValue('a'); // Selection waits for the shell's guarded switch.
    await fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(onSignOut).toHaveBeenCalledOnce();
  });

  it('does not invent permissions and describes a secondary active section', () => {
    render(AdminQuickAccess, {
      tabs: [{ name: 'Tenant Operations', icon: 'tenantOperations' }],
      activeTab: 'Tenant Operations', onNavigate: vi.fn(), onMore: vi.fn(),
    });
    expect(screen.queryByRole('button', { name: 'Dashboard' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'My App' })).toBeNull();
    expect(screen.getByRole('button', { name: 'More, current section: Tenant Operations' }))
      .toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'More, current section: Tenant Operations' })).not.toHaveAttribute('aria-haspopup');
  });
});
