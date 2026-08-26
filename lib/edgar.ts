import "server-only";
import {
  buildTickerMap,
  diffFilings,
  parseInfoTable,
  SUPERINVESTORS,
  tickerFor,
  type CompanyTickerEntry,
  type F13Position,
  type InvestorMoves,
  type Move,
  type SmartMovesPayload,
} from "./thirteenf";
import { MOCK_ENABLED, mockInvestorMoves, mockSmartMoves } from "./mock";
export type { InvestorMoves, SmartMovesPayload } from "./thirteenf";

/**
 * SEC EDGAR client for superinvestor 13F filings. Free and official; needs no
 * key, only a descriptive User-Agent and polite pacing (SEC asks ≤10 req/s -
 * we run far gentler). Results are cached in-process for 6h: quarterly
 * filings don't change between lunch and dinner.
 */

/**
 * SEC's fair-access policy REQUIRES a User-Agent that identifies the requester
 * with a contact address, and www.sec.gov (the Archives host) returns 403
 * without one (data.sec.gov is more lenient, which is why the submissions call
 * worked while index.json failed). Put YOUR email here when self-hosting:
 * https://www.sec.gov/os/webmaster-faq#developers
 */
const UA = "PortfolioAdvisor/2.6 (personal research tool; contact@portfolio-advisor.local)";

// ---- gentle SEC queue (separate from the Yahoo queue) ----
const MAX_CONCURRENT = 4;
const MIN_GAP_MS = 130;
let inFlight = 0;
let lastLaunch = 0;
const waiters: Array<() => void> = [];

async function politely<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  while (inFlight >= MAX_CONCURRENT) await new Promise<void>((res) => waiters.push(res));
  inFlight++;
  try {
    for (let attempt = 1; ; attempt++) {
      const wait = lastLaunch + MIN_GAP_MS - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      lastLaunch = Date.now();
      try {
        return await fn();
      } catch (e) {
        const msg = String((e as Error).message ?? "").toLowerCase();
        const retryable =
          msg.includes("429") || msg.includes("403") || msg.includes("5") || msg.includes("fetch failed") || msg.includes("timeout");
        if (attempt >= tries || !retryable) throw e;
        await new Promise((r) => setTimeout(r, 900 * Math.pow(2.2, attempt - 1) * (0.7 + Math.random() * 0.6)));
      }
    }
  } finally {
    inFlight--;
    waiters.shift()?.();
  }
}

async function secJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, cache: "no-store" });
  if (!res.ok) throw new Error(`SEC HTTP ${res.status} for ${url.slice(0, 80)}`);
  return (await res.json()) as T;
}

async function secText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": UA }, cache: "no-store" });
  if (!res.ok) throw new Error(`SEC HTTP ${res.status} for ${url.slice(0, 80)}`);
  return res.text();
}

// ---- company_tickers.json → issuer-name → ticker map ----
let tickerMapCache: { at: number; map: Map<string, string> } | null = null;
let tickerMapInFlight: Promise<Map<string, string>> | null = null;

async function getTickerMap(): Promise<Map<string, string>> {
  if (tickerMapCache && Date.now() - tickerMapCache.at < 24 * 3600 * 1000) return tickerMapCache.map;
  if (tickerMapInFlight) return tickerMapInFlight; // dedupe concurrent per-investor requests
  tickerMapInFlight = (async () => {
    try {
      const json = await politely(() =>
        secJson<Record<string, CompanyTickerEntry>>("https://www.sec.gov/files/company_tickers.json")
      );
      const map = buildTickerMap(Object.values(json));
      tickerMapCache = { at: Date.now(), map };
      return map;
    } finally {
      tickerMapInFlight = null;
    }
  })();
  return tickerMapInFlight;
}

// ---- 13F fetching ----

interface SubmissionsRecent {
  form: string[];
  accessionNumber: string[];
  reportDate: string[];
  filingDate: string[];
  primaryDocument: string[];
}

interface FilingRef {
  accession: string;
  report: string;
  filed: string;
}

/** Latest filing per report period (amendments supersede), newest periods first. */
function pickLatestFilings(recent: SubmissionsRecent, max = 2): FilingRef[] {
  const byPeriod = new Map<string, FilingRef>();
  for (let i = 0; i < recent.form.length; i++) {
    if (!recent.form[i]?.startsWith("13F-HR")) continue;
    const ref: FilingRef = {
      accession: recent.accessionNumber[i],
      report: recent.reportDate[i],
      filed: recent.filingDate[i],
    };
    const prev = byPeriod.get(ref.report);
    if (!prev || ref.filed >= prev.filed) byPeriod.set(ref.report, ref);
  }
  return [...byPeriod.values()].sort((a, b) => b.report.localeCompare(a.report)).slice(0, max);
}

