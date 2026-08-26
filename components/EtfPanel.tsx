"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AnalyzedHolding, Currency, FxRates } from "@/lib/types";
import { MARKET_META, type Market } from "@/lib/store";
import { enrichEtfData, fallbackEtfData, isEtfHolding, type EtfData } from "@/lib/etf";
import { catalogMer, ETF_CATALOG, MER_ASOF } from "@/lib/etfcatalog";
import {
  assessAll,
  assessEtf,
  ETF_VERDICT_META,
  MER_BAND_META,
  type EtfAssessment,
  type HeldEtfInput,
} from "@/lib/etfscore";
import { toBase } from "@/lib/portfolio";
import { fmtMoney, fmtPct } from "@/lib/symbols";
import { Badge, Card, InfoTip, SectionTitle, Spinner } from "./ui";

/**
 * The ETFs tab - fee-first fund analysis: what each held ETF costs, what that
 * compounds into, which to increase / reduce, and the cheaper same-index twin
 * (the MER comparison). Stock pillars don't apply to fund units; this is the
 * Bogle lens instead of the Buffett lens.
 */

type FundState = EtfData | "loading" | "error" | "throttled";

const short = (sym: string) => sym.replace(/\.(NS|BO|TO|V)$/i, "");

/** AUM in the fund's own currency, without a pointless ".00". */
function fmtAum(v: number | undefined, currency: string | undefined, fallback: Currency): string {
  if (v === undefined) return "–";
  const cur = (currency === "INR" || currency === "CAD" || currency === "USD" ? currency : fallback) as Currency;
  return fmtMoney(v, cur, true).replace(/\.00(?=\s|$)/, "");
}

function ReturnChip({ label, v }: { label: string; v?: number }) {
  if (v === undefined) return null;
  return (
    <span className="inline-flex items-baseline gap-1 bg-page hairline rounded-lg px-2 py-1">
      <span className="text-[10.5px] text-muted">{label}</span>
      <span className={`text-[12.5px] font-semibold tnum ${v >= 0 ? "text-success-text" : "text-status-critical"}`}>
        {v >= 0 ? "+" : ""}
        {fmtPct(v)}
      </span>
    </span>
  );
}

function FundStat({
  label,
  value,
  sub,
  tipKey,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tipKey?: string;
  tone?: "good" | "neutral" | "warning" | "serious" | "muted";
}) {
  const toneCls =
    tone === "good"
      ? "text-success-text"
      : tone === "warning"
        ? "text-[#8a6100]"
        : tone === "serious"
          ? "text-[#9c4a26]"
          : "text-ink";
  return (
    <div className="min-w-[92px]">
      <div className="text-[11px] text-muted whitespace-nowrap">
        {label} {tipKey && <InfoTip k={tipKey} />}
      </div>
      <div className={`text-[15px] font-semibold tnum leading-tight ${toneCls}`}>{value}</div>
      {sub && <div className="text-[10.5px] text-muted leading-tight mt-0.5">{sub}</div>}
    </div>
  );
}

