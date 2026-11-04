import { registrationSectionsFromForm } from './registrationFormBuilder';
export function formStatusLabel(form: any): string {
  const value = String(form.rawStatus || form.status || '').trim().toLowerCase();
  return ['active','open'].includes(value) ? 'Open' : ['archived','closed'].includes(value) ? 'Archived' : 'Status unavailable';
}
export function activeFormQuestionCount(form: any): number | null {
  if (Array.isArray(form.sections)) return form.sections.filter((section: any) => section?.isActive !== false)
    .reduce((total: number, section: any) => total + (Array.isArray(section?.fields) ? section.fields.filter((field: any) => field?.isActive !== false).length : 0), 0);
  if (!Object.values(form.fields || {}).some(value => typeof value === 'boolean')) return null;
  return registrationSectionsFromForm(form).reduce((total, section) => total + section.fields.length, 0);
}
export function formDateLabel(form: any): string | null {
  const raw = form.updatedAt || form.dateCreated || form.createdAt;
  if (!raw) return null;
  const date = raw instanceof Date ? raw : typeof raw?.toDate === 'function' ? raw.toDate() : typeof raw === 'string' || typeof raw === 'number' ? new Date(raw) : typeof raw?.seconds === 'number' ? new Date(raw.seconds * 1000) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  return `${form.updatedAt ? 'Updated' : 'Created'} ${date.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}`;
}
