import Papa from "papaparse";
import type { Broker, Holding } from "./types";
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
    if (s === -1) s = row.findIndex((c) => SYMBOL_LOOSE_RE.test(c) && c.length < 40);
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
  const nameCol = header.findIndex((c) => NAME_RE.test(c) && !SYMBOL_LOOSE_RE.test(c));
  const ccyCol = header.findIndex((c) => CURRENCY_RE.test(c));
  const isinCol = header.findIndex((c) => ISIN_RE.test(c));
  const sectorCol = header.findIndex((c) => SECTOR_RE.test(c));
  void isinCol;
  void sectorCol;

  if (avgCol === -1 && totalCostCol === -1) {
    warnings.push(
      "No average-cost column detected — invested amounts and P&L will be unavailable until you fill Avg Cost in the table."
    );
  }

  const holdings: Holding[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const raw = String(row[symCol] ?? "").trim();
    if (!raw) continue;
    // skip totals/footer rows
    if (/^total|^grand total|^\d+ items?/i.test(raw)) continue;

    const qty = toNumber(row[qtyCol]);
    if (qty === undefined || qty === 0) continue;

    let avg = avgCol !== -1 ? toNumber(row[avgCol]) : undefined;
    if (avg === undefined && totalCostCol !== -1) {
      const total = toNumber(row[totalCostCol]);
      if (total !== undefined && qty > 0) avg = total / qty;
    }
    const ccyHint = ccyCol !== -1 ? String(row[ccyCol] ?? "") : undefined;
    const yahooSymbol = guessYahooSymbol(raw, broker === "manual" ? "wealthsimple" : broker, ccyHint);

    holdings.push({
      id: nextId(),
      broker,
      rawSymbol: raw,
      yahooSymbol,
      name: nameCol !== -1 ? String(row[nameCol] ?? "").trim() || undefined : undefined,
      quantity: qty,
      avgCost: avg ?? 0,
      currency: currencyForSymbol(yahooSymbol),
    });
  }

  if (!holdings.length) {
    warnings.push("Header row found, but no holdings rows could be read beneath it.");
  }

  return { holdings, warnings, detectedBroker: broker, headerRow: header };
}
