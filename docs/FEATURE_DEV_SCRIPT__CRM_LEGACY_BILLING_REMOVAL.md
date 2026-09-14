# Feature Control: CRM Legacy Billing Removal

Goal: Remove the reactivated legacy website billing UI while preserving tenant theming and the current authenticated financial operations and Payment Setup experiences.
Definition of done: Legacy billing components and their private helper/tests are absent from website `main`, CI prevents their return, current financial operations remain reachable and tenant-themed, and the parent repository points to the merged website commit.
Base commit: `b5937b702e55346cc68e400641a618ec1b519ee3`
Source of truth: `src/components/crm/FinancialOperationsWorkspace.svelte`, `src/components/crm/billing/`, `src/lib/ui/crmTheme.ts`

## Invariants

- Change only the Astro/Svelte website CRM and the parent website submodule pointer.
- Keep tenant theme tokens and semantic status colors intact.
- Keep current Payment Setup/installment components and authenticated financial summaries.
- Do not retain legacy billing code as a fallback or unreachable source.
- Merge through reviewed website and parent pull requests after release validation.

## Work

| ID | State | Owner | Task | Evidence |
| --- | --- | --- | --- | --- |
| LBR-01 | Done | Codex | Inventory the reactivated legacy billing path. | `915ed7a` restored `Financials.svelte` through the live workspace. |
| LBR-02 | Done | Codex | Remove legacy code and restore the compact operations workspace. | Four legacy source files and three component suites plus one helper suite removed; current financial summary and Payment Setup retained. |
| LBR-03 | Done | Codex | Add regression boundaries and update active inventory. | `crm-financial-launch-scope.test.ts` rejects legacy files/imports; active source inventories updated. |
| LBR-04 | Active | Codex | Run release validation and merge website PR. | Unit `233/233`, component `195/195`, and type check passed locally. |
| LBR-05 | Todo | Codex | Merge the parent submodule pointer update. | Pending. |

## Blockers

- None

## Decisions

- 2026-09-03: “Old billing” means the legacy `Financials`, `FinancialPeriodManager`, `TransactionDetails`, and private `crmFinancials` implementation; current Payment Setup remains.
- 2026-09-03: Use the authenticated `financialOverview` projection for the retained compact records workspace.

## Next Action

`LBR-04`: Complete build/release validation and merge the website pull request.
