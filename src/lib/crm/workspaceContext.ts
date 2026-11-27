import type { Readable } from 'svelte/store';

export const CRM_WORKSPACE = Symbol('CRM workspace');
export const CRM_DEFAULT_LOGO = '/logo.webp';

export interface CrmWorkspaceContext {
  available: Readable<boolean>;
  openMore: () => void;
  logo: Readable<string | null>;
}

export function useDefaultLogo(event: Event) {
  const image = event.currentTarget as HTMLImageElement;
  if (image.getAttribute('src') === CRM_DEFAULT_LOGO) return;
  image.removeAttribute('crossorigin');
  image.src = CRM_DEFAULT_LOGO;
}
