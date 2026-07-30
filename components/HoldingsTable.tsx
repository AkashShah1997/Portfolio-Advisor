"use client";

import { useState } from "react";
import type { Broker, Holding } from "@/lib/types";
import { currencyForSymbol, exchangeLabel, guessYahooSymbol } from "@/lib/symbols";
import { nextId } from "@/lib/parse";
import { Badge } from "./ui";

interface ResolveMatch {
  symbol: string;
  name?: string;
  exchange?: string;
}

export function HoldingsTable({
  holdings,
  onChange,
}: {
  holdings: Holding[];
  onChange: (h: Holding[]) => void;
}) {
  const [adding, setAdding] = useState({ symbol: "", qty: "", avg: "", broker: "manual" as Broker });
  const [resolving, setResolving] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Record<string, ResolveMatch[]>>({});

  const update = (id: string, patch: Partial<Holding>) => {
    onChange(
      holdings.map((h) => {
        if (h.id !== id) return h;
        const next = { ...h, ...patch };
        if (patch.yahooSymbol !== undefined) {
          next.currency = currencyForSymbol(patch.yahooSymbol);
          next.validated = false;
        }
        return next;
      })
    );
  };

  const remove = (id: string) => onChange(holdings.filter((h) => h.id !== id));

  const validate = async (h: Holding) => {
    setResolving(h.id);
    try {
      const res = await fetch("/api/resolve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: h.yahooSymbol || h.rawSymbol }),
      });
      const j = (await res.json()) as { matches?: ResolveMatch[] };
      const matches = j.matches ?? [];
      const exact = matches.find((m) => m.symbol.toUpperCase() === h.yahooSymbol.toUpperCase());
      if (exact) {
        update(h.id, { validated: true, name: h.name ?? exact.name });
        setSuggestions((s) => ({ ...s, [h.id]: [] }));
      } else {
        setSuggestions((s) => ({ ...s, [h.id]: matches.slice(0, 4) }));
      }
    } catch {
      setSuggestions((s) => ({ ...s, [h.id]: [] }));
    } finally {
      setResolving(null);
    }
  };

  const addRow = () => {
    const sym = adding.symbol.trim().toUpperCase();
    if (!sym) return;
    const yahooSymbol = guessYahooSymbol(sym, adding.broker === "zerodha" ? "zerodha" : "manual");
    onChange([
      ...holdings,
      {
        id: nextId(),
        broker: adding.broker,
        rawSymbol: sym,
        yahooSymbol,
        quantity: Number(adding.qty) || 0,
        avgCost: Number(adding.avg) || 0,
        currency: currencyForSymbol(yahooSymbol),
      },
    ]);
    setAdding({ symbol: "", qty: "", avg: "", broker: adding.broker });
  };

  return (
    <div>
      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-[11.5px] text-muted border-b border-grid">
              <th className="py-1.5 pr-2 font-medium">Broker symbol</th>
              <th className="py-1.5 pr-2 font-medium">
                Yahoo symbol{" "}
                <span title="Edit if the auto-guess is wrong. NSE = .NS, TSX = .TO, US = plain.">ⓘ</span>
              </th>
              <th className="py-1.5 pr-2 font-medium">Market</th>
              <th className="py-1.5 pr-2 font-medium text-right">Qty</th>
              <th className="py-1.5 pr-2 font-medium text-right">Avg cost</th>
              <th className="py-1.5 pr-2 font-medium">Ccy</th>
              <th className="py-1.5 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((h) => (
              <tr key={h.id} className="border-b border-grid/60 align-top">
                <td className="py-1.5 pr-2">
                  <div className="font-medium">{h.rawSymbol}</div>
                  {h.name && <div className="text-[11px] text-muted max-w-[160px] truncate">{h.name}</div>}
                </td>
                <td className="py-1.5 pr-2">
                  <input
                    value={h.yahooSymbol}
                    onChange={(e) => update(h.id, { yahooSymbol: e.target.value.toUpperCase() })}
                    className="w-[130px] bg-page hairline rounded px-1.5 py-0.5 font-medium tnum"
                    aria-label={`Yahoo symbol for ${h.rawSymbol}`}
                  />
                  {(suggestions[h.id]?.length ?? 0) > 0 && (
                    <div className="mt-1 space-y-0.5">
                      {suggestions[h.id].map((m) => (
                        <button
                          key={m.symbol}
                          className="block text-[11.5px] text-series-1 hover:underline"
                          onClick={() => {
                            update(h.id, { yahooSymbol: m.symbol, name: m.name, validated: true });
                            setSuggestions((s) => ({ ...s, [h.id]: [] }));
                          }}
                        >
                          → {m.symbol} <span className="text-ink-2">{m.name}</span>{" "}
                          {m.exchange && <span className="text-muted">({m.exchange})</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </td>
                <td className="py-1.5 pr-2">
                  <Badge tone="neutral">{exchangeLabel(h.yahooSymbol)}</Badge>
                </td>
                <td className="py-1.5 pr-2 text-right">
                  <input
                    type="number"
                    value={h.quantity || ""}
                    onChange={(e) => update(h.id, { quantity: Number(e.target.value) })}
                    className="w-[76px] bg-page hairline rounded px-1.5 py-0.5 text-right tnum"
                    aria-label={`Quantity for ${h.rawSymbol}`}
                  />
                </td>
                <td className="py-1.5 pr-2 text-right">
                  <input
                    type="number"
                    value={h.avgCost || ""}
                    onChange={(e) => update(h.id, { avgCost: Number(e.target.value) })}
                    className="w-[92px] bg-page hairline rounded px-1.5 py-0.5 text-right tnum"
                    aria-label={`Average cost for ${h.rawSymbol}`}
                  />
                </td>
                <td className="py-1.5 pr-2 text-ink-2">{h.currency}</td>
                <td className="py-1.5 whitespace-nowrap">
                  <button
                    onClick={() => validate(h)}
                    className="text-[12px] text-series-1 hover:underline mr-2 disabled:opacity-50"
                    disabled={resolving === h.id}
                  >
                    {h.validated ? "✓ valid" : resolving === h.id ? "checking…" : "check"}
                  </button>
                  <button onClick={() => remove(h.id)} className="text-[12px] text-status-critical hover:underline">
                    remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-end gap-2 mt-3">
        <div>
          <label className="block text-[11px] text-muted mb-0.5">Add symbol</label>
          <input
            value={adding.symbol}
            onChange={(e) => setAdding({ ...adding, symbol: e.target.value })}
            placeholder="e.g. TCS.NS / SHOP.TO / MSFT"
            className="bg-surface hairline rounded px-2 py-1 w-[180px] text-[13px]"
            onKeyDown={(e) => e.key === "Enter" && addRow()}
          />
        </div>
        <div>
          <label className="block text-[11px] text-muted mb-0.5">Qty</label>
          <input
            type="number"
            value={adding.qty}
            onChange={(e) => setAdding({ ...adding, qty: e.target.value })}
            className="bg-surface hairline rounded px-2 py-1 w-[80px] text-[13px] tnum"
          />
        </div>
        <div>
          <label className="block text-[11px] text-muted mb-0.5">Avg cost</label>
          <input
            type="number"
            value={adding.avg}
            onChange={(e) => setAdding({ ...adding, avg: e.target.value })}
            className="bg-surface hairline rounded px-2 py-1 w-[100px] text-[13px] tnum"
          />
        </div>
        <button
          onClick={addRow}
          className="bg-surface hairline rounded px-3 py-1 text-[13px] font-medium hover:bg-page"
        >
          + Add
        </button>
      </div>
    </div>
  );
}
