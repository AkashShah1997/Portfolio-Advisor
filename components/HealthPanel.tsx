"use client";

import { useMemo } from "react";
import type { AnalyzedHolding, Currency, FxRates } from "@/lib/types";
import { computeHealth, computeIncome, activeRows, type HealthStatus } from "@/lib/health";
import { toBase } from "@/lib/portfolio";
import { fmtMoney, fmtPct, CURRENCY_SYMBOL } from "@/lib/symbols";
import { Badge, Card, InfoTip, SectionTitle } from "./ui";
import { HBars, StackedSplit } from "./charts";
import { AnimatedNumber, Stagger, StaggerItem } from "./anim";

const STATUS_UI: Record<HealthStatus, { icon: string; cls: string }> = {
  pass: { icon: "✓", cls: "text-success-text" },
  warn: { icon: "!", cls: "text-[#8a6100]" },
  fail: { icon: "✕", cls: "text-status-critical" },
  info: { icon: "ⓘ", cls: "text-series-1" },
};

/** Plain-language tooltips for the checks that carry jargon. */
const CHECK_INFO: Record<string, string> = {
  top1: "topHolding",
  top3: "topHolding",
  hhi: "hhi",
  sector: "sectorConc",
};

export function HealthPanel({
  rows,
  fx,
  base,
}: {
  rows: AnalyzedHolding[];
  fx: FxRates;
  base: Currency;
}) {
  const checks = useMemo(() => computeHealth(rows, fx), [rows, fx]);
  const income = useMemo(() => computeIncome(rows, fx), [rows, fx]);

  const byCurrency = useMemo(() => {
    const m = new Map<Currency, number>();
    for (const r of activeRows(rows)) {
      const v = toBase(r.currentValue ?? r.invested, r.holding.currency, fx);
      m.set(r.holding.currency, (m.get(r.holding.currency) ?? 0) + v);
    }
    return [...m.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }, [rows, fx]);

  const passCount = checks.filter((c) => c.status === "pass").length;
  const gradeable = checks.filter((c) => c.status !== "info").length;

  return (
    <div className="grid lg:grid-cols-2 gap-4 items-start">
      <Card className="p-4">
        <SectionTitle sub="Construction-level tests the masters apply before looking at any single stock.">
          Portfolio health checks{" "}
          <span className="text-[12px] font-normal text-muted">
            - {passCount}/{gradeable} passing
          </span>
        </SectionTitle>
        <Stagger mode="mount">
          <ul className="space-y-2.5">
            {checks.map((c) => {
              const s = STATUS_UI[c.status];
              return (
                <StaggerItem key={c.id}>
                  <li className="flex gap-2 text-[12.5px] leading-snug">
                    <span className={`${s.cls} font-bold w-3.5 shrink-0`} aria-label={c.status}>
                      {s.icon}
                    </span>
                    <span>
                      <span className="text-ink">{c.label}</span>
                      {CHECK_INFO[c.id] && (
                        <>
                          {" "}
                          <InfoTip k={CHECK_INFO[c.id]} />
                        </>
                      )}{" "}
                      <span className="text-ink-2">- {c.detail}</span>
                      <span className="block text-[11px] text-muted italic">{c.principle}</span>
                    </span>
                  </li>
                </StaggerItem>
              );
            })}
          </ul>
        </Stagger>
      </Card>

      <div className="space-y-4">
        <Card className="p-4">
          <SectionTitle sub="Estimated from current prices and trailing yields - the only cash a minority owner sees before selling.">
            Dividend income
          </SectionTitle>
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-[28px] font-semibold text-ink tnum leading-none">
              <AnimatedNumber
                value={income.total}
                format={(v) => fmtMoney(v, base, true)}
              />
            </span>
            <span className="text-[12.5px] text-ink-2">per year, before tax</span>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {income.yieldOnValue !== undefined && (
              <Badge tone="neutral">yield on value {fmtPct(income.yieldOnValue)}</Badge>
            )}
            {income.yieldOnCost !== undefined && (
              <Badge tone="good">yield on cost {fmtPct(income.yieldOnCost)}</Badge>
            )}
            <Badge tone="muted">{income.payers} paying holdings</Badge>
          </div>
          {income.byHolding.length > 0 && (
            <div className="mt-3">
              <HBars
                items={income.byHolding.slice(0, 8)}
                format={(v) => fmtMoney(v, base, true)}
                maxBars={8}
              />
            </div>
          )}
          <p className="text-[11px] text-muted italic mt-3">
            “Do you know the only thing that gives me pleasure? It&apos;s to see my dividends coming
            in.” - John D. Rockefeller (quoted approvingly by more than one master)
          </p>
        </Card>

        <Card className="p-4">
          <SectionTitle sub={`What your wealth is denominated in (converted to ${CURRENCY_SYMBOL[base]}${base}).`}>
            Currency exposure
          </SectionTitle>
          <StackedSplit
            items={byCurrency.map((c) => ({ label: c.label, value: c.value }))}
            format={(v) => fmtMoney(v, base, true)}
          />
          <p className="text-[11.5px] text-ink-2 mt-2">
            A 5-year horizon smooths FX noise, but structural currency moves compound too - INR has
            historically depreciated against USD/CAD over long periods. Diversified earnings
            currencies are a quiet margin of safety.
          </p>
        </Card>
      </div>
    </div>
  );
}
