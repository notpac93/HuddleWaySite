import { describe, expect, it } from 'vitest';
import { restorePage, wordingLimit, pageHasEdits, connectedContentNotice } from '../../src/components/crm/app-studio/sectionEditing';
import { sectionSourcePreview } from '../../src/components/crm/app-studio/sectionSourcePreview';
import type { CrmComponentStudioPage, CrmPageComponent, CrmSectionSource } from '../../src/lib/api/BackendApi';

const hero = { id: 'hero', definitionId: 'home_hero', definitionVersion: 3, type: 'hero_section', label: 'Welcome', enabled: true, isVisible: true, status: 'published', content: { headline: 'Welcome' }, presetId: null, starterContentReviewKey: null } as CrmPageComponent;
const page = (id: string): CrmComponentStudioPage => ({ id, route: id === 'home' ? '/' : '/team-falcons', title: id, headline: '', subheader: '', status: 'published', isVisible: true, components: [{ ...hero, id: `${id}_hero` }] });

describe('continuous section editing', () => {
  it('undoes every current-page change while preserving edits on other pages and independent baseline objects', () => {
    const baseline = [page('home'), page('team')], draft = structuredClone(baseline);
    draft[0].components[0].content.headline = 'Home edit';
    draft[1].components[0].content.headline = 'Team edit';
    draft[0].components.push({ ...hero, id: 'added' });
    const restored = restorePage(draft, baseline, 'home');
    expect(restored[0]).toEqual(baseline[0]); expect(restored[1].components[0].content.headline).toBe('Team edit');
    expect(pageHasEdits(restored, baseline, 'home')).toBe(false);
    expect(pageHasEdits(restored, baseline, 'team')).toBe(true);
    restored[0].components[0].content.headline = 'Another edit';
    expect(baseline[0].components[0].content.headline).toBe('Welcome');
  });
  it('uses human wording limits and derives shared warnings from the data binding', () => {
    expect(['badgeText', 'headline', 'subheadline'].map((id) => wordingLimit(hero, { id }))).toEqual([40, 60, 120]);
    expect(connectedContentNotice({ ...hero, type: 'schedule_section' })).toContain('recurring');
    expect(connectedContentNotice(hero)).toBe('');
  });
  it('previews linked coach changes without losing assistant coaches or changing the published component', () => {
    const staff = { ...hero, id: 'staff', type: 'coach_grid', content: { profiles: [] } };
    const source: CrmSectionSource = { kind: 'team', id: 'team', label: 'Falcons', expectedVersion: 'v1', recurring: false,
      bindings: [{ pageId: 'home', componentId: 'staff' }], values: { coachName: 'Sam', coachRole: 'Head coach' },
      preview: { assistants: [{ id: 'assistant', name: 'Jordan', role: 'Assistant' }] } };
    const result = sectionSourcePreview({ id: 'home', route: '/', title: 'Home', components: [staff] }, [source]);
    expect((result.components[0].content.profiles as Array<{ name: string }>).map((item) => item.name)).toEqual(['Sam', 'Jordan']);
    expect(staff.content.profiles).toEqual([]);
  });
});
