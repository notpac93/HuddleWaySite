import type { CrmComponentStudioPage, CrmPageComponent } from '../../../lib/api/BackendApi';

// A location is relative to a stable instance, never an index captured by a menu.
export type LayoutLocation = { beforeId: string | null };

export function insertComponent(
  page: CrmComponentStudioPage,
  component: CrmPageComponent,
  location: LayoutLocation,
): CrmPageComponent[] | null {
  if (page.components.length >= 40) return null;
  if (page.components.some((item) => item.id === component.id)) return null;
  const index = location.beforeId === null ? page.components.length
    : page.components.findIndex((item) => item.id === location.beforeId);
  if (index < 0) return null;
  if (component.type === 'hero_section') {
    if (page.components.some((item) => item.type === 'hero_section')) return null;
    return [component, ...page.components];
  }
  if (page.components[index]?.type === 'hero_section') return null;
  return [...page.components.slice(0, index), component, ...page.components.slice(index)];
}

export function moveComponentTo(
  page: CrmComponentStudioPage,
  componentId: string,
  location: LayoutLocation,
): CrmPageComponent[] | null {
  const component = page.components.find((item) => item.id === componentId);
  if (!component || component.type === 'hero_section' || location.beforeId === componentId) return null;
  const remaining = page.components.filter((item) => item.id !== componentId);
  return insertComponent({ ...page, components: remaining }, component, location);
}

export function locationLabel(page: CrmComponentStudioPage, location: LayoutLocation) {
  const index = location.beforeId === null ? page.components.length
    : page.components.findIndex((item) => item.id === location.beforeId);
  if (index < 0) return 'Choose a position';
  return index === 0 ? 'At the beginning' : `After ${page.components[index - 1].label}`;
}

export function validLocations(page: CrmComponentStudioPage) {
  return [
    ...page.components.filter((item) => item.type !== 'hero_section')
      .map((item) => ({ beforeId: item.id })),
    { beforeId: null },
  ];
}
