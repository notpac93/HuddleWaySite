export type RegistrationFieldType =
  | 'text'
  | 'email'
  | 'phone'
  | 'date'
  | 'dropdown'
  | 'yes_no';

export type RegistrationFormField = {
  id: string;
  type: RegistrationFieldType;
  label: string;
  required: boolean;
  placeholder: string | null;
  options: string[] | null;
  isActive: true;
};

export type RegistrationFormSection = {
  id: string;
  title: string;
  description: string;
  fields: RegistrationFormField[];
  isActive: true;
};

const legacyFields: Record<string, RegistrationFormField> = {
  collectDob: field('player_dob', 'date', 'Date of Birth'),
  collectGender: field('player_gender', 'text', 'Gender'),
  collectShirtSize: field('shirt_size', 'dropdown', 'Shirt / Uniform Size', [
    'Youth Small', 'Youth Medium', 'Youth Large', 'Adult Small',
    'Adult Medium', 'Adult Large', 'Adult XL', 'Adult XXL',
  ]),
  collectMedicalInfo: field(
    'medical_allergies',
    'text',
    'Medical Information and Allergies',
  ),
  collectExperience: field('experience_level', 'text', 'Experience Level'),
  collectParentNames: field('parent_name', 'text', 'Parent / Guardian Name'),
  collectParentPhone: field('parent_phone', 'phone', 'Parent / Guardian Phone'),
  collectParentEmail: field('parent_email', 'email', 'Parent / Guardian Email'),
  collectEmergencyContacts: field('emergency_name', 'text', 'Emergency Contact Name'),
  collectCoachRequest: field('coach_request', 'text', 'Coach / Teammate Request'),
  collectVolunteer: field('volunteer_interest', 'yes_no', 'Interested in Volunteering'),
};

function field(
  id: string,
  type: RegistrationFieldType,
  label: string,
  options: string[] | null = null,
): RegistrationFormField {
  return {
    id,
    type,
    label,
    required: true,
    placeholder: null,
    options,
    isActive: true,
  };
}

function cloneField(value: RegistrationFormField): RegistrationFormField {
  return { ...value, options: value.options ? [...value.options] : null };
}

function enabledLegacyFields(flags: Record<string, unknown>, keys: string[]) {
  return keys.filter((key) => flags[key] === true).map((key) => cloneField(legacyFields[key]));
}

export function defaultRegistrationSections(
  flags: Record<string, unknown> = {},
): RegistrationFormSection[] {
  const player = [
    field('player_name', 'text', 'Player Name'),
    ...enabledLegacyFields(flags, [
      'collectDob', 'collectGender', 'collectShirtSize',
      'collectMedicalInfo', 'collectExperience',
    ]),
  ];
  const guardian = enabledLegacyFields(flags, [
    'collectParentNames', 'collectParentPhone', 'collectParentEmail',
  ]);
  const emergency = flags.collectEmergencyContacts === true
    ? [
        cloneField(legacyFields.collectEmergencyContacts),
        field('emergency_phone', 'phone', 'Emergency Contact Phone'),
        field('emergency_relation', 'text', 'Emergency Contact Relationship'),
      ]
    : [];
  const additional = enabledLegacyFields(flags, [
    'collectCoachRequest', 'collectVolunteer',
  ]);
  return [
    section('player_information', 'Player Information', player),
    ...(guardian.length ? [section('guardian_information', 'Parent / Guardian Information', guardian)] : []),
    ...(emergency.length ? [section('emergency_contact', 'Emergency Contact', emergency)] : []),
    ...(additional.length ? [section('additional_information', 'Additional Information', additional)] : []),
  ];
}

function section(
  id: string,
  title: string,
  fields: RegistrationFormField[],
): RegistrationFormSection {
  return { id, title, description: '', fields, isActive: true };
}

export function registrationSectionsFromForm(form: any): RegistrationFormSection[] {
  if (!Array.isArray(form?.sections) || form.sections.length === 0) {
    const defaults = form
      ? form.fields || {}
      : {
          collectParentNames: true,
          collectParentPhone: true,
          collectParentEmail: true,
          collectDob: true,
        };
    return defaultRegistrationSections(defaults);
  }
  return form.sections.map((rawSection: any, sectionIndex: number) => ({
    id: String(rawSection?.id || `section_${sectionIndex + 1}`).trim(),
    title: String(rawSection?.title || `Step ${sectionIndex + 1}`).trim(),
    description: String(rawSection?.description || '').trim(),
    isActive: true as const,
    fields: (Array.isArray(rawSection?.fields) ? rawSection.fields : []).map(
      (rawField: any, fieldIndex: number) => ({
        id: String(rawField?.id || `field_${sectionIndex + 1}_${fieldIndex + 1}`).trim(),
        type: supportedType(rawField?.type),
        label: String(rawField?.label || `Question ${fieldIndex + 1}`).trim(),
        required: rawField?.required === true,
        placeholder: String(rawField?.placeholder || '').trim() || null,
        options: Array.isArray(rawField?.options)
          ? rawField.options.map((option: unknown) => String(option || '').trim()).filter(Boolean)
          : null,
        isActive: true as const,
      }),
    ),
  }));
}

function supportedType(value: unknown): RegistrationFieldType {
  const normalized = String(value || '').trim().toLowerCase();
  return ['text', 'email', 'phone', 'date', 'dropdown', 'yes_no'].includes(normalized)
    ? normalized as RegistrationFieldType
    : 'text';
}

export function legacyFlagsFromSections(sections: RegistrationFormSection[]) {
  const ids = new Set(sections.flatMap((entry) => entry.fields.map((item) => item.id)));
  return Object.fromEntries(Object.entries(legacyFields).map(([key, value]) => [key, ids.has(value.id)]));
}

export function validateRegistrationSections(sections: RegistrationFormSection[]) {
  if (sections.length < 1 || sections.length > 12) {
    return 'A registration form must contain between 1 and 12 steps.';
  }
  const allFields = sections.flatMap((entry) => entry.fields);
  if (allFields.length < 1 || allFields.length > 50) {
    return 'A registration form must contain between 1 and 50 questions.';
  }
  if (sections.some((entry) => !entry.title.trim() || entry.fields.length === 0)) {
    return 'Every step needs a name and at least one question.';
  }
  if (allFields.some((entry) => !entry.label.trim())) {
    return 'Every question needs a label.';
  }
  const ids = allFields.map((entry) => entry.id);
  if (new Set(ids).size !== ids.length) return 'Every question needs a unique internal ID.';
  const identity = allFields.find((entry) => entry.id === 'player_name');
  if (!identity || !identity.required) {
    return 'Player Name is required so each registration can create a roster record.';
  }
  if (allFields.some((entry) => entry.type === 'dropdown' && (entry.options || []).length < 2)) {
    return 'Dropdown questions need at least two options.';
  }
  return '';
}

export function nextBuilderId(prefix: 'section' | 'field', sections: RegistrationFormSection[]) {
  const existing = new Set([
    ...sections.map((entry) => entry.id),
    ...sections.flatMap((entry) => entry.fields.map((item) => item.id)),
  ]);
  let counter = 1;
  while (existing.has(`${prefix}_${counter}`)) counter += 1;
  return `${prefix}_${counter}`;
}
