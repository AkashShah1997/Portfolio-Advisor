"use client";

import { useEffect, useMemo, useState } from "react";
import type { AnalyzedHolding, Currency, FxRates, PortfolioSummary } from "@/lib/types";
import { buildPrompt, estimateTokens, FOCUS_META, type PromptFocus } from "@/lib/promptgen";
import { loadUiFlag, saveUiFlag } from "@/lib/store";
import { Badge, Card, SectionTitle } from "./ui";
import { Collapse } from "./anim";

type Scope = "portfolio" | "selected";

export function PromptGenerator({
  rows,
  summary,
  fx,
  baseCurrency,
}: {
  rows: AnalyzedHolding[];
  summary: PortfolioSummary;
  fx: FxRates;
  baseCurrency: Currency;
}) {
  const [scope, setScope] = useState<Scope>("portfolio");
  const [focus, setFocus] = useState<PromptFocus>("deep_dive");
  const [includeHistory, setIncludeHistory] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);

  // collapsed by default - it's a power tool, not a daily read; choice remembered on-device
  const [open, setOpen] = useState(false);
  useEffect(() => {
    void (async () => {
      await Promise.resolve();
      setOpen(loadUiFlag("promptGenOpen", false));
    })();
  }, []);
  const toggleOpen = () => {
    setOpen((prev) => {
      saveUiFlag("promptGenOpen", !prev);
      return !prev;
    });
  };

  const chosen = useMemo(
    () => (scope === "portfolio" ? rows : rows.filter((r) => selected.has(r.holding.id))),
    [scope, rows, selected]
  );

  const prompt = useMemo(() => {
    if (!chosen.length) return "";
    return buildPrompt(
      chosen,
      { focus, includeHistory, baseCurrency },
      scope === "portfolio" ? summary : undefined,
      scope === "portfolio" ? fx : undefined
    );
  }, [chosen, focus, includeHistory, baseCurrency, scope, summary, fx]);

  const toggle = (id: string) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // fallback: select the textarea content
      const ta = document.getElementById("prompt-preview") as HTMLTextAreaElement | null;
      ta?.select();
      document.execCommand?.("copy");
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  const download = () => {
    const blob = new Blob([prompt], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ai-prompt-${scope === "portfolio" ? "portfolio" : chosen.map((c) => c.holding.yahooSymbol).join("-").slice(0, 40)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="p-4">
      <button
        className="w-full text-left flex items-start justify-between gap-3"
        onClick={toggleOpen}
        aria-expanded={open}
      >
        <SectionTitle
          sub={
            open
              ? "Generates a ready-to-paste prompt - your positions, 5-year ratios and scorecard verdicts included - engineered for ChatGPT, Claude, Gemini, Perplexity or any other AI. No API key needed."
              : "Build a deep-analysis prompt from your real numbers to paste into any AI - click to open."
          }
        >
          AI prompt generator
        </SectionTitle>
        <span className="text-muted text-[13px] shrink-0" aria-hidden>
          {open ? "▾" : "▸"}
        </span>
      </button>

      <Collapse open={open}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12.5px]">
        <div className="flex rounded-lg overflow-hidden hairline">
          {(["portfolio", "selected"] as Scope[]).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={`px-3 py-1 font-medium ${scope === s ? "bg-series-1 text-white" : "bg-surface text-ink-2 hover:bg-page"}`}
            >
              {s === "portfolio" ? "Whole portfolio" : "Pick stocks"}
            </button>
          ))}
        </div>

        <label className="text-ink-2">
          Goal{" "}
          <select
            value={focus}
            onChange={(e) => setFocus(e.target.value as PromptFocus)}
            className="bg-surface hairline rounded px-2 py-1 ml-1"
          >
            {Object.entries(FOCUS_META).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </label>

        <label className="text-ink-2 inline-flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={includeHistory}
            onChange={(e) => setIncludeHistory(e.target.checked)}
            className="accent-[#2a78d6]"
          />
          include full 5-yr tables
        </label>
      </div>

      {scope === "selected" && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {rows.map((r) => {
            const on = selected.has(r.holding.id);
            return (
              <button
                key={r.holding.id}
                onClick={() => toggle(r.holding.id)}
                className={`rounded-full px-2.5 py-[3px] text-[12px] font-medium border transition-colors ${
                  on
                    ? "bg-series-1 text-white border-series-1"
                    : "bg-surface text-ink-2 border-baseline hover:bg-page"
                }`}
                aria-pressed={on}
              >
                {on ? "✓ " : ""}
                {r.holding.yahooSymbol}
              </button>
            );
          })}
        </div>
      )}

      {chosen.length === 0 ? (
        <p className="text-[12.5px] text-muted mt-3">Pick at least one stock above to generate a prompt.</p>
      ) : (
        <>
          <textarea
            id="prompt-preview"
            readOnly
            value={prompt}
            rows={12}
            className="w-full mt-3 bg-page hairline rounded-lg p-3 font-mono text-[11.5px] leading-relaxed text-ink-2 resize-y"
            aria-label="Generated AI prompt"
          />
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <button
              onClick={copy}
              className="bg-series-1 text-white rounded-lg px-4 py-1.5 text-[13px] font-semibold hover:opacity-90"
            >
              {copied ? "✓ Copied!" : "Copy prompt"}
            </button>
            <button onClick={download} className="bg-surface hairline rounded-lg px-3 py-1.5 text-[13px] hover:bg-page">
              Download .txt
            </button>
            <Badge tone="neutral">
              {prompt.length.toLocaleString()} chars · ~{estimateTokens(prompt).toLocaleString()} tokens
            </Badge>
            <span className="text-[11.5px] text-muted">
              {FOCUS_META[focus].blurb}
              {scope === "selected" && chosen.length > 1 ? ` · includes a ranking task for the ${chosen.length} picks` : ""}
            </span>
          </div>
        </>
      )}
      </Collapse>
    </Card>
  );
}
