import type {
  FinancialOverview,
  FinancialOperationView,
  FinancialOperationRow,
} from "./BackendApi";

type AccountingPage = {
  snapshotId: string;
  cursor: number;
  nextCursor: number | null;
  candidateCount: number;
};
type OverviewPage = FinancialOverview & { accountingPage?: AccountingPage };
const knownAmount = (value: unknown) =>
  value !== null &&
  value !== undefined &&
  value !== "" &&
  Number.isSafeInteger(value);

function identity(row: Record<string, unknown>) {
  return JSON.stringify(
    [
      "id",
      "tenantId",
      "paymentProvider",
      "paymentIntentId",
      "providerPaymentId",
      "createdAt",
      "updatedAt",
    ].map((key) => row[key] ?? null),
  );
}

export async function loadFinancialOverview(
  fetchPage: (query: Record<string, string | number>) => Promise<OverviewPage>,
  tenantId: string,
  invalid: (payload?: Record<string, unknown>) => never,
): Promise<FinancialOverview> {
  let cursor = 0;
  let snapshot = "";
  let first: OverviewPage | null = null;
  let originalRows = new Map<string, Record<string, unknown>>();
  const mergedRows = new Map<string, Record<string, unknown>>();
  const mergedViews = new Map<
    FinancialOperationView,
    Map<string, FinancialOperationRow>
  >();
  const accounting = {
    attempted: 0,
    resolved: 0,
    failed: 0,
    skipped: 0,
    complete: true,
  };
  for (let pageNumber = 0; pageNumber < 160; pageNumber += 1) {
    const payload = await fetchPage({
      tenantId,
      ...(cursor
        ? { accountingCursor: cursor, accountingSnapshot: snapshot }
        : {}),
    });
    if (!payload || typeof payload !== "object") invalid({});
    if (payload.tenantId !== tenantId)
      invalid(payload as unknown as Record<string, unknown>);
    if (
      !Array.isArray(payload.transactions) ||
      !Array.isArray(payload.refunds) ||
      !Array.isArray(payload.invoices) ||
      !Array.isArray(payload.deposits) ||
      !payload.recordCounts ||
      typeof payload.recordCounts !== "object" ||
      Object.values(payload.recordCounts).some(
        (count) => !Number.isSafeInteger(count) || count < 0,
      ) ||
      !payload.tracking ||
      typeof payload.tracking !== "object" ||
      typeof payload.tracking.complete !== "boolean" ||
      !Number.isSafeInteger(payload.tracking.unreconciledTransactionCount) ||
      !Number.isSafeInteger(payload.tracking.unreconciledDepositCount) ||
      !Array.isArray(payload.tracking.sourceCollections) ||
      !payload.truncated ||
      typeof payload.truncated !== "object" ||
      Object.values(payload.truncated).some(
        (truncated) => typeof truncated !== "boolean",
      ) ||
      typeof payload.complete !== "boolean" ||
      !payload.operations ||
      typeof payload.operations !== "object" ||
      typeof payload.operations.complete !== "boolean" ||
      !payload.operations.reconciliation ||
      typeof payload.operations.reconciliation.complete !== "boolean" ||
      (
        [
          "unreconciledTransactionCount",
          "unreconciledDepositCount",
          "currencyIntegrityErrorCount",
        ] as const
      ).some(
        (key) =>
          !Number.isSafeInteger(payload.operations.reconciliation[key]) ||
          payload.operations.reconciliation[key] < 0,
      ) ||
      !payload.operations.views ||
      (
        [
          "deposits",
          "transactions",
          "scheduled",
          "overdue",
          "invoices",
        ] as const
      ).some((view) => !Array.isArray(payload.operations.views[view])) ||
      !String(payload.requestId || "").trim()
    ) {
      invalid(payload as unknown as Record<string, unknown>);
    }
    const page = payload.accountingPage;
    if (snapshot && !page)
      invalid(payload as unknown as Record<string, unknown>);
    if (!first) {
      first = payload;
      originalRows = new Map(
        payload.transactions.map((row) => [String(row.id), { ...row }]),
      );
      if (originalRows.size !== payload.transactions.length)
        invalid(payload as unknown as Record<string, unknown>);
      payload.transactions.forEach((row) =>
        mergedRows.set(String(row.id), { ...row }),
      );
    } else if (
      payload.transactions.length !== originalRows.size ||
      payload.transactions.some((row) => {
        const original = originalRows.get(String(row.id));
        return (
          !original ||
          identity(original) !== identity(row) ||
          ["grossAmount", "currency", "processorAccountId"].some(
            (key) =>
              original[key] !== null &&
              original[key] !== undefined &&
              row[key] !== null &&
              row[key] !== undefined &&
              original[key] !== row[key],
          )
        );
      })
    )
      invalid(payload as unknown as Record<string, unknown>);
    if (
      page &&
      (!/^[a-f0-9]{64}$/.test(page.snapshotId) ||
        page.cursor !== cursor ||
        !Number.isSafeInteger(page.candidateCount) ||
        page.candidateCount < 0 ||
        page.candidateCount > 4000 ||
        (first.accountingPage &&
          first.accountingPage.candidateCount !== page.candidateCount) ||
        (snapshot && page.snapshotId !== snapshot) ||
        (page.nextCursor !== null &&
          (!Number.isSafeInteger(page.nextCursor) ||
            page.nextCursor <= cursor ||
            page.nextCursor >= page.candidateCount)))
    )
      invalid(payload as unknown as Record<string, unknown>);
    for (const row of payload.transactions) {
      if (
        knownAmount(row.grossAmount) &&
        knownAmount(row.feeAmount) &&
        knownAmount(row.netAmount) &&
        Number(row.grossAmount) - Number(row.feeAmount) === row.netAmount
      )
        mergedRows.set(String(row.id), { ...row });
    }
    for (const view of [
      "deposits",
      "transactions",
      "scheduled",
      "overdue",
      "invoices",
    ] as const) {
      const rows = payload.operations.views[view];
      const existing = mergedViews.get(view);
      if (!existing) {
        const indexed = new Map(rows.map((row) => [row.key, { ...row }]));
        if (indexed.size !== rows.length)
          invalid(payload as unknown as Record<string, unknown>);
        mergedViews.set(view, indexed);
        continue;
      }
      if (rows.length !== existing.size)
        invalid(payload as unknown as Record<string, unknown>);
      for (const row of rows) {
        const previous = existing.get(row.key);
        if (
          !previous ||
          [
            "kind",
            "label",
            "context",
            "status",
            "statusLabel",
            "date",
            "dateLabel",
            "detail",
          ].some(
            (key) =>
              previous[key as keyof FinancialOperationRow] !==
              row[key as keyof FinancialOperationRow],
          ) ||
          (knownAmount(previous.amountCents) &&
            knownAmount(row.amountCents) &&
            previous.amountCents !== row.amountCents) ||
          (previous.currency &&
            row.currency &&
            previous.currency !== row.currency)
        )
          invalid(payload as unknown as Record<string, unknown>);
        if (knownAmount(row.amountCents) && row.currency)
          existing.set(row.key, { ...row });
      }
    }
    const progress = payload.tracking.providerAccounting;
    if (progress) {
      for (const key of [
        "attempted",
        "resolved",
        "failed",
        "skipped",
      ] as const) {
        if (!Number.isSafeInteger(progress[key]) || progress[key] < 0)
          invalid(payload as unknown as Record<string, unknown>);
      }
      accounting.attempted += progress.attempted;
      accounting.resolved += progress.resolved;
      accounting.failed += progress.failed;
    }
    if (!page || page.nextCursor === null) {
      const transactions = [...mergedRows.values()];
      const unreconciledTransactionCount = transactions.filter(
        (row) =>
          row.status === "succeeded" &&
          (!knownAmount(row.grossAmount) ||
            !knownAmount(row.feeAmount) ||
            !knownAmount(row.netAmount) ||
            Number(row.grossAmount) - Number(row.feeAmount) !== row.netAmount),
      ).length;
      const currencyIntegrityErrorCount = [
        ...transactions,
        ...payload.refunds,
        ...payload.invoices,
        ...payload.deposits,
      ].filter(
        (row) =>
          typeof row.currency !== "string" || !/^[A-Z]{3}$/.test(row.currency),
      ).length;
      const tracking = {
        ...payload.tracking,
        unreconciledTransactionCount,
        ...(payload.tracking.currencyIntegrityErrorCount === undefined
          ? {}
          : { currencyIntegrityErrorCount }),
      };
      tracking.complete =
        unreconciledTransactionCount === 0 &&
        tracking.unreconciledDepositCount === 0 &&
        currencyIntegrityErrorCount === 0;
      if (progress)
        tracking.providerAccounting = {
          ...accounting,
          complete: accounting.failed === 0,
        };
      return {
        ...payload,
        transactions,
        tracking,
        operations: {
          ...payload.operations,
          views: Object.fromEntries(
            [...mergedViews].map(([view, rows]) => [view, [...rows.values()]]),
          ) as FinancialOverview["operations"]["views"],
          reconciliation: {
            ...payload.operations.reconciliation,
            complete: tracking.complete,
            unreconciledTransactionCount,
            currencyIntegrityErrorCount,
          },
        },
      };
    }
    snapshot = page.snapshotId;
    cursor = page.nextCursor;
  }
  return invalid(first as unknown as Record<string, unknown>);
}
