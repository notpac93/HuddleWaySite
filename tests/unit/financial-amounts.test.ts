import { describe, expect, it } from "vitest";
import {
  minorUnits,
  visibleFinancialTotal,
} from "../../src/lib/services/financialAmounts";
describe("exact financial amount boundaries", () => {
  it.each([null, undefined, "", " ", false, true, NaN, 1.5])(
    "does not convert missing or malformed values to zero: %j",
    (value) => {
      expect(minorUnits(value)).toBeNull();
    },
  );
  it("keeps explicit zero and safe signed minor units", () => {
    expect(minorUnits(0)).toBe(0);
    expect(minorUnits("-1500")).toBe(-1500);
  });
  it("withholds a visible total if any matching amount is unknown or overflows", () => {
    expect(
      visibleFinancialTotal([
        { amountCents: 100, currency: "USD" },
        { amountCents: null, currency: "USD" },
      ]).amount,
    ).toBeNull();
    expect(
      visibleFinancialTotal([
        { amountCents: Number.MAX_SAFE_INTEGER, currency: "USD" },
        { amountCents: 1, currency: "USD" },
      ]).amount,
    ).toBeNull();
  });
  it("never combines different currencies", () => {
    expect(
      visibleFinancialTotal([
        { amountCents: 100, currency: "USD" },
        { amountCents: 100, currency: "EUR" },
      ]),
    ).toMatchObject({ currency: null, mixedCurrency: true });
  });
});
