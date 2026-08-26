import Papa from "papaparse";
import type { Broker, Holding, SecurityType } from "./types";
import { currencyForSymbol, guessYahooSymbol } from "./symbols";

/**
 * Broker CSV parsing with auto-detection.
 *
 * Zerodha Console "Holdings" export (CSV/XLSX->CSV) typically has columns like:
 *   Symbol, ISIN, Sector, Quantity Available, Quantity Discrepant, Quantity Long Term,
 *   Quantity Pledged (Margin), Quantity Pledged (Loan), Average Price,
 *   Previous Closing Price, Unrealized P&L, Unrealized P&L Pct.
 * ...sometimes preceded by a few preamble/title rows.
 *
 * Wealthsimple exports vary by surface; commonly:
 *   Symbol, Name, Quantity, Average cost / Book cost / Avg price, Market value, Currency
 *
 * Strategy: parse without headers, scan the first ~25 rows for the header row
 * (a row containing both a symbol-like and a quantity-like cell), then map columns
 * by fuzzy header match. Anything unmapped is surfaced so the user can fix rows inline.
 */

const SYMBOL_RE = /^(symbol|instrument|ticker|scrip|stock|security|name of (the )?instrument)$/i;
const SYMBOL_LOOSE_RE = /symbol|instrument|ticker|scrip/i;
const QTY_RE = /^(qty|quantity|quantity available|shares|units|qty\.?|total quantity)$/i;
const QTY_LOOSE_RE = /qty|quantity|shares|units/i;
const AVG_RE = /avg\.?\s*(cost|price)?|average\s*(cost|price)?|price paid|buy price|purchase price/i;
const TOTAL_COST_RE = /book\s*(cost|value)|total\s*cost|cost\s*basis/i;
const NAME_RE = /^name$|company|description|security name/i;
const CURRENCY_RE = /currency|ccy/i;
const ISIN_RE = /isin/i;
const SECTOR_RE = /sector/i;
const SECTYPE_RE = /security\s*type|instrument\s*type|asset\s*(type|class)|^type$/i;
const ACCOUNT_RE = /account/i;

/** Normalize a broker's "Security Type" cell (EXCHANGE_TRADED_FUND, Equity, Cash…). */
export function normalizeSecurityType(raw: string | undefined): SecurityType | undefined {
  if (!raw) return undefined;
  const s = raw.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (!s) return undefined;
  if (/EXCHANGE_TRADED|^ETF$|^ETP$/.test(s)) return "ETF";
  if (/^EQUIT|COMMON_STOCK|^STOCK$|^SHARE/.test(s)) return "EQUITY";
  if (/CURRENCY|^CASH$|^FX$|MONEY_MARKET/.test(s)) return "CURRENCY";
  if (/MUTUAL_FUND|^FUND$|INDEX_FUND/.test(s)) return "FUND";
  return "OTHER";
}

export interface ParseResult {
  holdings: Holding[];
  warnings: string[];
  detectedBroker: Broker;
  headerRow?: string[];
}

