"use client";

import { useMemo } from "react";
import type { AnalyzedHolding, Currency, Holding } from "@/lib/types";
import { buildJourney, type JourneyRow } from "@/lib/journey";
import { fmtMoney, fmtNum, fmtPct } from "@/lib/symbols";
import { Badge } from "./ui";

/**
 * "Since you bought" - fundamentals at purchase vs today, with a plain
 * verdict: improving business, dead money, or deserved decline.
 */

const TONE_BADGE: Record<string, "good" | "neutral" | "warning" | "critical"> = {
  good: "good",
  neutral: "neutral",
  warning: "warning",
  critical: "critical",
};

function fmtVal(v: number | undefined, kind: JourneyRow["kind"], cur: Currency): string {
  if (v === undefined) return "–";
  switch (kind) {
    case "money":
      return fmtMoney(v, cur, true);
    case "pct":
      return fmtPct(v);
    case "x":
      return `${fmtNum(v, v >= 10 ? 1 : 2)}x`;
    default:
      return fmtNum(v, Math.abs(v) >= 100 ? 0 : 2);
  }
}

export function Journey({
  row,
  onPatchHolding,
}: {
  row: AnalyzedHolding;
  onPatchHolding?: (patch: Partial<Holding>) => void;
}) {
  const j = useMemo(() => buildJourney(row), [row]);
  const cur = (row.data?.quote.currency ?? row.holding.currency) as Currency;
  const hasTtm = !!j?.rows.some((r) => r.ttm !== undefined);
  if (!j) return null;

  const [y, m] = j.sinceYM.split("-");
  const monthLabel = new Date(Number(y), Number(m) - 1, 1).toLocaleString("en", {
    month: "short",
    year: "numeric",
  });

  return (
    <div className="rounded-lg bg-page hairline p-3">
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <span className="text-[12px] font-semibold text-ink-2">Since you bought</span>
        <Badge tone="neutral">
          ≈ {monthLabel}
          {j.atWindowEdge ? " or earlier" : ""}
        </Badge>
        {j.estimated && (
          <span className="text-[11px] text-muted">estimated from your avg cost - correct it:</span>
        )}
        {!j.estimated && <span className="text-[11px] text-muted">set by you:</span>}
        <input
          type="month"
          value={j.sinceYM}
          onChange={(e) => e.target.value && onPatchHolding?.({ buyDate: e.target.value })}
          className="bg-surface hairline rounded px-1.5 py-[2px] text-[11.5px] no-print"
          aria-label="When you bought this position"
        />
        {j.priceCagrSince !== undefined && (
          <Badge tone={j.priceCagrSince >= 0.05 ? "good" : "warning"}>
            price {j.priceCagrSince >= 0 ? "+" : ""}
            {fmtPct(j.priceCagrSince)}/yr since
          </Badge>
        )}
        <span className="text-[11px] text-muted ml-auto tnum">
          FY{String(j.thenYear).slice(2)} → FY{String(j.nowYear).slice(2)} (last filed)
          {hasTtm ? " + TTM" : ""} · {j.improved}▲ {j.worsened}▼
        </span>
      </div>

      {j.awaitingLatestFy && (
        <p className="text-[11.5px] text-muted leading-snug mb-1.5">
          FY{String(j.nowYear).slice(2)} is the newest ANNUAL report filed for this company - FY
          {String(j.pendingFy).slice(2)} statements are not published yet (companies file months after their
          fiscal year ends, and free data adds a little more lag).
          {hasTtm
            ? " The “Today (TTM)” column is the live trailing-twelve-month figure, so you can see what has happened since."
            : " Yahoo publishes no trailing-twelve-month figures for this one, so the last filed year is the freshest honest number."}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="text-[12px] w-full max-w-[620px]">
          <thead>
            <tr className="text-left text-muted border-b border-grid">
              <th className="py-1 pr-3 font-medium">Fundamental</th>
              <th className="py-1 pr-3 font-medium text-right">Then (FY{String(j.thenYear).slice(2)})</th>
              <th className="py-1 pr-3 font-medium text-right">
                Last filed (FY{String(j.nowYear).slice(2)})
              </th>
              {hasTtm && <th className="py-1 pr-3 font-medium text-right">Today (TTM)</th>}
              <th className="py-1 font-medium text-right">Trend</th>
            </tr>
          </thead>
          <tbody>
            {j.rows.map((r) => (
              <tr key={r.key} className="border-b border-grid/50">
                <td className="py-1 pr-3 text-ink-2">
                  {r.label}
                  {r.neutral && <span className="text-muted"> (valuation)</span>}
                </td>
                <td className="py-1 pr-3 tnum text-right text-ink-2">{fmtVal(r.then, r.kind, cur)}</td>
                <td className="py-1 pr-3 tnum text-right text-ink font-medium">{fmtVal(r.now, r.kind, cur)}</td>
                {hasTtm && (
                  <td className="py-1 pr-3 tnum text-right text-ink-2">
                    {r.ttm !== undefined ? fmtVal(r.ttm, r.kind, cur) : "–"}
                  </td>
                )}
                <td className="py-1 text-right">
                  {r.better === true && <span className="text-success-text font-bold">▲ better</span>}
                  {r.better === false && <span className="text-status-critical font-bold">▼ worse</span>}
                  {r.better === undefined && <span className="text-muted">- flat</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p
        className={`text-[12.5px] mt-2 ${
          j.verdict.tone === "good"
            ? "text-success-text"
            : j.verdict.tone === "critical"
              ? "text-status-critical"
              : j.verdict.tone === "warning"
                ? "text-[#8a6100]"
                : "text-ink-2"
        }`}
      >
        <Badge tone={TONE_BADGE[j.verdict.tone]}>{j.improved}▲ / {j.worsened}▼</Badge>{" "}
        {j.verdict.line}
      </p>
      <p className="text-[10.5px] text-muted italic mt-1">
        Fiscal-year fundamentals from free Yahoo data; the buy month is {j.estimated ? "an estimate from your average cost" : "the month you set"}.
        Lynch: “Know what you own, and know why you own it” - this table is the “why” checked against time.
      </p>
    </div>
  );
}
