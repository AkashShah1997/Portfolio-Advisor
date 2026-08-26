import type { YearFinancials } from "./types";

/**
 * Pure fundamentals mappers (no network, no server-only imports) - shared by
 * the Yahoo data layer and the test suite.
 */

export type AnyRow = Record<string, unknown>;

export function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v && typeof v === "object" && "raw" in (v as AnyRow)) {
    const raw = (v as AnyRow).raw;
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  }
  return undefined;
}

export function mapYearRow(row: AnyRow): YearFinancials {
  const date = row.date instanceof Date ? row.date : new Date(String(row.date));
  const ocf = num(row.annualOperatingCashFlow);
  const capexRaw = num(row.annualCapitalExpenditure);
  let fcf = num(row.annualFreeCashFlow);
  if (fcf === undefined && ocf !== undefined && capexRaw !== undefined) {
    // Yahoo reports capex as a negative outflow; be tolerant of either sign.
    fcf = capexRaw <= 0 ? ocf + capexRaw : ocf - capexRaw;
  }
  const pretax = num(row.annualPretaxIncome);
  const interest = num(row.annualInterestExpense) ?? num(row.annualInterestExpenseNonOperating);
  let ebit = num(row.annualEBIT);
  if (ebit === undefined && pretax !== undefined && interest !== undefined) ebit = pretax + interest;
  if (ebit === undefined) ebit = num(row.annualOperatingIncome);

  return {
    year: date.getUTCFullYear(),
    endDate: date.toISOString().slice(0, 10),
    revenue: num(row.annualTotalRevenue),
    grossProfit: num(row.annualGrossProfit),
    operatingIncome: num(row.annualOperatingIncome),
    ebit,
    pretaxIncome: pretax,
    netIncome: num(row.annualNetIncome) ?? num(row.annualNetIncomeCommonStockholders),
    interestExpense: interest,
    equity: num(row.annualStockholdersEquity) ?? num(row.annualTotalEquityGrossMinorityInterest),
    totalDebt: num(row.annualTotalDebt),
    totalAssets: num(row.annualTotalAssets),
    currentAssets: num(row.annualCurrentAssets),
    currentLiabilities: num(row.annualCurrentLiabilities),
    cash: num(row.annualCashAndCashEquivalents),
    fcf,
    ocf,
    capex: capexRaw,
    dilutedEPS: num(row.annualDilutedEPS),
    basicEPS: num(row.annualBasicEPS),
    shares: num(row.annualOrdinarySharesNumber) ?? num(row.annualDilutedAverageShares),
  };
}

/** Merge fundamentals rows that share a fiscal year (sources can emit partial rows). */
export function mergeYears(rows: YearFinancials[]): YearFinancials[] {
  const byKey = new Map<string, YearFinancials>();
  for (const r of rows) {
    const key = r.endDate;
    const prev = byKey.get(key);
    if (!prev) byKey.set(key, { ...r });
    else {
      const merged: AnyRow = { ...prev };
      for (const [k, v] of Object.entries(r)) {
        if (v !== undefined && (merged[k] === undefined || merged[k] === null)) merged[k] = v;
      }
      byKey.set(key, merged as unknown as YearFinancials);
    }
  }
  return [...byKey.values()].sort((a, b) => a.endDate.localeCompare(b.endDate));
}

export const hasSubstance = (y: YearFinancials): boolean =>
  y.revenue !== undefined || y.netIncome !== undefined || y.totalAssets !== undefined;

/** The 23 timeseries fields the scorecard actually uses - keeps the URL tiny. */
export const TS_KEYS = [
  "annualTotalRevenue",
  "annualGrossProfit",
  "annualOperatingIncome",
  "annualEBIT",
  "annualPretaxIncome",
  "annualNetIncome",
  "annualNetIncomeCommonStockholders",
  "annualInterestExpense",
  "annualInterestExpenseNonOperating",
  "annualStockholdersEquity",
  "annualTotalEquityGrossMinorityInterest",
  "annualTotalDebt",
  "annualTotalAssets",
  "annualCurrentAssets",
  "annualCurrentLiabilities",
  "annualCashAndCashEquivalents",
  "annualFreeCashFlow",
  "annualOperatingCashFlow",
  "annualCapitalExpenditure",
  "annualDilutedEPS",
  "annualBasicEPS",
  "annualOrdinarySharesNumber",
  "annualDilutedAverageShares",
] as const;

