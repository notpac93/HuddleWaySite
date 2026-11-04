import type { RegistrationFormField, RegistrationFormSection } from './registrationFormBuilder';

export function question(id: string, label: string, type: RegistrationFormField['type'] = 'text', options: string[] | null = null): RegistrationFormField {
  return { id, label, type, options, required: true, placeholder: null, isActive: true };
}
const section = (id: string, title: string, fields: RegistrationFormField[]): RegistrationFormSection => ({ id, title, description: '', fields, isActive: true });
export function registrationPresets(ageGroups: string[] = []) {
  return [
    section('player_information', 'Player', [question('player_name', 'Player name'), question('player_dob', 'Date of birth', 'date'), question('age_group', 'Age group', 'dropdown', [...ageGroups]), question('player_gender', 'Gender', 'dropdown', ['Male', 'Female'])]),
    section('guardian_information', 'Guardian', [question('parent_name', 'Name'), question('parent_phone', 'Phone number', 'phone'), question('parent_email', 'Email', 'email')]),
    section('emergency_contact', 'Emergency', [question('emergency_name', 'Name'), question('emergency_phone', 'Phone number', 'phone'), question('emergency_email', 'Email', 'email'), question('emergency_relation', 'Relationship')]),
    section('medical_information', 'Medical', [question('medical_allergies', 'Allergies'), question('medications', 'Medications'), question('health_conditions', 'Health conditions'), question('activity_restrictions', 'Activity restrictions')]),
    section('uniform_information', 'Uniform', [question('shirt_size', 'Shirt size'), question('pants_size', 'Pants size'), question('shoe_size', 'Shoe size')]),
    section('additional_questions', 'Questions', []),
  ];
}

/** Only explicitly stored age-group values; never infer age limits from team names. */
export function previouslyUsedAgeGroups(forms: any[], teams: any[]): string[] {
  const values: string[] = [];
  for (const team of teams) if (typeof team.ageGroup === 'string') values.push(team.ageGroup);
  for (const form of forms) for (const s of form.sections || []) for (const f of s.fields || []) {
    if (f.id === 'age_group' || f.semanticKey === 'ageGroup' || f.semanticKey === 'age_group') {
      if (Array.isArray(f.options)) values.push(...f.options.filter((v: unknown): v is string => typeof v === 'string'));
    }
  }
  const seen = new Set<string>();
  return values.map(v => v.trim()).filter(v => v && !seen.has(v.toLowerCase()) && Boolean(seen.add(v.toLowerCase()))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}
export function contactSection(section: RegistrationFormSection) {
  return ['guardian_information', 'emergency_contact'].includes(section.id);
}
export function contactCount(section: RegistrationFormSection) {
  return Math.max(1, ...section.fields.map(f => Number(/^contact([2-4])_/.exec(f.id)?.[1] || 1)));
}
export function baseContactFields(section: RegistrationFormSection) {
  return section.fields.filter(f => !/^contact[2-4]_/.test(f.id));
}
export function withContactCount(section: RegistrationFormSection, count: number): RegistrationFormSection {
  const base = baseContactFields(section);
  const old = new Map(section.fields.map(f => [f.id, f]));
  const fields = [...base];
  for (let i = 2; i <= Math.min(4, Math.max(1, count)); i++) for (const f of base) {
    const id = `contact${i}_${f.id}`;
    // Preserve existing labels/settings when reopening an edited form.
    fields.push(old.get(id) || { ...f, id, label: `${section.id === 'guardian_information' ? 'Guardian' : 'Emergency contact'} ${i} · ${f.label}`, options: f.options ? [...f.options] : null });
  }
  return { ...section, fields };
}

export type RegistrationPresentationGroup = {
  id: 'participant' | 'contact' | 'details';
  title: string;
  builderTitle: string;
  sections: RegistrationFormSection[];
};
/** Mirrors the consumer app's registration_step_plan.dart without changing saved IDs. */
export function registrationPresentationGroups(sections: RegistrationFormSection[]): RegistrationPresentationGroup[] {
  const groups: RegistrationPresentationGroup[] = [
    { id: 'participant', title: 'Participant', builderTitle: 'Participant questions', sections: [] },
    { id: 'contact', title: 'Contact', builderTitle: 'Contacts', sections: [] },
    { id: 'details', title: 'Details', builderTitle: 'Details', sections: [] },
  ];
  for (const section of sections) for (const field of section.fields) {
    const semantic = (field.semanticKey || '').toLowerCase();
    const identity = `${field.id} ${field.label}`.toLowerCase();
    const sectionName = section.title.toLowerCase();
    let id: RegistrationPresentationGroup['id'];
    if (/^participant[._]/.test(semantic)) id = 'participant';
    else if (/^(guardian|contact|emergency)[._]/.test(semantic)) id = 'contact';
    else if (/parent|guardian|emergency|contact|email|phone/.test(identity)) id = 'contact';
    else if (/participant|player|youth|athlete|(^|[^a-z])(age|dob|birth|birthday|size|sizes)([^a-z]|$)/.test(identity) || /player|participant|athlete|gear|uniform/.test(sectionName)) id = 'participant';
    else if (/parent|guardian|emergency|contact/.test(sectionName)) id = 'contact';
    else id = 'details';
    const group = groups.find(g => g.id === id)!;
    let source = group.sections.find(s => s.id === section.id);
    if (!source) { source = { ...section, fields: [] }; group.sections.push(source); }
    source.fields.push(field);
  }
  return groups.filter(group => group.sections.length);
}

export function presetPresentationGroup(id: string): RegistrationPresentationGroup['id'] {
  return ['player_information', 'uniform_information'].includes(id) ? 'participant' : ['guardian_information', 'emergency_contact'].includes(id) ? 'contact' : 'details';
}
