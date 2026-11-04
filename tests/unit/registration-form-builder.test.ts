import { describe, expect, it } from 'vitest';
import {
  defaultRegistrationSections,
  legacyFlagsFromSections,
  registrationSectionsFromForm,
  validateRegistrationSections,
} from '../../src/lib/registration/registrationFormBuilder';

describe('registration form builder contract', () => {
  it('converts legacy flags into editable ordered steps', () => {
    const sections = registrationSectionsFromForm({
      fields: {
        collectDob: true,
        collectParentEmail: true,
      },
    });
    expect(sections.map((section) => section.title)).toEqual([
      'Player Information',
      'Parent / Guardian Information',
    ]);
    expect(sections.flatMap((section) => section.fields.map((field) => field.id)))
      .toEqual(['player_name', 'player_dob', 'parent_email']);
    expect(validateRegistrationSections(sections)).toBe('');
  });

  it('derives backward-compatible flags from the saved step structure', () => {
    const sections = defaultRegistrationSections({
      collectDob: true,
      collectParentNames: true,
      collectVolunteer: true,
    });
    expect(legacyFlagsFromSections(sections)).toMatchObject({
      collectDob: true,
      collectParentNames: true,
      collectVolunteer: true,
      collectGender: false,
    });
  });

  it('protects roster identity and validates dropdown choices', () => {
    const sections = defaultRegistrationSections();
    sections[0].fields[0].required = false;
    expect(validateRegistrationSections(sections)).toMatch(/Player Name is required/);
    sections[0].fields[0].required = true;
    sections[0].fields.push({
      id: 'tryout_group',
      type: 'dropdown',
      label: 'Tryout Group',
      required: true,
      placeholder: null,
      options: ['Only one'],
      isActive: true,
    });
    expect(validateRegistrationSections(sections)).toMatch(/at least two options/);
  });
});

import { previouslyUsedAgeGroups, registrationPresets, withContactCount, registrationPresentationGroups } from '../../src/lib/registration/guidedFormBuilder';
describe('guided registration presets', () => {
  it('uses explicitly stored historical age groups and gender choices', () => {
    const history = previouslyUsedAgeGroups([{ sections: [{ fields: [{ id: 'age_group', options: ['14U', ' 12U ', '14u'] }] }] }], [{ name: '99U demo', ageGroup: '16U' }]);
    expect(history).toEqual(['12U', '14U', '16U']);
    expect(registrationPresets(history)[0].fields.find(f => f.id === 'player_gender')?.options).toEqual(['Male', 'Female']);
  });
  it('repeats stable unique contact ids and preserves existing labels', () => {
    const guardian = registrationPresets()[1];const expanded = withContactCount(guardian, 2);
    expect(expanded.fields).toHaveLength(6);expect(new Set(expanded.fields.map(f => f.id)).size).toBe(6);
    expanded.fields[3].label = 'Second guardian full name';
    expect(withContactCount(expanded, 2).fields[3].label).toBe('Second guardian full name');
    expect(withContactCount(expanded, 1).fields).toEqual(guardian.fields);
  });
  it('preserves privacy metadata from saved forms', () => {
    const sections = registrationSectionsFromForm({ sections: [{ id: 'player_information', title: 'Player', fields: [{ id: 'player_name', label: 'Name', type: 'text', required: true, semanticKey: 'player.name', visibility: 'restricted' }] }] });
    expect(sections[0].fields[0]).toMatchObject({ semanticKey: 'player.name', visibility: 'restricted' });
  });
});


describe('consumer registration grouping', () => {
  it('matches participant, contact, and details classification without changing saved fields', () => {
    const presets = registrationPresets(['12U','14U']);
    const sections = [presets[0], presets[1], presets[2], presets[3], presets[4], { ...presets[5], fields: [{ ...presets[0].fields[0], id: 'custom_question', label: 'Goals', required: false }] }];
    const groups = registrationPresentationGroups(sections);
    expect(groups.map(group => group.builderTitle)).toEqual(['Participant questions','Contacts','Details']);
    expect(groups[0].sections.map(s => s.id)).toEqual(['player_information','uniform_information']);
    expect(groups[1].sections.map(s => s.id)).toEqual(['guardian_information','emergency_contact']);
    expect(groups[2].sections.map(s => s.id)).toEqual(['medical_information','additional_questions']);
    expect(groups.flatMap(g => g.sections.flatMap(s => s.fields)).map(f => f.id).sort()).toEqual(sections.flatMap(s => s.fields).map(f => f.id).sort());
  });
  it('honors semantic grouping before labels and splits mixed legacy sections', () => {
    const player = registrationPresets()[0];
    const groups = registrationPresentationGroups([{...player, fields:[player.fields[0], { ...player.fields[1], id:'parent_email', label:'Email', type:'email' }, { ...player.fields[1], id:'custom_email', label:'Email', semanticKey:'participant.email' }]}]);
    expect(groups[0].sections[0].fields.map(f => f.id)).toEqual(['player_name','custom_email']);
    expect(groups[1].sections[0].fields.map(f => f.id)).toEqual(['parent_email']);
  });
});
