export type AttachmentScope = 'all' | 'team' | 'event' | 'season';
export type AnnouncementImportance = 'routine' | 'standard' | 'featured' | 'urgent';

export const announcementImportanceOptions: Array<{
  value: AnnouncementImportance;
  label: string;
  detail: string;
}> = [
  { value: 'routine', label: 'Routine', detail: 'No color' },
  { value: 'standard', label: 'Standard', detail: 'Team color' },
  { value: 'featured', label: 'Featured', detail: 'Strong highlight' },
  { value: 'urgent', label: 'Urgent', detail: 'Red alert' },
];

export function normalizeAnnouncementImportance(
  value: unknown,
  title: unknown = '',
): AnnouncementImportance {
  const explicit = String(value || '').trim().toLowerCase();
  if (['routine', 'standard', 'featured', 'urgent'].includes(explicit)) {
    return explicit as AnnouncementImportance;
  }

  const text = String(title || '').toLowerCase();
  if (/cancel|urgent|emergency|weather|closed|moved/.test(text)) return 'urgent';
  if (/tournament|championship|playoff|showcase|tryout|registration/.test(text)) return 'featured';
  if (/practice|training|workout|rehearsal/.test(text)) return 'routine';
  return 'standard';
}
