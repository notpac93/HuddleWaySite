import { derived, writable } from 'svelte/store';
import { tenantIdStore } from '../authStore';

export type ProgramProfile = { catalogVersion?: number; profileId?: string; type?: string; group?: string; groups?: string; people?: string; staff?: string; overrides?: Record<string, string> };
export function programTerms(profile?: ProgramProfile | null) {
  const id = profile?.catalogVersion === 1 ? profile.profileId || profile.type || '' : '';
  const classes = ['yoga', 'pilates', 'dance', 'fitness'].includes(id);
  const sports = ['sports-team', 'sports-club', 'esports'].includes(id);
  const singular = classes ? 'Class' : id === 'personal-training' ? 'Session' : id === 'camp' ? 'Camp' : ['educational-club', 'after-school'].includes(id) || sports ? 'Activity' : 'Event';
  const plural = singular === 'Class' ? 'Classes' : singular === 'Activity' ? 'Activities' : `${singular}s`;
  const label = (key: 'group' | 'groups' | 'people' | 'staff', fallback: string) => id ? profile?.overrides?.[key]?.trim() || profile?.[key]?.trim() || fallback : fallback;
  const types = classes ? ['Class', 'Workshop', 'Other'] : id === 'personal-training' ? ['Session', 'Assessment', 'Other'] : id === 'esports' ? ['Practice', 'Match', 'Tournament', 'Meeting', 'Other'] : id === 'camp' ? ['Camp', 'Activity', 'Other'] : ['educational-club', 'after-school'].includes(id) ? ['Activity', 'Workshop', 'Meeting', 'Other'] : ['Practice', 'Game', 'Meeting', 'Tournament', 'Other'];
  return { types, title: sports ? 'Schedule' : plural, singular, plural, add: sports ? 'Add to schedule' : `New ${singular.toLowerCase()}`,
    group: label('group', 'Team'), groups: label('groups', 'Teams'), people: label('people', 'Roster'), staff: label('staff', 'Staff') };
}
export const programProfileStore = writable<{ tenantId: string; profile: ProgramProfile | null }>({ tenantId: '', profile: null });
export const programTermsStore = derived([tenantIdStore, programProfileStore], ([tenantId, snapshot]) => programTerms(tenantId === snapshot.tenantId ? snapshot.profile : null));
export function programTabLabel(name: string, fallback: string, terms: ReturnType<typeof programTerms>) {
  return ({ Events: terms.title, Teams: terms.group === 'Class' ? 'Class groups' : terms.groups, Roster: terms.people } as Record<string, string>)[name] || fallback;
}
