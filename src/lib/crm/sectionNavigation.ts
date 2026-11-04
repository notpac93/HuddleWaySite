import type { Readable } from 'svelte/store';

export const SECTION_NAVIGATION = Symbol('admin-section-navigation');
export interface SectionNavigation {
  available: Readable<boolean>;
  openMore: () => void;
}