export function EtfPanel({
  rows,
  market,
  fx,
  portfolioTotal,
}: {
  rows: AnalyzedHolding[];
  market: Market;
  fx: FxRates;
  portfolioTotal: number; // base currency, whole portfolio (stocks + ETFs)
}) {
  const meta = MARKET_META[market];
  const base = meta.base;

  const etfRows = useMemo(
    () =>
      rows.filter(
        (r) =>
          !r.holding.watch &&
          isEtfHolding(
            r.holding.yahooSymbol,
            r.data?.quote.name ?? r.holding.name,
            r.data?.quote.quoteType,
            r.holding.securityType
          )
      ),
    [rows]
  );

  const [funds, setFunds] = useState<Record<string, FundState>>({});
  const [extras, setExtras] = useState<string[]>([]);
  const [input, setInput] = useState("");

  const wanted = useMemo(() => {
    const set = new Set(etfRows.map((r) => r.holding.yahooSymbol.toUpperCase()));
    for (const s of extras) set.add(s);
    return [...set];
  }, [etfRows, extras]);

  // In-flight tracking lives in a ref so the effect re-running (it depends on
  // `funds`, which it updates) never cancels fetches it already launched.
  const inFlight = useRef<Set<string>>(new Set());
  useEffect(() => {
    const missing = wanted.filter((s) => funds[s] === undefined && !inFlight.current.has(s)).slice(0, 4);
    if (!missing.length) return;
    for (const s of missing) inFlight.current.add(s);
    void (async () => {
      await Promise.resolve(); // defer past render commit
      setFunds((prev) => {
        const next = { ...prev };
        for (const s of missing) if (next[s] === undefined) next[s] = "loading";
        return next;
      });
      await Promise.all(
        missing.map(async (s) => {
          try {
            const res = await fetch(`/api/etf/${encodeURIComponent(s)}`);
            const j = (await res.json()) as EtfData & { error?: string };
            setFunds((prev) => ({
              ...prev,
              [s]: res.ok && !j.error ? j : res.status === 429 ? "throttled" : "error",
            }));
          } catch {
            setFunds((prev) => ({ ...prev, [s]: "error" }));
          } finally {
            inFlight.current.delete(s);
          }
        })
      );
    })();
  }, [wanted, funds]);

  // Held funds, valued in base currency. When Yahoo's fund feed fails (or
  // returns a shell), we still analyze: identity/price from the quote we
  // already fetched, returns from its own price history, MER from the curated
  // table - labeled "limited data", never a dead card.
  const held = useMemo<{ input: HeldEtfInput; row: AnalyzedHolding }[]>(() => {
    const out: { input: HeldEtfInput; row: AnalyzedHolding }[] = [];
    for (const r of etfRows) {
      const sym = r.holding.yahooSymbol;
      const st = funds[sym.toUpperCase()];
      const fromRow = {
        name: r.data?.quote.name ?? r.holding.name,
        price: r.data?.quote.price,
        currency: (r.data?.quote.currency as string | undefined) ?? r.holding.currency,
        prices: r.data?.prices,
      };
      let f: EtfData | undefined;
      if (st && typeof st !== "string") {
        f = enrichEtfData(st, fromRow);
      } else if (st === "error" || st === "throttled") {
        // fall back if there is anything to stand on
        if (catalogMer(sym) || (r.data?.prices?.length ?? 0) > 12) {
          f = fallbackEtfData({ symbol: sym, ...fromRow });
        }
      }
      if (!f) continue;
      const value = toBase(r.currentValue ?? r.invested, r.holding.currency as Currency, fx);
      out.push({ input: { etf: f, value }, row: r });
    }
    return out;
  }, [etfRows, funds, fx]);

  const assessments = useMemo(
    () => assessAll(held.map((h) => h.input), { market, portfolioTotal }),
    [held, market, portfolioTotal]
  );
  const bySymbol = useMemo(() => {
    const m = new Map<string, EtfAssessment>();
    for (const a of assessments) m.set(a.symbol.toUpperCase(), a);
    return m;
  }, [assessments]);

  // extras (inspected, not held) - assessed alone so they can't fake overlaps
  const extraAssessed = useMemo(
    () =>
      extras
        .map((s) => {
          const st = funds[s];
          let f: EtfData | undefined;
          if (st && typeof st !== "string") f = st;
          else if ((st === "error" || st === "throttled") && catalogMer(s)) {
            f = fallbackEtfData({ symbol: s, name: catalogMer(s)?.name });
          }
          if (!f) return undefined;
          return {
            etf: f,
            a: assessEtf({ etf: f, value: 0 }, { market, portfolioTotal, heldByCategory: new Map() }),
          };
        })
        .filter((x): x is { etf: EtfData; a: EtfAssessment } => !!x),
    [extras, funds, market, portfolioTotal]
  );

  // summary strip
  const etfValue = held.reduce((a, h) => a + h.input.value, 0);
  const feesKnown = held.filter((h) => bySymbolMer(bySymbol, h.input.etf.symbol) !== undefined);
  const annualFees = feesKnown.reduce(
    (a, h) => a + h.input.value * (bySymbolMer(bySymbol, h.input.etf.symbol) ?? 0),
    0
  );
  const wMer = feesKnown.length
    ? annualFees / feesKnown.reduce((a, h) => a + h.input.value, 0)
    : undefined;

  const loading = wanted.some((s) => funds[s] === "loading" || funds[s] === undefined) && wanted.length > 0;
  const anyThrottled = wanted.some((s) => funds[s] === "throttled");

  const addExtra = () => {
    const s = input.trim().toUpperCase();
    if (!s || s.length > 20) return;
    setExtras((prev) => (prev.includes(s) ? prev : [...prev, s]));
    setInput("");
  };

  const starterCats = ETF_CATALOG.filter((c) => c.market === market && (c.kind === "core" || c.kind === "bond"));

  return (
    <div className="space-y-4">
      {/* header / summary */}
      <Card className="p-4">
        <SectionTitle sub="Fund units are judged the Bogle way - on fees, breadth, duplication and size - not on stock pillars. MERs come from Yahoo when available, else from a curated table (approximate).">
          Your ETFs - cost-first analysis
        </SectionTitle>
        {etfRows.length === 0 ? (
          <p className="text-[13px] text-ink-2">
            No ETFs among your {meta.label} holdings. Below are the classic low-cost building blocks for this
            market, and you can inspect any fund by symbol.
          </p>
        ) : (
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-[12.5px] text-ink-2">
            <span>
              ETF value{" "}
              <strong className="text-ink tnum">{fmtMoney(etfValue, base, true)}</strong>{" "}
              {portfolioTotal > 0 && <span className="text-muted tnum">({fmtPct(etfValue / portfolioTotal, 1)} of portfolio)</span>}
            </span>
            <span>
              Weighted MER <InfoTip k="mer" />{" "}
              <strong className="text-ink tnum">{wMer !== undefined ? fmtPct(wMer, 2) : "–"}</strong>
            </span>
            <span>
              Est. fund fees <strong className="text-ink tnum">{fmtMoney(annualFees, base, true)}</strong>/yr{" "}
              <span className="text-muted">(silently deducted from NAV)</span>
            </span>
            {loading && (
              <span className="text-muted">
                <Spinner /> fetching fund data…
              </span>
            )}
          </div>
        )}
        {anyThrottled && (
          <p className="text-[12px] text-[#8a6100] mt-2">
            Yahoo rate-limited some fund lookups - switch tabs and back in a minute to retry.
          </p>
        )}
      </Card>

      {/* held ETF cards */}
      {assessments.map((a) => {
        const h = held.find((x) => x.input.etf.symbol.toUpperCase() === a.symbol.toUpperCase());
        if (!h) return null;
        const f = h.input.etf;
        const vm = ETF_VERDICT_META[a.verdict];
        const bm = MER_BAND_META[a.merBand];
        return (
          <Card key={a.symbol} className="p-4">
            <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-[15px]">{f.name ?? a.symbol}</span>
                  <span className="text-muted text-[12px] tnum">{a.symbol}</span>
                  {f.family && <Badge tone="neutral">{f.family}</Badge>}
                  {a.category && <Badge tone="muted">{a.category.label}</Badge>}
                  {f.mock && <Badge tone="muted">demo data</Badge>}
                  {f.degraded && (
                    <Badge tone="warning" icon="◔">
                      limited data
                    </Badge>
                  )}
                </div>
                <div className="text-[12.5px] text-ink-2 mt-0.5 tnum">
                  {fmtMoney(h.input.value, base, true)}
                  {a.weightPct !== undefined && ` · ${fmtPct(a.weightPct, 1)} of portfolio`}
                  {f.fundYield !== undefined && ` · yield ${fmtPct(f.fundYield)}`}
                  {h.row.holding.account && <span className="text-muted"> · {h.row.holding.account}</span>}
                </div>
              </div>
              <Badge tone={vm.tone} icon={vm.icon}>
                {vm.label}
              </Badge>
            </div>

            <p className="text-[12.5px] text-ink-2 mt-2">{a.headline}</p>

            {/* stat band */}
            <div className="flex flex-wrap gap-x-7 gap-y-3 mt-3">
              <FundStat
                label={`MER${a.merSource === "catalog" ? " (approx)" : ""}`}
                value={a.effMer !== undefined ? fmtPct(a.effMer, 2) : "–"}
                sub={bm.label}
                tipKey="mer"
                tone={bm.tone === "neutral" ? undefined : bm.tone}
              />
              <FundStat
                label="Your fees"
                value={a.annualFee !== undefined ? `${fmtMoney(a.annualFee, base, true)}/yr` : "–"}
                sub={a.drag10y !== undefined ? `≈ ${fmtMoney(a.drag10y, base, true)} over 10y` : undefined}
                tipKey="feeDrag"
              />
              <FundStat label="AUM" value={fmtAum(f.aum, f.currency, base)} tipKey="aum" />
              {f.topWeight !== undefined && f.top.length > 0 && (
                <FundStat label={`Top ${f.top.length}`} value={fmtPct(f.topWeight, 0)} tipKey="topWeight" />
              )}
              <div>
                <div className="text-[11px] text-muted mb-1">
                  Returns (annualized) <InfoTip k="trailingReturn" />
                </div>
                <div className="flex gap-1.5">
                  <ReturnChip label="1y" v={f.trailing.y1} />
                  <ReturnChip label="3y" v={f.trailing.y3} />
                  <ReturnChip label="5y" v={f.trailing.y5} />
                </div>
              </div>
            </div>

            {/* reasons & cautions */}
            {(a.reasons.length > 0 || a.cautions.length > 0) && (
              <ul className="mt-3 space-y-1">
                {a.reasons.map((r, i) => (
                  <li key={`r${i}`} className="text-[12.5px] text-ink-2 leading-snug flex gap-1.5">
                    <span className="text-series-1 font-bold shrink-0" aria-hidden>
                      ▸
                    </span>
                    <span>{r}</span>
                  </li>
                ))}
                {a.cautions.map((c, i) => (
                  <li key={`c${i}`} className="text-[12px] text-muted leading-snug flex gap-1.5">
                    <span className="shrink-0" aria-hidden>
                      –
                    </span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            )}

            {/* cheaper alternatives */}
            {a.alternatives.length > 0 && (
              <div className="mt-3 bg-page hairline rounded-xl p-3">
                <div className="text-[11.5px] font-semibold text-muted uppercase tracking-wide mb-1.5">
                  Same exposure, lower fee <InfoTip k="etfOverlap" />
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[12.5px]">
                    <thead>
                      <tr className="text-left text-[11px] text-muted border-b border-grid">
                        <th className="py-1 pr-3 font-medium">Fund</th>
                        <th className="py-1 pr-3 font-medium text-right">
                          MER <InfoTip k="mer" />
                        </th>
                        <th className="py-1 pr-3 font-medium text-right">You save</th>
                        <th className="py-1 font-medium text-right">Over 10y</th>
                      </tr>
                    </thead>
                    <tbody>
                      {a.alternatives.map((alt) => (
                        <tr key={alt.symbol} className="border-b border-grid/50">
                          <td className="py-1.5 pr-3">
                            <span className="font-semibold">{short(alt.symbol)}</span>{" "}
                            <span className="text-muted text-[11.5px]">{alt.name}</span>
                          </td>
                          <td className="py-1.5 pr-3 text-right tnum">{fmtPct(alt.mer, 2)}</td>
                          <td className="py-1.5 pr-3 text-right tnum text-success-text">
                            {fmtMoney(alt.savesPerYear, base, true)}/yr
                          </td>
                          <td className="py-1.5 text-right tnum text-success-text">
                            ≈ {fmtMoney(alt.saves10y, base, true)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[11px] text-muted italic mt-1.5">
                  MERs approximate as of {MER_ASOF} - confirm on the fund page before switching. Selling to switch
                  can trigger capital-gains tax; weigh that against the fee saved.
                </p>
              </div>
            )}

            {f.degraded && (
              <p className="text-[11px] text-muted italic mt-2">
                Yahoo&apos;s fund feed had little for this listing - fee from the curated table (approx, as of{" "}
                {MER_ASOF}), returns computed from its own price history (dividends excluded). The verdict logic
                is unchanged.
              </p>
            )}

            {/* what's inside */}
            {(f.sectors.length > 0 || f.top.length > 0) && (
              <p className="text-[11.5px] text-muted mt-2.5">
                {f.sectors.length > 0 && (
                  <>Sectors: {f.sectors.slice(0, 3).map((s) => `${s.label} ${fmtPct(s.weight, 0)}`).join(" · ")}. </>
                )}
                {f.top.length > 0 && <>Top holdings: {f.top.slice(0, 5).map((t) => t.name).join(", ")}.</>}
              </p>
            )}
            {a.category?.note && <p className="text-[11.5px] text-muted italic mt-1.5">{a.category.note}</p>}
          </Card>
        );
      })}

      {/* fetch states for held ETFs that have no card yet (loading, or nothing to fall back on) */}
      {etfRows
        .filter((r) => {
          const s = r.holding.yahooSymbol;
          const st = funds[s.toUpperCase()];
          if (st === undefined || st === "loading") return true;
          if (st === "error" || st === "throttled") {
            return !catalogMer(s) && (r.data?.prices?.length ?? 0) <= 12; // fallback impossible
          }
          return false;
        })
        .map((r) => {
          const s = r.holding.yahooSymbol;
          const st = funds[s.toUpperCase()];
          return (
            <Card key={s} className="p-4">
              <div className="flex items-center gap-3 text-[13px]">
                <span className="font-semibold">{r.data?.quote.name ?? s}</span>
                {st === undefined || st === "loading" ? (
                  <span className="text-ink-2">
                    <Spinner /> fetching fund data…
                  </span>
                ) : (
                  <span className="text-[#8a6100]">
                    {st === "throttled"
                      ? "Yahoo rate-limited this lookup - switch tabs and back in a minute to retry."
                      : "No fund data from Yahoo and this symbol isn't in the curated table - check it on the AMC's page."}
                  </span>
                )}
              </div>
            </Card>
          );
        })}

      {/* no ETFs → starter table */}
      {etfRows.length === 0 && (
        <Card className="p-4">
          <SectionTitle sub={`The boring, brilliant defaults - broad indices at rock-bottom fees (approximate MERs as of ${MER_ASOF}).`}>
            Classic low-cost building blocks - {meta.label}
          </SectionTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-left text-[11px] text-muted border-b border-grid uppercase tracking-wide">
                  <th className="py-1.5 pr-3 font-medium">Category</th>
                  <th className="py-1.5 pr-3 font-medium">Cheapest options</th>
                  <th className="py-1.5 font-medium text-right">
                    MER <InfoTip k="mer" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {starterCats.map((c) => (
                  <tr key={c.key} className="border-b border-grid/50 align-top">
                    <td className="py-2 pr-3 font-medium">{c.label}</td>
                    <td className="py-2 pr-3 text-ink-2">
                      {c.options.slice(0, 3).map((o) => `${short(o.symbol)} - ${o.name}`).join(" · ")}
                    </td>
                    <td className="py-2 text-right tnum whitespace-nowrap">
                      {c.options.slice(0, 3).map((o) => fmtPct(o.mer, 2)).join(" / ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* inspect any ETF */}
      <Card className="p-4">
        <SectionTitle sub="Fetch the fee, size, returns and holdings of any fund before you buy it - same analysis, no position needed.">
          Inspect any ETF
        </SectionTitle>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-[12px] text-ink-2 flex-1 min-w-[220px]">
            Yahoo symbol (e.g. {market === "india" ? "JUNIORBEES.NS, MON100.NS" : "VFV.TO, XEQT.TO"})
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addExtra()}
              className="block w-full bg-page hairline rounded-lg px-2.5 py-1.5 mt-1 text-[12.5px]"
              placeholder={market === "india" ? "JUNIORBEES.NS" : "VFV.TO"}
            />
          </label>
          <button
            onClick={addExtra}
            disabled={!input.trim()}
            className="bg-series-1 text-white rounded-lg px-3.5 py-1.5 text-[12.5px] font-semibold disabled:opacity-40"
          >
            Analyze fund
          </button>
        </div>
        {extraAssessed.map(({ etf: f, a }) => {
          const vm = ETF_VERDICT_META[a.verdict];
          const bm = MER_BAND_META[a.merBand];
          return (
            <div key={f.symbol} className="mt-3 bg-page hairline rounded-xl p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-[13.5px]">{f.name ?? f.symbol}</span>
                <span className="text-muted text-[11.5px] tnum">{f.symbol}</span>
                {a.category && <Badge tone="muted">{a.category.label}</Badge>}
                <Badge tone={vm.tone} icon={vm.icon}>
                  {vm.label}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-ink-2 tnum mt-1.5">
                <span>
                  MER{a.merSource === "catalog" ? " (approx)" : ""}{" "}
                  <strong className="text-ink">{a.effMer !== undefined ? fmtPct(a.effMer, 2) : "–"}</strong>{" "}
                  <span className="text-muted">({bm.label})</span>
                </span>
                <span>
                  AUM <strong className="text-ink">{fmtAum(f.aum, f.currency, base)}</strong>
                </span>
                <span className="inline-flex gap-1.5">
                  <ReturnChip label="1y" v={f.trailing.y1} />
                  <ReturnChip label="3y" v={f.trailing.y3} />
                  <ReturnChip label="5y" v={f.trailing.y5} />
                </span>
              </div>
              {a.reasons.length > 0 && <p className="text-[12px] text-ink-2 mt-1.5">▸ {a.reasons[0]}</p>}
            </div>
          );
        })}
        {extras.some((s) => funds[s] === "loading") && (
          <p className="text-[12.5px] text-ink-2 mt-2">
            <Spinner /> fetching…
          </p>
        )}
        {extras.some((s) => (funds[s] === "error" || funds[s] === "throttled") && !catalogMer(s)) && (
          <p className="text-[12px] text-[#8a6100] mt-2">
            Some lookups failed - check the symbol (funds need the exchange suffix, e.g. .NS / .TO) or retry in a
            minute.
          </p>
        )}
      </Card>

      <p className="text-[11px] text-muted italic">
        Verdicts are mechanical starting points from public fee/size/duplication facts - not personal advice. MERs
        marked “approx” come from a hand-checked table (as of {MER_ASOF}); live Yahoo figures are used when present.
        Switching funds can realize capital gains - weigh tax against fees before acting.
      </p>
    </div>
  );
}

function bySymbolMer(m: Map<string, EtfAssessment>, symbol: string): number | undefined {
  return m.get(symbol.toUpperCase())?.effMer;
}
