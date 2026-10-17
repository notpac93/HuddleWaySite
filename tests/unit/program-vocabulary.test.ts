import { describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
vi.mock('../../src/lib/authStore', async () => ({ tenantIdStore: (await import('svelte/store')).writable('yoga-owner') }));
import { tenantIdStore } from '../../src/lib/authStore';
import { programTerms, programProfileStore, programTermsStore, programTabLabel } from '../../src/lib/crm/programVocabulary';
describe('onboarding program terminology', () => {
  it.each([
    ['yoga', 'Classes'], ['pilates', 'Classes'], ['dance', 'Classes'], ['fitness', 'Classes'],
    ['personal-training', 'Sessions'], ['sports-team', 'Schedule'], ['sports-club', 'Schedule'],
    ['esports', 'Schedule'], ['camp', 'Camps'], ['educational-club', 'Activities'], ['after-school', 'Activities'], ['other', 'Events'],
  ])('uses the %s profile for the Admin destination', (profileId, title) => {
    const terms = programTerms({ catalogVersion: 1, profileId });
    expect(terms.title).toBe(title);
    expect(programTabLabel('Events', 'Events', terms)).toBe(title);
  });
  it('preserves wording overrides and never carries another tenant’s profile across a switch', () => {
    programProfileStore.set({ tenantId: 'yoga-owner', profile: { catalogVersion: 1, profileId: 'yoga', groups: 'Classes', overrides: { groups: 'Groups' } } });
    expect(get(programTermsStore).title).toBe('Classes');
    expect(get(programTermsStore).groups).toBe('Groups');
    tenantIdStore.set('basketball-owner');
    expect(get(programTermsStore).title).toBe('Events');
    programProfileStore.set({ tenantId: 'basketball-owner', profile: { catalogVersion: 1, profileId: 'sports-team' } });
    expect(get(programTermsStore).title).toBe('Schedule');
  });
  it('does not infer a program from its name or an unsupported profile', () => {
    expect(programTerms({ catalogVersion: 2, profileId: 'yoga' }).title).toBe('Events');
    expect(programTerms(null).title).toBe('Events');
  });
});