function toNumber(v: unknown): number | undefined {
  if (v === null || v === undefined) return undefined;
  const s = String(v).replace(/[",₹$C]/g, "").replace(/\s/g, "");
  if (s === "" || s === "-" || s === "--") return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

let idCounter = 0;
export function nextId(): string {
  idCounter += 1;
  return `h${Date.now().toString(36)}${idCounter}`;
}

export function parseBrokerCsv(csvText: string, brokerHint?: Broker): ParseResult {
  const warnings: string[] = [];
  const parsed = Papa.parse<string[]>(csvText, { skipEmptyLines: "greedy" });
  const rows = (parsed.data as unknown as string[][]).filter((r) => Array.isArray(r));
  if (!rows.length) {
    return { holdings: [], warnings: ["File appears to be empty."], detectedBroker: brokerHint ?? "manual" };
  }

  // ---- locate header row ----
  let headerIdx = -1;
  let symCol = -1;
  let qtyCol = -1;
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const row = rows[i].map((c) => String(c ?? "").trim());
    let s = row.findIndex((c) => SYMBOL_RE.test(c));
    if (s === -1) s = row.findIndex((c) => SYMBOL_LOOSE_RE.test(c) && !/type/i.test(c) && c.length < 40);
    let q = row.findIndex((c) => QTY_RE.test(c));
    if (q === -1) q = row.findIndex((c) => QTY_LOOSE_RE.test(c) && !/pledged|discrepant|long term/i.test(c));
    if (s !== -1 && q !== -1) {
      headerIdx = i;
      symCol = s;
      qtyCol = q;
      break;
    }
  }

  if (headerIdx === -1) {
    return {
      holdings: [],
      warnings: [
        "Couldn't find a header row with Symbol + Quantity columns. Use manual entry, or re-export the holdings file from your broker.",
      ],
      detectedBroker: brokerHint ?? "manual",
    };
  }

  const header = rows[headerIdx].map((c) => String(c ?? "").trim());

  // ---- detect broker ----
  let broker: Broker = brokerHint ?? "manual";
  const headerJoined = header.join("|").toLowerCase();
  if (!brokerHint) {
    if (headerJoined.includes("isin") || /quantity available|unrealized/i.test(headerJoined)) broker = "zerodha";
    else if (/book cost|market value|account/i.test(headerJoined)) broker = "wealthsimple";
    else broker = "manual";
  }

  // ---- map remaining columns ----
  // Prefer "Quantity Available" for Zerodha over pledged/discrepant variants (already ensured by loose filter).
  const avgCol = header.findIndex((c) => AVG_RE.test(c) && !/unreali[sz]ed|market|total|book/i.test(c));
  // Wealthsimple-style TOTAL cost columns ("Book Cost") → divide by qty later.
  const totalCostCol = header.findIndex((c) => TOTAL_COST_RE.test(c) && !/unreali[sz]ed|market/i.test(c));
  const nameCol = header.findIndex((c) => NAME_RE.test(c) && !SYMBOL_LOOSE_RE.test(c) && !ACCOUNT_RE.test(c));
  const ccyCol = header.findIndex((c) => CURRENCY_RE.test(c) && !SECTYPE_RE.test(c));
  const secTypeCol = header.findIndex((c) => SECTYPE_RE.test(c));
  const accountCol = header.findIndex((c) => ACCOUNT_RE.test(c) && !NAME_RE.test(c));
  const isinCol = header.findIndex((c) => ISIN_RE.test(c));
  const sectorCol = header.findIndex((c) => SECTOR_RE.test(c));
  void isinCol;
  void sectorCol;

  if (avgCol === -1 && totalCostCol === -1) {
    warnings.push(
      "No average-cost column detected - invested amounts and P&L will be unavailable until you fill Avg Cost in the table."
    );
  }

  const rawHoldings: Holding[] = [];
  let cashRows = 0;
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const raw = String(row[symCol] ?? "").trim();
    if (!raw) continue;
    // skip totals/footer rows
    if (/^total|^grand total|^\d+ items?/i.test(raw)) continue;

    const secType = secTypeCol !== -1 ? normalizeSecurityType(String(row[secTypeCol] ?? "")) : undefined;
    // cash balances (Security Type = CURRENCY, or bare CAD/USD/INR symbols) are money, not holdings
    if (secType === "CURRENCY" || (secTypeCol === -1 && /^(CAD|USD|INR)$/i.test(raw))) {
      cashRows++;
      continue;
    }

    const qty = toNumber(row[qtyCol]);
    if (qty === undefined || qty === 0) continue;

    let avg = avgCol !== -1 ? toNumber(row[avgCol]) : undefined;
    if (avg === undefined && totalCostCol !== -1) {
      const total = toNumber(row[totalCostCol]);
      if (total !== undefined && qty > 0) avg = total / qty;
    }
    const ccyHint = ccyCol !== -1 ? String(row[ccyCol] ?? "") : undefined;
    const yahooSymbol = guessYahooSymbol(raw, broker === "manual" ? "wealthsimple" : broker, ccyHint);

    rawHoldings.push({
      id: nextId(),
      broker,
      rawSymbol: raw,
      yahooSymbol,
      name: nameCol !== -1 ? String(row[nameCol] ?? "").trim() || undefined : undefined,
      quantity: qty,
      avgCost: avg ?? 0,
      currency: currencyForSymbol(yahooSymbol),
      securityType: secType,
      account: accountCol !== -1 ? String(row[accountCol] ?? "").trim() || undefined : undefined,
    });
  }

  // ---- merge the same symbol across accounts (multi-account exports) ----
  // Quantities add; average cost is the cost-weighted blend (rows without a
  // known avg contribute shares but no cost, and we say so).
  const bySymbol = new Map<string, Holding[]>();
  for (const h of rawHoldings) {
    const k = h.yahooSymbol.toUpperCase();
    bySymbol.set(k, [...(bySymbol.get(k) ?? []), h]);
  }
  const holdings: Holding[] = [];
  const mergeNotes: string[] = [];
  for (const group of bySymbol.values()) {
    if (group.length === 1) {
      holdings.push(group[0]);
      continue;
    }
    const qty = group.reduce((a, h) => a + h.quantity, 0);
    const costed = group.filter((h) => h.avgCost > 0);
    const costQty = costed.reduce((a, h) => a + h.quantity, 0);
    const avg = costQty > 0 ? costed.reduce((a, h) => a + h.quantity * h.avgCost, 0) / costQty : 0;
    const accounts = [...new Set(group.map((h) => h.account).filter((a): a is string => !!a))];
    const first = group[0];
    holdings.push({
      ...first,
      quantity: qty,
      avgCost: avg,
      securityType: group.map((h) => h.securityType).find((t) => t !== undefined),
      account: accounts.length ? accounts.join(" + ") : first.account,
    });
    mergeNotes.push(
      `${first.rawSymbol}: merged ${group.length} rows${accounts.length > 1 ? ` (${accounts.join(", ")})` : ""} → ${qty} sh @ weighted avg ${avg ? avg.toFixed(2) : "n/a"}`
    );
    if (costed.length && costed.length < group.length) {
      mergeNotes.push(`${first.rawSymbol}: ${group.length - costed.length} merged row(s) had no cost - average uses the rows that did.`);
    }
  }

  if (cashRows) {
    warnings.push(`${cashRows} cash row${cashRows === 1 ? "" : "s"} (Security Type: currency) excluded - balances aren't analyzable holdings.`);
  }
  if (mergeNotes.length) {
    warnings.push(...mergeNotes.slice(0, 5));
    if (mergeNotes.length > 5) warnings.push(`…and ${mergeNotes.length - 5} more merges.`);
  }
  if (!holdings.length) {
    warnings.push("Header row found, but no holdings rows could be read beneath it.");
  }

  return { holdings, warnings, detectedBroker: broker, headerRow: header };
}
