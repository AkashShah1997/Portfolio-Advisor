"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  createChart,
  CrosshairMode,
  createSeriesMarkers,
  HistogramSeries,
  LineSeries,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type SeriesMarker,
  type SeriesType,
  type Time,
} from "lightweight-charts";
import type { AnalyzedHolding, Currency } from "@/lib/types";
import {
  HISTORY_RANGES,
  maCrossings,
  maLenForInterval,
  sma,
  type HistoryPayload,
  type HistoryRange,
} from "@/lib/history";
import { buildValuation } from "@/lib/valuation";
import { VERDICT_META } from "@/lib/portfolio";
import { currencyForSymbol, fmtMoney, fmtNum, fmtPct } from "@/lib/symbols";
import { Badge, Card, SectionTitle, Spinner } from "./ui";

/**
 * TradingView-style price chart (built on TradingView's open-source
 * lightweight-charts): candles or area, 6M→Max ranges, SMA 50/200, volume,
 * two-click trendline drawing, and - the value-investor twist - your average
 * cost, the rough fair-value estimate and the buy-below level drawn straight
 * on the price axis.
 */

const UP = "#1baf7a";
const DOWN = "#d03b3b";

interface TrendPoint {
  time: string;
  price: number;
}

function timeToStr(t: Time): string | null {
  if (typeof t === "string") return t;
  if (typeof t === "object" && t !== null && "year" in t) {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${t.year}-${p(t.month)}-${p(t.day)}`;
  }
  return null;
}

export function ChartPanel({ rows }: { rows: AnalyzedHolding[] }) {
  const symbols = useMemo(() => {
    const owned = rows.filter((r) => !r.holding.watch).map((r) => r.holding.yahooSymbol);
    const watch = rows.filter((r) => r.holding.watch).map((r) => r.holding.yahooSymbol);
    return { owned, watch };
  }, [rows]);

  const [symbol, setSymbol] = useState<string>(symbols.owned[0] ?? symbols.watch[0] ?? "");
  const [custom, setCustom] = useState("");
  const [range, setRange] = useState<HistoryRange>("1y");
  const [kind, setKind] = useState<"candles" | "area">("candles");
  const [sma50, setSma50] = useState(true);
  const [sma200, setSma200] = useState(true); // long-term default: both MAs on, crosses visible
  const [showVol, setShowVol] = useState(true);
  const [showLevels, setShowLevels] = useState(true);
  const [drawMode, setDrawMode] = useState(false);
  const [drawings, setDrawings] = useState<{ a: TrendPoint; b: TrendPoint }[]>([]);
  const [pending, setPending] = useState<TrendPoint | null>(null);
  const [payload, setPayload] = useState<HistoryPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [legend, setLegend] = useState<{ t: string; o: number; h: number; l: number; c: number } | null>(null);
  const [isDark, setIsDark] = useState(false);

  // follow the app theme (set on <html> by the TopBar toggle)
  useEffect(() => {
    const read = () => setIsDark(document.documentElement.dataset.theme === "dark");
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (!cancelled) read();
    })();
    window.addEventListener("pa-theme", read);
    return () => {
      cancelled = true;
      window.removeEventListener("pa-theme", read);
    };
  }, []);

  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const mainRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const allSeriesRef = useRef<ISeriesApi<SeriesType>[]>([]);
  const drawRef = useRef<{ mode: boolean; pending: TrendPoint | null }>({ mode: false, pending: null });
  const fitKeyRef = useRef<string>("");
  const fetchSeq = useRef(0);

  useEffect(() => {
    drawRef.current.mode = drawMode;
    drawRef.current.pending = pending;
  }, [drawMode, pending]);

  const row = useMemo(
    () => rows.find((r) => r.holding.yahooSymbol.toUpperCase() === symbol.toUpperCase()),
    [rows, symbol]
  );
  const cur = (row?.data?.quote.currency ?? currencyForSymbol(symbol || "X")) as Currency;
  const valuation = useMemo(
    () => (row?.data && row.scorecard ? buildValuation(row.data, row.scorecard) : undefined),
    [row]
  );

  // ---- data fetch ----
  useEffect(() => {
    if (!symbol) return;
    const seq = ++fetchSeq.current;
    let cancelled = false;
    (async () => {
      await Promise.resolve(); // yield so state updates happen asynchronously
      if (cancelled || seq !== fetchSeq.current) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/history/${encodeURIComponent(symbol)}?range=${range}`);
        const j = (await res.json()) as HistoryPayload & { error?: string };
        if (cancelled || seq !== fetchSeq.current) return;
        if (!res.ok || !j.candles) throw new Error(j.error ?? `HTTP ${res.status}`);
        setPayload(j);
        setLoading(false);
      } catch (e) {
        if (cancelled || seq !== fetchSeq.current) return;
        setPayload(null);
        setError((e as Error).message);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [symbol, range]);

  // ---- chart lifecycle (create once) ----
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const T = isDark
      ? { bg: "#1c1c21", text: "#b6b5ae", grid: "#26262c", border: "#3a3a42" }
      : { bg: "#fcfcfb", text: "#52514e", grid: "#efeee9", border: "#e1e0d9" };
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: T.bg },
        textColor: T.text,
        attributionLogo: true,
      },
      grid: {
        vertLines: { color: T.grid },
        horzLines: { color: T.grid },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: T.border },
      timeScale: { borderColor: T.border },
    });
    chartRef.current = chart;

    chart.subscribeClick((param: MouseEventParams) => {
      const { mode, pending: pend } = drawRef.current;
      if (!mode || !param.point || param.time === undefined || !mainRef.current) return;
      const price = mainRef.current.coordinateToPrice(param.point.y);
      const time = timeToStr(param.time);
      if (price === null || time === null) return;
      const pt: TrendPoint = { time, price: price as number };
      if (!pend) {
        setPending(pt);
      } else if (pend.time !== pt.time) {
        const [a, b] = pend.time < pt.time ? [pend, pt] : [pt, pend];
        setDrawings((d) => [...d, { a, b }]);
        setPending(null);
      }
    });

    chart.subscribeCrosshairMove((param: MouseEventParams) => {
      if (!param.time || !mainRef.current) {
        setLegend(null);
        return;
      }
      const d = param.seriesData.get(mainRef.current) as
        | { open?: number; high?: number; low?: number; close?: number; value?: number }
        | undefined;
      const t = timeToStr(param.time) ?? "";
      if (d && d.close !== undefined && d.open !== undefined) {
        setLegend({ t, o: d.open, h: d.high ?? d.close, l: d.low ?? d.close, c: d.close });
      } else if (d && d.value !== undefined) {
        setLegend({ t, o: d.value, h: d.value, l: d.value, c: d.value });
      }
    });

    return () => {
      chart.remove();
      chartRef.current = null;
      mainRef.current = null;
      allSeriesRef.current = [];
    };
  }, [isDark]);

  // ---- (re)build series whenever inputs change ----
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    for (const s of allSeriesRef.current) {
      try {
        chart.removeSeries(s);
      } catch {
        /* already gone */
      }
    }
    allSeriesRef.current = [];
    mainRef.current = null;
    if (!payload || payload.candles.length === 0) return;

    const candles = payload.candles;

    // main series
    let main: ISeriesApi<SeriesType>;
    if (kind === "candles") {
      main = chart.addSeries(CandlestickSeries, {
        upColor: UP,
        downColor: DOWN,
        borderVisible: false,
        wickUpColor: UP,
        wickDownColor: DOWN,
      });
      main.setData(
        candles.map((c) => ({ time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close }))
      );
    } else {
      main = chart.addSeries(AreaSeries, {
        lineColor: "#2a78d6",
        topColor: "rgba(42,120,214,0.22)",
        bottomColor: "rgba(42,120,214,0.02)",
        lineWidth: 2,
      });
      main.setData(candles.map((c) => ({ time: c.time as Time, value: c.close })));
    }
    main.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: showVol ? 0.24 : 0.08 } });
    mainRef.current = main;
    allSeriesRef.current.push(main);

    // volume
    if (showVol && candles.some((c) => (c.volume ?? 0) > 0)) {
      const vol = chart.addSeries(HistogramSeries, {
        priceScaleId: "vol",
        priceFormat: { type: "volume" },
        lastValueVisible: false,
        priceLineVisible: false,
      });
      vol.setData(
        candles.map((c) => ({
          time: c.time as Time,
          value: c.volume ?? 0,
          color: c.close >= c.open ? "rgba(27,175,122,0.32)" : "rgba(208,59,59,0.32)",
        }))
      );
      chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });
      allSeriesRef.current.push(vol);
    }

    // moving averages
    // moving averages in DAY-equivalents per interval: on weekly candles the
    // "200-day MA" is the 40-week MA - so golden/death crosses actually show
    // on the long-range views a 5-year holder cares about.
    const len50 = maLenForInterval(50, payload.interval);
    const len200 = maLenForInterval(200, payload.interval);
    const addSma = (len: number, color: string) => {
      const data = sma(candles, len);
      if (data.length < 2) return;
      const s = chart.addSeries(LineSeries, {
        color,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      s.setData(data.map((d) => ({ time: d.time as Time, value: d.value })));
      allSeriesRef.current.push(s);
    };
    if (sma50) addSma(len50, "#2a78d6");
    if (sma200) addSma(len200, "#eb6834");

    // golden / death cross markers where the 50-day crosses the 200-day
    if (sma50 && sma200) {
      const crosses = maCrossings(candles, len50, len200);
      if (crosses.length) {
        const markers: SeriesMarker<Time>[] = crosses.map((c) => ({
          time: c.time as Time,
          position: c.kind === "golden" ? "belowBar" : "aboveBar",
          color: c.kind === "golden" ? "#1baf7a" : "#d03b3b",
          shape: c.kind === "golden" ? "arrowUp" : "arrowDown",
          text: c.kind === "golden" ? "Golden cross" : "Death cross",
        }));
        createSeriesMarkers(main, markers);
      }
    }

    // trendline drawings
    for (const d of drawings) {
      const s = chart.addSeries(LineSeries, {
        color: isDark ? "#f0efe9" : "#0b0b0b",
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      s.setData([
        { time: d.a.time as Time, value: d.a.price },
        { time: d.b.time as Time, value: d.b.price },
      ]);
      allSeriesRef.current.push(s);
    }

    // value-investor levels on the price axis
    if (showLevels) {
      if (row && !row.holding.watch && row.holding.avgCost > 0) {
        main.createPriceLine({
          price: row.holding.avgCost,
          color: "#898781",
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: "your avg",
        });
      }
      if (valuation?.intrinsic !== undefined) {
        main.createPriceLine({
          price: valuation.intrinsic,
          color: "#2a78d6",
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: "fair est.",
        });
      }
      if (valuation?.buyBelow !== undefined) {
        main.createPriceLine({
          price: valuation.buyBelow,
          color: "#0ca30c",
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: "buy below",
        });
      }
    }

    const fitKey = `${payload.symbol}|${payload.range}`;
    if (fitKeyRef.current !== fitKey) {
      fitKeyRef.current = fitKey;
      chart.timeScale().fitContent();
    }
  }, [payload, kind, sma50, sma200, showVol, showLevels, drawings, row, valuation, isDark]);

  const last = payload?.candles[payload.candles.length - 1];
  const first = payload?.candles[0];
  const shown = legend ?? (last ? { t: last.time, o: last.open, h: last.high, l: last.low, c: last.close } : null);
  const rangePct = first && last && first.close > 0 ? last.close / first.close - 1 : undefined;
  const vm = row?.scorecard ? VERDICT_META[row.scorecard.verdict] : undefined;

  const loadCustom = () => {
    const s = custom.trim().toUpperCase();
    if (s) {
      setSymbol(s);
      setDrawings([]);
      setPending(null);
    }
  };

  return (
    <Card className="p-4">
      <SectionTitle sub="TradingView's open-source charting, with the value-investor levels drawn on: your average cost, the rough fair-value estimate, and the buy-below line. Two clicks draw a trendline.">
        Price chart
      </SectionTitle>

      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 text-[12.5px] no-print">
        <select
          value={symbols.owned.includes(symbol) || symbols.watch.includes(symbol) ? symbol : "__custom"}
          onChange={(e) => {
            if (e.target.value !== "__custom") {
              setSymbol(e.target.value);
              setDrawings([]);
              setPending(null);
            }
          }}
          className="bg-page hairline rounded-lg px-2 py-1.5 font-medium"
          aria-label="Symbol"
        >
          {symbols.owned.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
          {symbols.watch.length > 0 && (
            <optgroup label="Watchlist">
              {symbols.watch.map((s) => (
                <option key={s} value={s}>
                  ☆ {s}
                </option>
              ))}
            </optgroup>
          )}
          {!symbols.owned.includes(symbol) && !symbols.watch.includes(symbol) && symbol && (
            <option value="__custom">{symbol}</option>
          )}
        </select>

        <span className="inline-flex items-center gap-1">
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loadCustom()}
            placeholder="any symbol… e.g. NESTLEIND.NS"
            className="bg-page hairline rounded-lg px-2 py-1.5 w-[170px]"
          />
          <button onClick={loadCustom} className="text-series-1 font-medium hover:underline px-1">
            load
          </button>
        </span>

        <span className="flex rounded-lg overflow-hidden hairline">
          {HISTORY_RANGES.map((r) => (
            <button
              key={r.id}
              onClick={() => setRange(r.id)}
              className={`px-2.5 py-1 font-medium ${range === r.id ? "bg-series-1 text-white" : "bg-surface text-ink-2 hover:bg-page"}`}
            >
              {r.label}
            </button>
          ))}
        </span>

        <span className="flex rounded-lg overflow-hidden hairline">
          {(["candles", "area"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`px-2.5 py-1 font-medium capitalize ${kind === k ? "bg-series-1 text-white" : "bg-surface text-ink-2 hover:bg-page"}`}
            >
              {k}
            </button>
          ))}
        </span>

        <label className="inline-flex items-center gap-1.5 text-ink-2">
          <input type="checkbox" checked={sma50} onChange={(e) => setSma50(e.target.checked)} className="accent-[#2a78d6]" />
          <span className="inline-block w-3 h-[3px] rounded" style={{ background: "#2a78d6" }} /> 50-day MA
        </label>
        <label className="inline-flex items-center gap-1.5 text-ink-2">
          <input type="checkbox" checked={sma200} onChange={(e) => setSma200(e.target.checked)} className="accent-[#eb6834]" />
          <span
            className="inline-block w-3 h-[3px] rounded"
            style={{ background: "#eb6834" }}
            title="Day-equivalent on every range (40-week MA on weekly data) - golden/death crosses are marked on the chart"
          />{" "}
          200-day MA
        </label>
        <label className="inline-flex items-center gap-1.5 text-ink-2">
          <input type="checkbox" checked={showVol} onChange={(e) => setShowVol(e.target.checked)} className="accent-[#2a78d6]" />
          Volume
        </label>
        <label className="inline-flex items-center gap-1.5 text-ink-2">
          <input type="checkbox" checked={showLevels} onChange={(e) => setShowLevels(e.target.checked)} className="accent-[#2a78d6]" />
          Value levels
        </label>

        <span className="ml-auto flex items-center gap-2">
          <button
            onClick={() => {
              setDrawMode((v) => !v);
              setPending(null);
            }}
            className={`rounded-lg px-2.5 py-1 font-medium border ${
              drawMode ? "bg-series-2 text-white border-series-2" : "bg-surface hairline text-ink-2 hover:bg-page"
            }`}
            title="Click two points on the chart to draw a trendline"
          >
            ✏ {drawMode ? (pending ? "click 2nd point…" : "click 1st point…") : "Draw trendline"}
          </button>
          {drawings.length > 0 && (
            <button onClick={() => setDrawings([])} className="text-ink-2 hover:underline">
              clear ({drawings.length})
            </button>
          )}
        </span>
      </div>

      {/* legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-[12.5px] tnum">
        <span className="font-semibold text-[14px]">{symbol || "–"}</span>
        {shown && (
          <>
            <span className="text-muted">{shown.t}</span>
            <span className="text-ink-2">
              O <strong className="text-ink">{fmtNum(shown.o)}</strong> H{" "}
              <strong className="text-ink">{fmtNum(shown.h)}</strong> L{" "}
              <strong className="text-ink">{fmtNum(shown.l)}</strong> C{" "}
              <strong className={shown.c >= shown.o ? "text-success-text" : "text-status-critical"}>
                {fmtNum(shown.c)}
              </strong>
            </span>
          </>
        )}
        {rangePct !== undefined && (
          <Badge tone={rangePct >= 0 ? "good" : "critical"}>
            {rangePct >= 0 ? "+" : ""}
            {fmtPct(rangePct)} over {HISTORY_RANGES.find((r) => r.id === range)?.label}
          </Badge>
        )}
        {payload && (
          <span className="text-[11px] text-muted">
            {payload.interval === "1d" ? "daily" : payload.interval === "1wk" ? "weekly" : "monthly"} bars
            {payload.mock ? " · demo data" : ""}
          </span>
        )}
        {loading && <Spinner />}
      </div>

      {/* chart */}
      <div className="relative mt-2 rounded-xl overflow-hidden hairline" style={{ height: 430 }}>
        <div ref={containerRef} className="absolute inset-0" data-testid="price-chart" />
        {error && (
          <div className="absolute inset-0 grid place-items-center bg-surface/80 text-[13px] text-status-critical">
            {error} - check the symbol and try again.
          </div>
        )}
        {!symbol && (
          <div className="absolute inset-0 grid place-items-center bg-surface/80 text-[13px] text-muted">
            Add holdings or type a symbol to chart it.
          </div>
        )}
      </div>

      {/* context strip */}
      {row?.scorecard && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 text-[12.5px]">
          {vm && (
            <Badge tone={vm.tone} icon={vm.icon}>
              {vm.label} · {row.scorecard.totalScore}/100
            </Badge>
          )}
          {valuation?.intrinsic !== undefined && (
            <span className="text-ink-2 tnum">
              Fair est. <strong className="text-ink">{fmtMoney(valuation.intrinsic, cur, true)}</strong> · buy
              below <strong className="text-success-text">{fmtMoney(valuation.buyBelow, cur, true)}</strong>
            </span>
          )}
          {!row.holding.watch && row.holding.avgCost > 0 && (
            <span className="text-ink-2 tnum">
              Your avg <strong className="text-ink">{fmtMoney(row.holding.avgCost, cur, true)}</strong>
            </span>
          )}
          <span className="text-[11px] text-muted italic ml-auto">
            A value investor charts to find patience, not patterns - the levels matter more than the wiggles.
          </span>
        </div>
      )}
    </Card>
  );
}
