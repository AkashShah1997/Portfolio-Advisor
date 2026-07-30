"use client";

import { useCallback, useRef, useState } from "react";
import type { Broker, Holding } from "@/lib/types";
import { parseBrokerCsv } from "@/lib/parse";
import { Card } from "./ui";

const BROKER_INFO: Record<Exclude<Broker, "manual">, { title: string; how: string }> = {
  zerodha: {
    title: "Zerodha (India)",
    how: "Console → Portfolio → Holdings → Download (CSV). Symbols resolve to NSE (.NS).",
  },
  wealthsimple: {
    title: "Wealthsimple (Canada)",
    how: "Export your holdings/positions as CSV (or build one with columns: Symbol, Quantity, Avg cost, Currency).",
  },
};

export function ImportPanel({
  onImport,
}: {
  onImport: (holdings: Holding[], warnings: string[], broker: Broker) => void;
}) {
  const [dragOver, setDragOver] = useState<string | null>(null);
  const fileRefs = {
    zerodha: useRef<HTMLInputElement>(null),
    wealthsimple: useRef<HTMLInputElement>(null),
  };

  const handleFile = useCallback(
    (file: File, broker: Exclude<Broker, "manual">) => {
      const reader = new FileReader();
      reader.onload = () => {
        const text = String(reader.result ?? "");
        const res = parseBrokerCsv(text, broker);
        onImport(res.holdings, res.warnings, broker);
      };
      reader.readAsText(file);
    },
    [onImport]
  );

  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {(Object.keys(BROKER_INFO) as Array<Exclude<Broker, "manual">>).map((b) => (
        <Card
          key={b}
          className={`p-4 transition-colors ${dragOver === b ? "outline outline-2 outline-series-1" : ""}`}
        >
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(b);
            }}
            onDragLeave={() => setDragOver(null)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(null);
              const f = e.dataTransfer.files?.[0];
              if (f) handleFile(f, b);
            }}
          >
            <div className="font-semibold text-[14px]">{BROKER_INFO[b].title}</div>
            <p className="text-[12px] text-ink-2 mt-1 min-h-[34px]">{BROKER_INFO[b].how}</p>
            <button
              className="mt-2 text-[13px] font-medium text-series-1 hover:underline"
              onClick={() => fileRefs[b].current?.click()}
            >
              Choose CSV file
            </button>
            <span className="text-[12px] text-muted"> or drag &amp; drop here</span>
            <input
              ref={fileRefs[b]}
              type="file"
              accept=".csv,.txt"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f, b);
                e.currentTarget.value = "";
              }}
            />
          </div>
        </Card>
      ))}
    </div>
  );
}
