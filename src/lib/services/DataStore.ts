import { readable, derived, get, type Readable } from 'svelte/store';
import {
  collection,
  documentId,
  limit as queryLimit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../firebase';
import { tenantIdStore } from '../authStore';
import { backendClient } from '../api/backendClient';
import { BackendApiError } from '../api/BackendApi';

const COLLECTION_PROJECTION_LIMIT = 500;

interface CollectionProjection {
  records: any[];
  truncated: boolean;
  loading: boolean;
  error: string;
  permissionDenied: boolean;
}

const emptyCollectionProjection: CollectionProjection = {
  records: [],
  truncated: false,
  loading: false,
  error: '',
  permissionDenied: false,
};

function tenantCollectionProjectionStore(
  collectionName: string,
): Readable<CollectionProjection> {
  return readable<CollectionProjection>(emptyCollectionProjection, (set) => {
    let unsubscribeSnapshot = () => {};
    const unsubscribeTenant = tenantIdStore.subscribe((tenantId) => {
      unsubscribeSnapshot();
      unsubscribeSnapshot = () => {};
      set({
        ...emptyCollectionProjection,
        loading: Boolean(tenantId),
      });
      if (!tenantId) return;

      unsubscribeSnapshot = onSnapshot(
        query(
          collection(db, collectionName),
          where('tenantId', '==', tenantId),
          orderBy(documentId()),
          queryLimit(COLLECTION_PROJECTION_LIMIT + 1),
        ),
        (snapshot) => {
          set({
            records: snapshot.docs
              .slice(0, COLLECTION_PROJECTION_LIMIT)
              .map((entry) => ({ id: entry.id, ...entry.data() })),
            truncated: snapshot.docs.length > COLLECTION_PROJECTION_LIMIT,
            loading: false,
            error: '',
            permissionDenied: false,
          });
        },
        (error) => {
          console.error(`Could not load ${collectionName}.`);
          const code = String((error as { code?: unknown })?.code || '');
          const permissionDenied = code.includes('permission-denied');
          set({
            ...emptyCollectionProjection,
            error: permissionDenied
              ? `You do not have permission to view ${collectionName}.`
              : `${collectionName} could not be loaded.`,
            permissionDenied,
          });
        },
      );
    });

    return () => {
      unsubscribeSnapshot();
      unsubscribeTenant();
    };
  });
}

interface FinancialOverviewState {
  loading: boolean;
  transactions: any[];
  refunds: any[];
  invoices: any[];
  deposits: any[];
  truncated: {
    transactions: boolean;
    refunds: boolean;
    invoices: boolean;
    deposits: boolean;
  };
  requestId: string;
  lastRefreshedAt: string | null;
  error: string;
}

const emptyFinancialOverview: FinancialOverviewState = {
  loading: false,
  transactions: [],
  refunds: [],
  invoices: [],
  deposits: [],
  truncated: {
    transactions: false,
    refunds: false,
    invoices: false,
    deposits: false,
  },
  requestId: '',
  lastRefreshedAt: null,
  error: '',
};

const financialOverviewStore = readable<FinancialOverviewState>(
  emptyFinancialOverview,
  (set) => {
    let requestSequence = 0;
    const unsubscribeTenant = tenantIdStore.subscribe((tenantId) => {
      const sequence = ++requestSequence;
      set(emptyFinancialOverview);
      if (!tenantId) return;
      set({ ...emptyFinancialOverview, loading: true });

      // Processor-owned collections remain behind the authenticated backend.
      // This projection is fetched only while a mounted view subscribes to one
      // of the financial stores, rather than on every authenticated CRM load.
      void backendClient.financialOverview(tenantId).then((overview) => {
        if (sequence !== requestSequence) return;
        set({
          loading: false,
          transactions: overview.transactions,
          refunds: overview.refunds,
          invoices: overview.invoices,
          deposits: overview.deposits,
          truncated: overview.truncated,
          requestId: overview.requestId,
          lastRefreshedAt: new Date().toISOString(),
          error: '',
        });
      }).catch((error) => {
        if (sequence !== requestSequence) return;
        set({
          ...emptyFinancialOverview,
          loading: false,
          error: error instanceof BackendApiError
            ? error.message
            : 'Financial records could not be loaded. Check your connection and try again.',
        });
      });
    });

    return () => {
      requestSequence += 1;
      unsubscribeTenant();
    };
  },
);

// Each tenant collection opens a scoped listener only while a mounted view
// subscribes to it. This prevents dormant modules from consuming reads.
const registrationsProjection =
  tenantCollectionProjectionStore('registrations');
const seasonRegistrationsProjection =
  tenantCollectionProjectionStore('season_registrations');
const seasonsProjection = tenantCollectionProjectionStore('seasons');
const teamsProjection = tenantCollectionProjectionStore('teams');
const eventsProjection = tenantCollectionProjectionStore('events');

export const registrationsStore = derived(
  registrationsProjection,
  (projection) => projection.records,
);
export const seasonRegistrationsStore = derived(
  seasonRegistrationsProjection,
  (projection) => projection.records,
);
export const seasonsStore = derived(
  seasonsProjection,
  (projection) => projection.records,
);
export const teamsStore = derived(
  teamsProjection,
  (projection) => projection.records,
);
export const eventsStore = derived(
  eventsProjection,
  (projection) => projection.records,
);

function projectionState(projection: CollectionProjection) {
  return {
    limit: COLLECTION_PROJECTION_LIMIT,
    truncated: projection.truncated,
    loading: projection.loading,
    error: projection.error,
    permissionDenied: projection.permissionDenied,
  };
}

export const registrationsProjectionScope = derived(
  registrationsProjection,
  projectionState,
);
export const seasonRegistrationsProjectionScope = derived(
  seasonRegistrationsProjection,
  projectionState,
);
export const seasonsProjectionScope = derived(seasonsProjection, projectionState);
export const teamsProjectionScope = derived(teamsProjection, projectionState);
export const eventsProjectionScope = derived(eventsProjection, projectionState);
export const operationalProjectionScope = derived(
  [
    registrationsProjection,
    seasonRegistrationsProjection,
    seasonsProjection,
    teamsProjection,
    eventsProjection,
  ],
  ([
    registrations,
    seasonRegistrations,
    seasons,
    teams,
    events,
  ]) => ({
    limit: COLLECTION_PROJECTION_LIMIT,
    truncated: {
      registrations: registrations.truncated,
      seasonRegistrations: seasonRegistrations.truncated,
      seasons: seasons.truncated,
      teams: teams.truncated,
      events: events.truncated,
    },
    loading: {
      registrations: registrations.loading,
      seasonRegistrations: seasonRegistrations.loading,
      seasons: seasons.loading,
      teams: teams.loading,
      events: events.loading,
    },
    errors: {
      registrations: registrations.error,
      seasonRegistrations: seasonRegistrations.error,
      seasons: seasons.error,
      teams: teams.error,
      events: events.error,
    },
    permissionDenied: {
      registrations: registrations.permissionDenied,
      seasonRegistrations: seasonRegistrations.permissionDenied,
      seasons: seasons.permissionDenied,
      teams: teams.permissionDenied,
      events: events.permissionDenied,
    },
  }),
);

export const transactionsStore = derived(
  financialOverviewStore,
  (overview) => overview.transactions,
);
export const refundsStore = derived(
  financialOverviewStore,
  (overview) => overview.refunds,
);
export const invoicesStore = derived(
  financialOverviewStore,
  (overview) => overview.invoices,
);
export const depositsStore = derived(
  financialOverviewStore,
  (overview) => overview.deposits,
);
export const financialStoreError = derived(
  financialOverviewStore,
  (overview) => overview.error,
);
export const financialProjectionScope = derived(
  financialOverviewStore,
  (overview) => ({
    loading: overview.loading,
    truncated: overview.truncated,
    requestId: overview.requestId,
    lastRefreshedAt: overview.lastRefreshedAt,
    limitPerCollection: 500,
    error: overview.error,
  }),
);

// Derived Maps for quick lookups
export const usersMap = derived(
  registrationsStore,
  ($regs) => {
    const map: Record<string, string> = {};
    $regs.forEach(r => {
      if (r.userId) {
        const participant =
          r.participantSummary
          && typeof r.participantSummary === 'object'
            ? r.participantSummary
            : {};
        map[r.userId] =
          participant.fullName
          || participant.displayName
          || [participant.firstName, participant.lastName]
            .filter((value) => typeof value === 'string' && value.trim())
            .join(' ')
          || 'Participant name unavailable';
      }
    });
    return map;
  }
);

export const teamsMap = derived(teamsStore, $teams => {
  const map: Record<string, string> = {};
  $teams.forEach(t => { map[t.id] = t.name; });
  return map;
});

function minorUnits(value: unknown): number | null {
  const amount = Number(value);
  return Number.isSafeInteger(amount) ? amount : null;
}

function references(record: any, field: string, id: string) {
  return record?.[field] === id || record?.metadata?.[field] === id;
}

function recordCurrency(record: any): string | null {
  const raw = record?.currency || record?.metadata?.currency;
  if (typeof raw !== 'string' || !/^[A-Za-z]{3}$/.test(raw.trim())) return null;
  return raw.trim().toUpperCase();
}

function sumMinorUnits(records: any[], field: string) {
  let total = 0;
  let invalidAmountCount = 0;
  for (const record of records) {
    const amount = minorUnits(record?.[field]);
    if (amount === null) invalidAmountCount += 1;
    else total += amount;
  }
  return { total, invalidAmountCount };
}

function aggregateFinancials(
  eventIds: Set<string>,
  directScope?: { field: string; id: string },
) {
  const overview = get(financialOverviewStore);
  const matchesScope = (record: any) =>
    Array.from(eventIds).some(eventId => references(record, 'eventId', eventId))
    || Boolean(
      directScope
      && references(record, directScope.field, directScope.id),
    );
  const txns = overview.transactions.filter(matchesScope);
  const invs = overview.invoices.filter(matchesScope);
  const transactionIds = new Set(txns.map(t => t.id).filter(Boolean));
  const invoiceIds = new Set(invs.map(i => i.id).filter(Boolean));
  const refunds = overview.refunds.filter(r =>
    r.status === 'succeeded' &&
    (transactionIds.has(r.transactionId) || invoiceIds.has(r.invoiceId))
  );
  const succeededTransactions = txns.filter(t => t.status === 'succeeded');
  const failedTransactions = txns.filter(t => t.status === 'failed');
  const openInvoices = invs.filter(
    i => i.status === 'open' || i.status === 'partially_paid',
  );
  const collected = sumMinorUnits(succeededTransactions, 'grossAmount');
  const fees = sumMinorUnits(succeededTransactions, 'feeAmount');
  const refunded = sumMinorUnits(refunds, 'amountCents');
  const failed = sumMinorUnits(failedTransactions, 'grossAmount');
  const balance = sumMinorUnits(openInvoices, 'amountDue');
  const financialRecords = [...txns, ...invs, ...refunds];
  const currencies = new Set(
    financialRecords.map(recordCurrency).filter((currency): currency is string => Boolean(currency)),
  );
  const missingCurrencyCount = financialRecords.filter(
    (record) => !recordCurrency(record),
  ).length;
  const invalidAmountCount =
    collected.invalidAmountCount
    + fees.invalidAmountCount
    + refunded.invalidAmountCount
    + failed.invalidAmountCount
    + balance.invalidAmountCount;
  const isLimited =
    overview.truncated.transactions
    || overview.truncated.refunds
    || overview.truncated.invoices;
  const mixedCurrency = currencies.size > 1;
  const currency = currencies.size === 1 ? Array.from(currencies)[0] : null;
  const totalsAvailable =
    !overview.loading
    && !overview.error
    && !isLimited
    && !mixedCurrency
    && missingCurrencyCount === 0
    && invalidAmountCount === 0
    && (financialRecords.length === 0 || Boolean(currency));
  const scopeReason = overview.loading
    ? 'Financial projection is loading.'
    : overview.error
      ? 'Financial projection unavailable.'
    : isLimited
      ? 'Limited backend projection; totals are not authoritative.'
      : mixedCurrency
        ? 'Mixed currencies; totals are not combined.'
        : missingCurrencyCount > 0
          ? `${missingCurrencyCount} financial record${missingCurrencyCount === 1 ? '' : 's'} lack currency.`
          : invalidAmountCount > 0
            ? `${invalidAmountCount} malformed amount${invalidAmountCount === 1 ? '' : 's'} excluded.`
            : financialRecords.length === 0
              ? 'No matching financial records.'
              : 'Complete scoped projection.';

  return {
    totalCollected: collected.total,
    totalFees: fees.total,
    totalRefunds: refunded.total,
    failedPayments: failed.total,
    totalBalance: balance.total,
    totalsAvailable,
    isLimited,
    mixedCurrency,
    currency,
    invalidAmountCount,
    missingCurrencyCount,
    financialRecordCount: financialRecords.length,
    scopeReason,
  };
}

/**
 * Core DataStore Service class containing helper logic
 */
export class DataStore {

  static getUserFinancials(userId: string) {
    const overview = get(financialOverviewStore);
    const txns = overview.transactions.filter(t => t.userId === userId);
    const invs = overview.invoices.filter(i => i.userId === userId);
    const paid = sumMinorUnits(txns.filter(t => t.status === 'succeeded'), 'grossAmount');
    const due = sumMinorUnits(
      invs.filter(i => i.status === 'open' || i.status === 'partially_paid'),
      'amountDue',
    );
    const records = [...txns, ...invs];
    const currencies = new Set(
      records.map(recordCurrency).filter((currency): currency is string => Boolean(currency)),
    );
    const incomplete =
      overview.loading
      ||
      overview.truncated.transactions
      || overview.truncated.invoices
      || paid.invalidAmountCount > 0
      || due.invalidAmountCount > 0
      || records.some(record => !recordCurrency(record))
      || currencies.size > 1;
    const totalPaid = paid.total;
    const totalDue = due.total;

    return {
      transactions: txns,
      invoices: invs,
      totalPaid,
      totalDue,
      totalsAvailable: !incomplete,
      paymentStatus: incomplete
        ? 'Unavailable'
        : totalDue > 0
          ? 'Open Balance'
          : (totalPaid > 0 ? 'Paid' : 'No financial records')
    };
  }

  static getEventFinancials(eventId: string) {
    return aggregateFinancials(new Set([eventId]));
  }

  static getRegistrationFormFinancials(formId: string) {
    const eventProjection = get(eventsProjection);
    const eventIds = new Set(
      eventProjection.records
        .filter(event => references(event, 'registrationFormId', formId))
        .map(event => event.id)
        .filter(Boolean)
    );
    const aggregate = aggregateFinancials(eventIds);
    if (!eventProjection.truncated) return aggregate;
    return {
      ...aggregate,
      totalsAvailable: false,
      scopeReason:
        `Event linkage exceeds the ${COLLECTION_PROJECTION_LIMIT}-record loaded scope.`,
    };
  }

  static getUserFinancialsForEvents(userId: string, eventIds: Set<string>) {
    const overview = get(financialOverviewStore);
    const belongsToScope = (record: any) =>
      record?.userId === userId
      && Array.from(eventIds).some((eventId) => references(record, 'eventId', eventId));
    const txns = overview.transactions.filter(belongsToScope);
    const invs = overview.invoices.filter(belongsToScope);
    const paid = sumMinorUnits(txns.filter(t => t.status === 'succeeded'), 'grossAmount');
    const due = sumMinorUnits(
      invs.filter(i => i.status === 'open' || i.status === 'partially_paid'),
      'amountDue',
    );
    const records = [...txns, ...invs];
    const currencies = new Set(
      records.map(recordCurrency).filter((currency): currency is string => Boolean(currency)),
    );
    const incomplete =
      overview.loading
      ||
      overview.truncated.transactions
      || overview.truncated.invoices
      || paid.invalidAmountCount > 0
      || due.invalidAmountCount > 0
      || records.some(record => !recordCurrency(record))
      || currencies.size > 1;
    return {
      paymentStatus: incomplete
        ? 'Unavailable'
        : due.total > 0
          ? 'Open Balance'
          : paid.total > 0
            ? 'Paid'
            : 'No financial records',
      totalsAvailable: !incomplete,
    };
  }

  static getUserFinancialsForSeason(userId: string, seasonId: string) {
    const overview = get(financialOverviewStore);
    const eventProjection = get(eventsProjection);
    const eventIds = new Set(
      eventProjection.records
        .filter((event) => references(event, 'seasonId', seasonId))
        .map((event) => event.id)
        .filter(Boolean),
    );
    const belongsToScope = (record: any) =>
      record?.userId === userId
      && (
        references(record, 'seasonId', seasonId)
        || Array.from(eventIds).some((eventId) =>
          references(record, 'eventId', eventId)
        )
      );
    const txns = overview.transactions.filter(belongsToScope);
    const invs = overview.invoices.filter(belongsToScope);
    const paid = sumMinorUnits(
      txns.filter((transaction) => transaction.status === 'succeeded'),
      'grossAmount',
    );
    const due = sumMinorUnits(
      invs.filter((invoice) =>
        invoice.status === 'open' || invoice.status === 'partially_paid'
      ),
      'amountDue',
    );
    const records = [...txns, ...invs];
    const currencies = new Set(
      records
        .map(recordCurrency)
        .filter((currency): currency is string => Boolean(currency)),
    );
    const incomplete =
      overview.loading
      || Boolean(overview.error)
      || overview.truncated.transactions
      || overview.truncated.invoices
      || eventProjection.loading
      || Boolean(eventProjection.error)
      || eventProjection.truncated
      || paid.invalidAmountCount > 0
      || due.invalidAmountCount > 0
      || records.some((record) => !recordCurrency(record))
      || currencies.size > 1;
    return {
      paymentStatus: incomplete
        ? 'Unavailable'
        : due.total > 0
          ? 'Open Balance'
          : paid.total > 0
            ? 'Paid'
            : 'No financial records',
      totalsAvailable: !incomplete,
    };
  }

  static getEventRegistrationCount(event: any, registrations: any[]) {
    const uniqueEventUsers = new Set(
      registrations
        .filter((registration) => registration.eventId === event.id)
        .map((registration) => registration.userId || registration.id)
        .filter(Boolean),
    );
    return uniqueEventUsers.size;
  }

  static getSeasonFinancials(seasonId: string) {
    const eventProjection = get(eventsProjection);
    const eventIds = new Set(
      eventProjection.records
        .filter(event => references(event, 'seasonId', seasonId))
        .map(event => event.id)
        .filter(Boolean),
    );
    const sRegs = get(seasonRegistrationsStore).filter(r => r.seasonId === seasonId);

    const aggregate = aggregateFinancials(
      eventIds,
      { field: 'seasonId', id: seasonId },
    );
    const eventScopeIncomplete =
      eventProjection.loading
      || Boolean(eventProjection.error)
      || eventProjection.truncated;
    return {
      ...aggregate,
      totalsAvailable: aggregate.totalsAvailable && !eventScopeIncomplete,
      scopeReason: eventScopeIncomplete
        ? eventProjection.loading
          ? 'Season event linkage is loading.'
          : eventProjection.error
            ? 'Season event linkage could not be loaded.'
            : `Season event linkage exceeds the ${COLLECTION_PROJECTION_LIMIT}-record loaded scope.`
        : aggregate.scopeReason,
      participants: sRegs.length
    };
  }
}
