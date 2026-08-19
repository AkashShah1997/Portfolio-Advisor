/**
 * Pure 13F machinery (no network, testable): the curated superinvestor bench,
 * the info-table XML parser, quarter-over-quarter diffing, and issuer→ticker
 * mapping against SEC's company_tickers.json.
 *
 * Reality checks baked in:
 *  - 13Fs cover US-listed long positions only, filed up to 45 days after
 *    quarter end. They can't show shorts, hedges, or non-US books.
 *  - Values are full USD (per the SEC's post-2022 rules — we only read the
 *    two most recent filings, so no thousands-scaling is needed).
 *  - Option positions (putCall) are excluded from conviction math.
 */

export interface Superinvestor {
  cik: string; // 10-digit, zero-padded
  name: string;
  manager: string;
  blurb: string;
  record: string;
}

/** Hand-curated bench: long-horizon managers with decades-long public records. CIKs verified against SEC/13f.info. */
export const SUPERINVESTORS: Superinvestor[] = [
  {
    cik: "0001067983",
    name: "Berkshire Hathaway",
    manager: "Warren Buffett",
    blurb: "The reference compounder — durable moats held for decades.",
    record: "~20%/yr over ~60 years",
  },
  {
    cik: "0001569205",
    name: "Fundsmith LLP",
    manager: "Terry Smith",
    blurb: "Buy good companies, don't overpay, do nothing.",
    record: "top-decile global quality since 2010",
  },
  {
    cik: "0001112520",
    name: "Akre Capital Management",
    manager: "Chuck Akre (legacy team)",
    blurb: "Compounding machines: high ROE + reinvestment runway.",
    record: "multi-decade compounding record",
  },
  {
    cik: "0001709323",
    name: "Himalaya Capital",
    manager: "Li Lu",
    blurb: "Munger's chosen manager; ultra-concentrated value.",
    record: "decades of concentrated value",
  },
  {
    cik: "0001647251",
    name: "TCI Fund Management",
    manager: "Chris Hohn",
    blurb: "Concentrated, infrastructure-like moats, activist patience.",
    record: "among the best 20y hedge-fund records",
  },
  {
    cik: "0001336528",
    name: "Pershing Square",
    manager: "Bill Ackman",
    blurb: "A dozen large, simple, predictable franchises.",
    record: "concentrated quality since 2004",
  },
  {
    cik: "0001061768",
    name: "Baupost Group",
    manager: "Seth Klarman",
    blurb: "Margin of Safety, literally — price discipline above all.",
    record: "~40 years of risk-first value",
  },
  {
    cik: "0001096343",
    name: "Markel Group",
    manager: "Tom Gayner",
    blurb: "Insurance float compounded into quality equities, Berkshire-style.",
    record: "30+ years of steady compounding",
  },
  {
    cik: "0001641864",
    name: "Giverny Capital",
    manager: "François Rochon",
    blurb: "Owner-minded quality-growth; famous annual letters.",
    record: "~30 years well ahead of the index",
  },
];

// ---------------- info-table parsing ----------------

export interface F13Position {
  issuer: string;
  cusip: string;
  value: number; // USD
  shares: number;
}

const tag = (block: string, name: string): string | undefined => {
  const m = block.match(new RegExp(`<(?:[A-Za-z0-9]+:)?${name}[^>]*>([^<]*)<`, "i"));
  return m ? m[1].trim() : undefined;
};

/**
 * Parse a 13F information-table XML. Tolerates namespaces, aggregates
 * duplicate CUSIPs (multi-manager filings), and skips option (putCall) rows.
 */
export function parseInfoTable(xml: string): F13Position[] {
  const byCusip = new Map<string, F13Position>();
  const blocks = xml.split(/<(?:[A-Za-z0-9]+:)?infoTable[\s>]/i).slice(1);
  for (const raw of blocks) {
    const block = raw.slice(0, raw.search(/<\/(?:[A-Za-z0-9]+:)?infoTable>/i));
    if (tag(block, "putCall")) continue; // options are not conviction share counts
    const issuer = tag(block, "nameOfIssuer");
    const cusip = tag(block, "cusip")?.toUpperCase();
    const value = Number(tag(block, "value")?.replace(/[^\d.-]/g, ""));
    const shares = Number(tag(block, "sshPrnamt")?.replace(/[^\d.-]/g, ""));
    if (!issuer || !cusip || !Number.isFinite(value)) continue;
    const prev = byCusip.get(cusip);
    if (prev) {
      prev.value += value;
      prev.shares += Number.isFinite(shares) ? shares : 0;
    } else {
      byCusip.set(cusip, {
        issuer,
        cusip,
        value,
        shares: Number.isFinite(shares) ? shares : 0,
      });
    }
  }
  return [...byCusip.values()].sort((a, b) => b.value - a.value);
}

