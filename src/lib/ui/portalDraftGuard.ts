import { writable } from 'svelte/store';

export type PortalDraftRegistration = {
  id: string;
  title: string;
  message: string;
  retainLabel?: string;
  onDiscard: () => void | Promise<void>;
  onRetain?: () => void | Promise<void>;
};

export const portalDraftStore = writable<PortalDraftRegistration | null>(null);

export function registerPortalDraft(draft: PortalDraftRegistration) {
  portalDraftStore.set(draft);
}

export function clearPortalDraft(id: string) {
  portalDraftStore.update((current) => current?.id === id ? null : current);
}
