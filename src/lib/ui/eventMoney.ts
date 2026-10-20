/** Currency belongs to the current offering, never participant payment history. */
export function eventCurrency(event: any): string | null {
  const values = [event?.currency, event?.paymentTerms?.currency];
  const currencies = new Set<string>();
  for (const value of values) {
    if (value === undefined || value === null || value === '') continue;
    if (typeof value !== 'string' || !/^[A-Za-z]{3}$/.test(value.trim())) return null;
    currencies.add(value.trim().toUpperCase());
  }
  return currencies.size === 1 ? [...currencies][0] : null;
}

export function eventPriceCents(event: any): number | null {
  const raw = event?.priceCents;
  if (typeof raw !== 'number' && !(typeof raw === 'string' && /^\d+$/.test(raw.trim()))) return null;
  const cents = Number(raw);
  return Number.isSafeInteger(cents) && cents >= 0 ? cents : null;
}

export function eventPriceLabel(event: any): string {
  const cents = eventPriceCents(event);
  if (cents === null) return 'Price unavailable';
  if (cents === 0) return 'Free';
  const currency = eventCurrency(event);
  return currency
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100)
    : 'Currency unavailable';
}