// ---------------- quarter-over-quarter diff ----------------

export interface Move {
  issuer: string;
  cusip: string;
  ticker?: string;
  valueUsd: number;
  weightPct: number; // % of the CURRENT filing (prev filing for exits)
  prevWeightPct?: number;
  sharesChangePct?: number; // +0.5 = +50%
}

export interface F13Diff {
  aumUsd: number;
  positionsCount: number;
  newBuys: Move[];
  adds: Move[];
  trims: Move[];
  exits: Move[];
  top: Move[];
}

const ADD_THRESHOLD = 0.2; // ±20% share-count change counts as a real add/trim
const MIN_WEIGHT = 0.001; // ignore sub-0.1% dust in moves lists

export function diffFilings(curr: F13Position[], prev: F13Position[]): F13Diff {
  const currTotal = curr.reduce((a, p) => a + p.value, 0) || 1;
  const prevTotal = prev.reduce((a, p) => a + p.value, 0) || 1;
  const prevBy = new Map(prev.map((p) => [p.cusip, p]));
  const currBy = new Map(curr.map((p) => [p.cusip, p]));

  const newBuys: Move[] = [];
  const adds: Move[] = [];
  const trims: Move[] = [];

  for (const p of curr) {
    const w = p.value / currTotal;
    const old = prevBy.get(p.cusip);
    if (!old) {
      if (w >= MIN_WEIGHT) newBuys.push({ issuer: p.issuer, cusip: p.cusip, valueUsd: p.value, weightPct: w });
      continue;
    }
    const prevW = old.value / prevTotal;
    if (old.shares > 0 && p.shares > 0) {
      const chg = p.shares / old.shares - 1;
      const move: Move = {
        issuer: p.issuer,
        cusip: p.cusip,
        valueUsd: p.value,
        weightPct: w,
        prevWeightPct: prevW,
        sharesChangePct: chg,
      };
      if (chg >= ADD_THRESHOLD && w >= MIN_WEIGHT) adds.push(move);
      else if (chg <= -ADD_THRESHOLD && prevW >= MIN_WEIGHT) trims.push(move);
    }
  }

  const exits: Move[] = prev
    .filter((p) => !currBy.has(p.cusip))
    .map((p) => ({ issuer: p.issuer, cusip: p.cusip, valueUsd: p.value, weightPct: p.value / prevTotal }))
    .filter((m) => m.weightPct >= MIN_WEIGHT);

  const top: Move[] = curr.slice(0, 10).map((p) => {
    const old = prevBy.get(p.cusip);
    return {
      issuer: p.issuer,
      cusip: p.cusip,
      valueUsd: p.value,
      weightPct: p.value / currTotal,
      prevWeightPct: old ? old.value / prevTotal : undefined,
      sharesChangePct: old && old.shares > 0 && p.shares > 0 ? p.shares / old.shares - 1 : undefined,
    };
  });

  const byWeight = (a: Move, b: Move) => b.weightPct - a.weightPct;
  return {
    aumUsd: currTotal,
    positionsCount: curr.length,
    newBuys: newBuys.sort(byWeight),
    adds: adds.sort(byWeight),
    trims: trims.sort(byWeight),
    exits: exits.sort(byWeight),
    top,
  };
}

// ---------------- payload shapes (shared by server route + mock + UI) ----------------

export interface InvestorMoves {
  cik: string;
  name: string;
  manager: string;
  blurb: string;
  record: string;
  quarter?: string;
  prevQuarter?: string;
  filedAt?: string;
  aumUsd?: number;
  positionsCount?: number;
  top: Move[];
  newBuys: Move[];
  adds: Move[];
  trims: Move[];
  exits: Move[];
  error?: string;
}

