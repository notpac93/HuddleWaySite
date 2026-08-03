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
