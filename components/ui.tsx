"use client";

import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { METRIC_INFO } from "@/lib/glossary";

export function Card({
  children,
  className = "",
  flat = false,
}: {
  children: ReactNode;
  className?: string;
  flat?: boolean;
}) {
  return (
    <div className={`bg-surface hairline rounded-2xl ${flat ? "" : "elev-1"} ${className}`}>{children}</div>
  );
}

export function SectionTitle({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-[15px] font-semibold text-ink">{children}</h2>
      {sub && <p className="text-[12.5px] text-ink-2 mt-0.5">{sub}</p>}
    </div>
  );
}

/** Stat tile per dataviz contract: label · value · optional delta vs a named thing. */
export function StatTile({
  label,
  value,
  delta,
  deltaGood,
  hero = false,
}: {
  label: string;
  value: ReactNode;
  delta?: string;
  deltaGood?: boolean;
  hero?: boolean;
}) {
  return (
    <Card className="px-4 py-3 flex-1 min-w-[150px]">
      <div className="text-[12px] text-ink-2">{label}</div>
      <div className={`${hero ? "text-[30px]" : "text-[21px]"} font-semibold text-ink leading-tight mt-0.5 tnum`}>
        {value}
      </div>
      {delta !== undefined && (
        <div className={`text-[12px] mt-0.5 font-medium ${deltaGood ? "text-success-text" : "text-status-critical"}`}>
          {delta}
        </div>
      )}
    </Card>
  );
}

const TONE_STYLES: Record<string, string> = {
  good: "text-success-text border-status-good/40 bg-status-good/8",
  neutral: "text-ink-2 border-baseline bg-page",
  warning: "text-[#8a6100] border-status-warning/50 bg-status-warning/10",
  serious: "text-[#9c4a26] border-status-serious/50 bg-status-serious/10",
  critical: "text-status-critical border-status-critical/40 bg-status-critical/8",
  muted: "text-muted border-grid bg-page",
};

export function Badge({
  tone = "neutral",
  icon,
  children,
}: {
  tone?: keyof typeof TONE_STYLES;
  icon?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 border rounded-full px-2 py-[1px] text-[11.5px] font-medium whitespace-nowrap ${TONE_STYLES[tone]}`}
    >
      {icon && <span aria-hidden>{icon}</span>}
      {children}
    </span>
  );
}

export function Spinner() {
  return (
    <span
      className="inline-block w-3.5 h-3.5 border-2 border-baseline border-t-series-1 rounded-full animate-spin align-middle"
      aria-label="loading"
    />
  );
}

/**
 * InfoTip — the ⓘ beside a metric. Hover or keyboard-focus opens a small card
 * explaining what the ratio means and which direction is better (from
 * lib/glossary). Rendered through a portal with fixed positioning so it never
 * gets clipped by scrollable tables or card overflow. Fully accessible: the
 * trigger is focusable and carries the whole explanation as its aria-label.
 */
export function InfoTip({ k, className = "" }: { k: string; className?: string }) {
  const info = METRIC_INFO[k];
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number; below: boolean } | null>(null);

  if (!info) return null;

  const show = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const below = r.top < 190; // not enough room above → open downward
    const half = 138;
    setPos({
      x: Math.min(Math.max(r.left + r.width / 2, half + 8), window.innerWidth - half - 8),
      y: below ? r.bottom + 8 : r.top - 8,
      below,
    });
  };
  const hide = () => setPos(null);

  return (
    <>
      <span
        ref={ref}
        tabIndex={0}
        role="note"
        aria-label={`${info.name}. ${info.what} ${info.better}`}
        data-infotip={k}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        className={`inline-flex items-center justify-center w-[15px] h-[15px] rounded-full text-[10px] leading-none font-semibold normal-case tracking-normal align-[1px] cursor-help select-none text-muted hover:text-series-1 hover:bg-series-1/10 focus:text-series-1 focus:bg-series-1/10 focus:outline-none border border-current/40 no-print ${className}`}
      >
        i
      </span>
      {pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="tooltip"
            className="fixed z-[95] w-[276px] bg-surface hairline rounded-xl elev-2 p-3 text-left normal-case tracking-normal pointer-events-none"
            style={{
              left: pos.x,
              top: pos.y,
              transform: `translate(-50%, ${pos.below ? "0" : "-100%"})`,
            }}
          >
            <div className="text-[12px] font-semibold text-ink leading-snug">{info.name}</div>
            <p className="text-[11.5px] text-ink-2 leading-snug mt-1 whitespace-normal font-normal">{info.what}</p>
            <p className="text-[11.5px] leading-snug mt-1.5 whitespace-normal font-medium text-success-text">
              {info.better}
            </p>
          </div>,
          document.body
        )}
    </>
  );
}

/** Meter: animated fill + lighter same-ramp track (per dataviz figure spec). */
export function Meter({ value, max = 100 }: { value: number; max?: number }) {
  const pct = Math.max(0, Math.min(1, value / max));
  return (
    <div
      className="h-2 rounded-full bg-series-1-track overflow-hidden"
      role="meter"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      <motion.div
        className="h-full rounded-full bg-series-1"
        initial={{ width: 0 }}
        whileInView={{ width: `${pct * 100}%` }}
        viewport={{ once: true }}
        transition={{ duration: 0.7, ease: [0.22, 0.61, 0.36, 1] }}
      />
    </div>
  );
}
