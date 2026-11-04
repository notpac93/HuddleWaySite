// Canonical catalog snapshot keeps this repository's tests standalone.
import catalog from '../fixtures/crm-component-definitions.json';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import ComponentLibrary from '../../src/components/crm/app-studio/ComponentLibrary.svelte';
import type { CrmComponentDefinition, CrmComponentStudioPage } from '../../src/lib/api/BackendApi';
const definitions = catalog as unknown as CrmComponentDefinition[];
const page: CrmComponentStudioPage = { id: 'home', title: 'Home', route: '/', headline: '', subheader: '', isVisible: true, status: 'published', components: [] };
describe('complete component library', () => {
  it('shows every non-hero definition and hides heroes on a hero-less page', async () => {
    render(ComponentLibrary, { definitions, page, onChoose: vi.fn(), onClose: vi.fn() });
    const body = definitions.filter(definition => definition.type !== 'hero_section');
    expect(screen.getAllByRole('button', { name: 'Preview and add' })).toHaveLength(body.length);
    for (const definition of body) expect(screen.getByRole('heading', { name: definition.label })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Home Hero' })).not.toBeInTheDocument();
    await fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'Text Block' } });
    expect(screen.getAllByRole('button', { name: 'Preview and add' })).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Text Block' })).toBeInTheDocument();
  });
});
