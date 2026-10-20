export function minorUnits(value: unknown): number | null {
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    String(value).trim() === ""
  )
    return null;
  const amount = Number(value);
  return Number.isSafeInteger(amount) ? amount : null;
}

export function visibleFinancialTotal(
  rows: Array<{ amountCents: number | null; currency: string | null }>,
) {
  const currencies = new Set(rows.map((row) => row.currency));
  const currency =
    rows.length === 0 ? "USD" : currencies.size === 1 ? rows[0].currency : null;
  let amount: number | null = 0;
  for (const row of rows) {
    const next = minorUnits(row.amountCents);
    if (
      next === null ||
      amount === null ||
      !Number.isSafeInteger(amount + next)
    )
      amount = null;
    else amount += next;
  }
  return { amount, currency, mixedCurrency: currencies.size > 1 };
}
