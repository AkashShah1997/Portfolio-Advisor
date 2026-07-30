"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AnalyzedHolding, Currency, FxRates } from "@/lib/types";
import { portfolioGrowthGuess, project, yearsToMultiple } from "@/lib/project";
import { fmtMoney, fmtPct } from "@/lib/symbols";
import { Badge, Card, SectionTitle } from "./ui";
import { compactMoney } from "./charts";
import { AnimatedNumber, FadeUp } from "./anim";

type Scenario = "conservative" | "base" | "optimistic";

const SCENARIO_LABEL: Record<Scenario, string> = {
  conservative: "Conservative",
  base: "Base",
  optimistic: "Optimistic",
};

interface TipPayload {
  name?: string | number;
  value?: number | string;
  color?: string;
}
function Tip({ active, payload, label, base }: { active?: boolean; payload?: TipPayload[]; label?: string | number; base: Currency }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface hairline rounded-lg px-3 py-2 shadow-sm text-[12px]">
      <div className="text-ink-2 mb-1">Year {String(label ?? "")}</div>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="inline-block w-3 h-[2.5px] rounded" style={{ background: p.color ?? "#2a78d6" }} aria-hidden />
          <span className="font-semibold text-ink tnum">
            {typeof p.value === "number" ? fmtMoney(p.value, base, true) : p.value}
          </span>
          <span className="text-ink-2">{String(p.name ?? "")}</span>
        </div>
      ))}
    </div>
  );
}

export function Projector({
  rows,
  fx,
  base,
  startValue,
}: {
  rows: AnalyzedHolding[];
  fx: FxRates;
  base: Currency;
  startValue: number;
}) {
  const guess = useMemo(() => portfolioGrowthGuess(rows, fx), [rows, fx]);
  const [scenario, setScenario] = useState<Scenario>("base");
  const [years, setYears] = useState(10);
  const [monthly, setMonthly] = useState(0);

  const monthlyMax = base === "INR" ? 200000 : 5000;
  const monthlyStep = base === "INR" ? 5000 : 100;

  const growth = guess[scenario];
  const totalReturn = growth + guess.divYield; // dividends assumed reinvested
  const series = useMemo(
    () => project(startValue, years, monthly, totalReturn),
    [startValue, years, monthly, totalReturn]
  );
  const final = series[series.length - 1];
  const at = (y: number) => series.find((p) => p.year === y);
  const double = yearsToMultiple(2, totalReturn);

  return (
    <Card className="p-4">
      <SectionTitle sub="An illustration of what “buy right, sit tight” could mean — not a forecast. Real returns arrive lumpy; the plan is surviving the lumps without selling.">
        The sit-tight projector
      </SectionTitle>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="flex rounded-lg overflow-hidden hairline">
          {(Object.keys(SCENARIO_LABEL) as Scenario[]).map((s) => (
            <button
              key={s}
              onClick={() => setScenario(s)}
              className={`px-3 py-1 text-[12.5px] font-medium ${
                scenario === s ? "bg-series-1 text-white" : "bg-surface text-ink-2 hover:bg-page"
              }`}
            >
              {SCENARIO_LABEL[s]} {fmtPct(guess[s] + guess.divYield, 1)}
            </button>
          ))}
        </div>
        <label className="text-[12.5px] text-ink-2 flex items-center gap-2">
          Horizon
          <input
            type="range"
            min={5}
            max={30}
            step={1}
            value={years}
            onChange={(e) => setYears(Number(e.target.value))}
            className="accent-[#2a78d6] w-[140px]"
          />
          <strong className="text-ink tnum w-[46px]">{years} yrs</strong>
        </label>
        <label className="text-[12.5px] text-ink-2 flex items-center gap-2">
          Adding monthly
          <input
            type="range"
            min={0}
            max={monthlyMax}
            step={monthlyStep}
            value={monthly}
            onChange={(e) => setMonthly(Number(e.target.value))}
            className="accent-[#2a78d6] w-[140px]"
          />
          <strong className="text-ink tnum">{fmtMoney(monthly, base, true)}</strong>
        </label>
      </div>

      <p className="text-[11.5px] text-muted mt-2">
        Scenario return = value-weighted EPS growth of your scored holdings ({fmtPct(guess.base, 1)}{" "}
        base, clamped){guess.divYield > 0.0005 ? ` + ${fmtPct(guess.divYield, 1)} dividends reinvested` : ""}{" "}
        — conservative runs it at 60%, optimistic at 125%.
      </p>

      <div className="grid md:grid-cols-[1fr_240px] gap-4 mt-4 items-start">
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={series} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
            <CartesianGrid stroke="#e1e0d9" strokeWidth={1} vertical={false} />
            <XAxis
              dataKey="year"
              tickLine={false}
              axisLine={{ stroke: "#c3c2b7", strokeWidth: 1 }}
              tickFormatter={(v: number) => (v === 0 ? "now" : `${v}y`)}
            />
            <YAxis
              width={64}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => compactMoney(v, base)}
            />
            <Tooltip content={<Tip base={base} />} cursor={{ stroke: "#c3c2b7", strokeWidth: 1 }} />
            <Line
              type="monotone"
              dataKey="value"
              name="Portfolio value"
              stroke="#2a78d6"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4, fill: "#2a78d6", stroke: "#fcfcfb", strokeWidth: 2 }}
            />
            <Line
              type="monotone"
              dataKey="invested"
              name="Money put in"
              stroke="#898781"
              strokeWidth={1.5}
              strokeDasharray="5 4"
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>

        <div className="space-y-3">
          <FadeUp mode="mount">
            <div className="rounded-xl bg-page hairline px-4 py-3">
              <div className="text-[12px] text-ink-2">In {years} years ({SCENARIO_LABEL[scenario].toLowerCase()})</div>
              <div className="text-[26px] font-semibold text-ink tnum leading-tight">
                <AnimatedNumber value={final.value} format={(v) => fmtMoney(v, base, true)} />
              </div>
              <div className="text-[12px] text-ink-2 mt-0.5">
                = <strong className="text-ink tnum">{(final.value / Math.max(1, final.invested)).toFixed(1)}×</strong> the{" "}
                {fmtMoney(final.invested, base, true)} put in
              </div>
            </div>
          </FadeUp>
          <div className="flex flex-wrap gap-1.5">
            {at(5) && <Badge tone="neutral">5y ≈ {fmtMoney(at(5)!.value, base, true)}</Badge>}
            {years >= 10 && at(10) && <Badge tone="neutral">10y ≈ {fmtMoney(at(10)!.value, base, true)}</Badge>}
            {double !== undefined && (
              <Badge tone="good">doubles ≈ every {double.toFixed(1)} yrs</Badge>
            )}
          </div>
          <p className="text-[11px] text-muted italic leading-relaxed">
            “The big money is not in the buying and selling, but in the waiting.” — Charlie Munger.
            The projector&apos;s real output isn&apos;t the number — it&apos;s the cost of interrupting it.
          </p>
        </div>
      </div>
    </Card>
  );
}
