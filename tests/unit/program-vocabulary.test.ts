import { describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
vi.mock('../../src/lib/authStore', async () => ({ tenantIdStore: (await import('svelte/store')).writable('yoga-owner') }));
import { tenantIdStore } from '../../src/lib/authStore';
import { programTerms, programProfileStore, programTermsStore, programTabLabel } from '../../src/lib/crm/programVocabulary';
describe('onboarding program terminology', () => {
  it.each([
    ['yoga', 'Schedule'], ['pilates', 'Schedule'], ['dance', 'Schedule'], ['fitness', 'Schedule'],
    ['personal-training', 'Schedule'], ['sports-team', 'Schedule'], ['sports-club', 'Schedule'],
    ['esports', 'Schedule'], ['camp', 'Schedule'], ['educational-club', 'Schedule'], ['after-school', 'Schedule'], ['other', 'Schedule'],
  ])('uses the %s profile for the Admin destination', (profileId, title) => {
    const terms = programTerms({ catalogVersion: 1, profileId });
    expect(terms.title).toBe(title);
    expect(terms.add).toBe('Add to Schedule');
    expect(programTabLabel('Events', 'Events', terms)).toBe(title);
  });
  it('preserves wording overrides and never carries another tenant’s profile across a switch', () => {
    programProfileStore.set({ tenantId: 'yoga-owner', profile: { catalogVersion: 1, profileId: 'yoga', groups: 'Classes', overrides: { groups: 'Groups' } } });
    expect(get(programTermsStore).title).toBe('Schedule');
    expect(get(programTermsStore).groups).toBe('Groups');
    tenantIdStore.set('basketball-owner');
    expect(get(programTermsStore).title).toBe('Schedule');
    programProfileStore.set({ tenantId: 'basketball-owner', profile: { catalogVersion: 1, profileId: 'sports-team' } });
    expect(get(programTermsStore).title).toBe('Schedule');
  });
  it('does not infer a program from its name or an unsupported profile', () => {
    expect(programTerms({ catalogVersion: 2, profileId: 'yoga' }).title).toBe('Schedule');
    expect(programTerms(null).title).toBe('Schedule');
  });
});
