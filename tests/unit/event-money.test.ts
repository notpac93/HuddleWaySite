import { describe, expect, it } from 'vitest';
import { eventCurrency, eventPriceCents, eventPriceLabel } from '../../src/lib/ui/eventMoney';

describe('current event money authority', () => {
  it('reads nested-only current terms and matching legacy currency without defaulting USD', () => {
    expect(eventPriceLabel({ priceCents: 1700, paymentTerms: { currency: 'usd' } })).toBe('$17.00');
    expect(eventCurrency({ currency: 'USD', paymentTerms: { currency: 'usd' } })).toBe('USD');
    expect(eventCurrency({ priceCents: 1700, paymentTerms: { currency: 'cad' } })).toBe('CAD');
    expect(eventCurrency({ currency: 'eur' })).toBe('EUR');
  });
  it('fails closed for missing, malformed and conflicting supplied currency', () => {
    for (const event of [{}, { currency: 'US dollars' }, { currency: 7 },
      { currency: 'USD', paymentTerms: { currency: 'CAD' } },
      { currency: 'bad-code', paymentTerms: { currency: 'usd' } }]) {
      expect(eventCurrency(event)).toBeNull();
      expect(eventPriceLabel({ ...event, priceCents: 1700 })).toBe('Currency unavailable');
    }
  });
  it('never turns absent or malformed price into free', () => {
    for (const priceCents of [undefined, null, '', false, true, -1, 1.2, 'invalid', Number.MAX_SAFE_INTEGER + 1]) {
      expect(eventPriceCents({ priceCents })).toBeNull();
      expect(eventPriceLabel({ priceCents, currency: 'USD' })).toBe('Price unavailable');
    }
    expect(eventPriceLabel({ priceCents: 0 })).toBe('Free');
    expect(eventPriceCents({ priceCents: '1700' })).toBe(1700);
  });
});