export interface SmartMovesPayload {
  investors: InvestorMoves[];
  fetchedAt: string;
  mock?: boolean;
}

// ---------------- issuer → ticker mapping ----------------

const SUFFIX_WORDS = new Set([
  "INC",
  "INCORPORATED",
  "CORP",
  "CORPORATION",
  "CO",
  "COMPANY",
  "LTD",
  "LIMITED",
  "PLC",
  "LLC",
  "LP",
  "SA",
  "NV",
  "AG",
  "SE",
  "ADR",
  "ADS",
  "SPONSORED",
  "SPON",
  "SHS",
  "SH",
  "ORD",
  "COM",
  "COMMON",
  "STOCK",
  "NEW",
  "DEL",
  "CL",
  "CLASS",
  "SER",
  "SERIES",
  "THE",
]);

/** Common 13F filing abbreviations → full words (filers abbreviate heavily: "UNION PAC CORP"). */
const ABBREV: Record<string, string> = {
  PAC: "PACIFIC",
  INTL: "INTERNATIONAL",
  GRP: "GROUP",
  HLDGS: "HOLDINGS",
  HLDG: "HOLDING",
  SVCS: "SERVICES",
  SVC: "SERVICE",
  FINL: "FINANCIAL",
  FIN: "FINANCIAL",
  MGMT: "MANAGEMENT",
  PETE: "PETROLEUM",
  AMERN: "AMERICAN",
  AMER: "AMERICAN",
  EXPR: "EXPRESS",
  MTRS: "MOTORS",
  MTR: "MOTOR",
  PLATFRMS: "PLATFORMS",
  ELEC: "ELECTRIC",
  PWR: "POWER",
  PDS: "PRODUCTS",
  PROD: "PRODUCTS",
  RES: "RESOURCES",
  TECHNOLGS: "TECHNOLOGIES",
  TECHS: "TECHNOLOGIES",
  LABS: "LABORATORIES",
  CMNTY: "COMMUNITY",
  BANCORP: "BANCORP",
  INDS: "INDUSTRIES",
  IND: "INDUSTRIES",
  MFG: "MANUFACTURING",
  INSTRS: "INSTRUMENTS",
  SOLTNS: "SOLUTIONS",
  ENTMT: "ENTERTAINMENT",
  CTRS: "CENTERS",
  PPTYS: "PROPERTIES",
  SYS: "SYSTEMS",
};

export function normalizeIssuer(name: string): string {
  const words = name
    .toUpperCase()
    .replace(/&/g, " AND ")
    .replace(/[^A-Z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => ABBREV[w] ?? w)
    .filter((w) => !SUFFIX_WORDS.has(w))
    // drop trailing single letters (share classes) but keep leading ones (e.g. "A O SMITH" quirks are rare)
    .filter((w, i, arr) => !(w.length === 1 && i === arr.length - 1));
  return words.join(" ");
}

export interface CompanyTickerEntry {
  cik_str: number;
  ticker: string;
  title: string;
}

/** Build normalized-title → ticker map; prefers the shortest ticker per title (primary share class). */
export function buildTickerMap(entries: CompanyTickerEntry[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const e of entries) {
    if (!e?.ticker || !e?.title) continue;
    const key = normalizeIssuer(e.title);
    if (!key) continue;
    const existing = map.get(key);
    if (!existing || e.ticker.length < existing.length) map.set(key, e.ticker.toUpperCase());
  }
  return map;
}

/**
 * Resolve an issuer name to a US ticker: exact normalized match, then
 * progressively drop trailing words, then a prefix scan (longest key wins).
 */
export function tickerFor(issuer: string, map: Map<string, string>): string | undefined {
  const full = normalizeIssuer(issuer);
  let key = full;
  while (key) {
    const hit = map.get(key);
    if (hit) return hit;
    const idx = key.lastIndexOf(" ");
    if (idx === -1) break;
    key = key.slice(0, idx);
  }
  if (full.length >= 8) {
    let best: { k: string; t: string } | undefined;
    for (const [k, t] of map) {
      if (k.length >= 8 && (k.startsWith(full + " ") || full.startsWith(k + " ") || k === full)) {
        if (!best || k.length > best.k.length) best = { k, t };
      }
    }
    if (best) return best.t;
  }
  return undefined;
}