interface TsEntry {
  meta?: { type?: string[] };
  timestamp?: number[];
  [key: string]: unknown;
}

/** Pure parser for Yahoo's fundamentals-timeseries payload. */
export function parseTimeseries(json: unknown): YearFinancials[] {
  const results = (json as { timeseries?: { result?: TsEntry[] } })?.timeseries?.result;
  if (!Array.isArray(results)) return [];
  const byDate = new Map<string, AnyRow>();
  for (const entry of results) {
    const key = entry?.meta?.type?.[0];
    if (!key) continue;
    const values = entry[key];
    if (!Array.isArray(values)) continue;
    for (const v of values) {
      const asOf = (v as { asOfDate?: string } | null)?.asOfDate;
      const raw = (v as { reportedValue?: { raw?: number } } | null)?.reportedValue?.raw;
      if (!asOf || typeof raw !== "number" || !Number.isFinite(raw)) continue;
      const row = byDate.get(asOf) ?? { date: asOf };
      row[key] = raw;
      byDate.set(asOf, row);
    }
  }
  return mergeYears([...byDate.values()].map(mapYearRow)).filter(hasSubstance);
}

/** Pure mapper for quoteSummary statement-history modules (4y fallback). */
export function mapStatementHistory(qs: {
  incomeStatementHistory?: { incomeStatementHistory?: AnyRow[] };
  balanceSheetHistory?: { balanceSheetStatements?: AnyRow[] };
  cashflowStatementHistory?: { cashflowStatements?: AnyRow[] };
}): YearFinancials[] {
  const rows: YearFinancials[] = [];
  const dateOf = (r: AnyRow): string | undefined => {
    const d = r.endDate;
    if (d instanceof Date) return d.toISOString().slice(0, 10);
    if (typeof d === "string") return d.slice(0, 10);
    if (typeof d === "number") return new Date(d * 1000).toISOString().slice(0, 10);
    const raw = (d as { raw?: number } | undefined)?.raw;
    return raw ? new Date(raw * 1000).toISOString().slice(0, 10) : undefined;
  };
  for (const r of qs.incomeStatementHistory?.incomeStatementHistory ?? []) {
    const endDate = dateOf(r);
    if (!endDate) continue;
    const ie = num(r.interestExpense);
    rows.push(
      mapYearRow({
        date: endDate,
        annualTotalRevenue: num(r.totalRevenue),
        annualGrossProfit: num(r.grossProfit),
        annualOperatingIncome: num(r.operatingIncome),
        annualEBIT: num(r.ebit),
        annualPretaxIncome: num(r.incomeBeforeTax),
        annualNetIncome: num(r.netIncome),
        annualInterestExpense: ie !== undefined ? Math.abs(ie) : undefined,
      })
    );
  }
  for (const r of qs.balanceSheetHistory?.balanceSheetStatements ?? []) {
    const endDate = dateOf(r);
    if (!endDate) continue;
    const shortDebt = num(r.shortLongTermDebt) ?? 0;
    const longDebt = num(r.longTermDebt) ?? 0;
    rows.push(
      mapYearRow({
        date: endDate,
        annualStockholdersEquity: num(r.totalStockholderEquity),
        annualTotalDebt: shortDebt + longDebt > 0 ? shortDebt + longDebt : undefined,
        annualTotalAssets: num(r.totalAssets),
        annualCurrentAssets: num(r.totalCurrentAssets),
        annualCurrentLiabilities: num(r.totalCurrentLiabilities),
        annualCashAndCashEquivalents: num(r.cash),
      })
    );
  }
  for (const r of qs.cashflowStatementHistory?.cashflowStatements ?? []) {
    const endDate = dateOf(r);
    if (!endDate) continue;
    rows.push(
      mapYearRow({
        date: endDate,
        annualOperatingCashFlow: num(r.totalCashFromOperatingActivities),
        annualCapitalExpenditure: num(r.capitalExpenditures),
      })
    );
  }
  return mergeYears(rows).filter(hasSubstance);
}