interface DirectoryIndex {
  directory?: { item?: Array<{ name: string; size?: string }> };
}

async function fetchPositions(cik: string, ref: FilingRef): Promise<F13Position[]> {
  const cikNum = Number(cik);
  const acc = ref.accession.replace(/-/g, "");
  const base = `https://www.sec.gov/Archives/edgar/data/${cikNum}/${acc}`;
  const index = await politely(() => secJson<DirectoryIndex>(`${base}/index.json`));
  const items = index.directory?.item ?? [];
  const xmls = items.filter((it) => /\.xml$/i.test(it.name) && !/primary_doc/i.test(it.name));
  // the information table is the meaty XML; prefer names that say so, else the largest
  const named = xmls.find((it) => /info.*table|form13f/i.test(it.name));
  const chosen =
    named ??
    xmls.sort((a, b) => Number(b.size ?? 0) - Number(a.size ?? 0))[0];
  if (!chosen) throw new Error("no information-table XML in filing");
  const xml = await politely(() => secText(`${base}/${chosen.name}`));
  const positions = parseInfoTable(xml);
  if (!positions.length) throw new Error("information table parsed to zero positions");
  return positions;
}

const MOVES_TTL = 6 * 3600 * 1000;
const invCache = new Map<string, { at: number; inv: InvestorMoves }>();

/** Read one filer's latest two 13Fs and diff them. Errors come back INSIDE the object. */
async function fetchInvestor(inv: (typeof SUPERINVESTORS)[number]): Promise<InvestorMoves> {
  const empty = { top: [], newBuys: [], adds: [], trims: [], exits: [] };
  try {
    const tickerMap = await getTickerMap().catch(() => new Map<string, string>());
    const withTickers = (moves: Move[]): Move[] =>
      moves.map((m) => ({ ...m, ticker: m.ticker ?? tickerFor(m.issuer, tickerMap) }));

    const sub = await politely(() =>
      secJson<{ filings: { recent: SubmissionsRecent } }>(`https://data.sec.gov/submissions/CIK${inv.cik}.json`)
    );
    const refs = pickLatestFilings(sub.filings.recent, 2);
    if (!refs.length) return { ...inv, ...empty, error: "no 13F filings found" };
    const curr = await fetchPositions(inv.cik, refs[0]);
    const prev = refs[1] ? await fetchPositions(inv.cik, refs[1]).catch(() => []) : [];
    const diff = diffFilings(curr, prev);
    return {
      ...inv,
      quarter: refs[0].report,
      prevQuarter: refs[1]?.report,
      filedAt: refs[0].filed,
      aumUsd: diff.aumUsd,
      positionsCount: diff.positionsCount,
      top: withTickers(diff.top),
      newBuys: withTickers(diff.newBuys),
      adds: withTickers(diff.adds),
      trims: withTickers(diff.trims),
      exits: withTickers(diff.exits),
    };
  } catch (e) {
    return { ...inv, ...empty, error: (e as Error).message.slice(0, 120) };
  }
}

async function fetchInvestorCached(inv: (typeof SUPERINVESTORS)[number]): Promise<InvestorMoves> {
  const hit = invCache.get(inv.cik);
  if (hit && Date.now() - hit.at < MOVES_TTL) return hit.inv;
  const result = await fetchInvestor(inv);
  if (!result.error) invCache.set(inv.cik, { at: Date.now(), inv: result });
  return result;
}

/**
 * One investor at a time - this is what the UI calls, so each card loads (and
 * fails, and retries) independently instead of the whole bench waiting on the
 * slowest SEC response. Returns null for a CIK not on the bench.
 */
export async function getInvestorMoves(cik: string): Promise<InvestorMoves | null> {
  const inv = SUPERINVESTORS.find((s) => s.cik === cik);
  if (!inv) return null;
  if (MOCK_ENABLED) return mockInvestorMoves(cik);
  return fetchInvestorCached(inv);
}

/** Whole-bench payload (kept for compatibility; shares the per-investor cache). */
export async function getSmartMoves(): Promise<SmartMovesPayload> {
  if (MOCK_ENABLED) return { investors: mockSmartMoves(), fetchedAt: new Date().toISOString(), mock: true };
  const investors = await Promise.all(SUPERINVESTORS.map((inv) => fetchInvestorCached(inv)));
  return { investors, fetchedAt: new Date().toISOString() };
}
