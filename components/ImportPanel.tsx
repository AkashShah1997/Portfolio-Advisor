"use client";

import { useRef, useState } from "react";
import { MARKET_META, type Market } from "@/lib/store";

/** Single-broker CSV dropzone, scoped to the selected market. */
export function ImportPanel({
  market,
  onFile,
}: {
  market: Market;
  onFile: (file: File) => void;
}) {
  const meta = MARKET_META[market];
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      className={`bg-surface hairline rounded-2xl elev-1 p-5 transition-all ${
        dragOver ? "outline outline-2 outline-series-1 -translate-y-[1px]" : ""
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-[30px]" aria-hidden>
          {meta.flag}
        </span>
        <div className="flex-1 min-w-[220px]">
          <div className="font-semibold text-[14.5px]">
            {meta.brokerName} holdings CSV <span className="text-muted font-normal">· {meta.exchanges}</span>
          </div>
          <p className="text-[12.5px] text-ink-2 mt-0.5">{meta.csvHint}</p>
        </div>
        <button
          className="bg-series-1 text-white rounded-xl px-4 py-2 text-[13.5px] font-semibold hover:opacity-90"
          onClick={() => inputRef.current?.click()}
        >
          Choose CSV
        </button>
        <span className="text-[12px] text-muted">or drag &amp; drop anywhere on this card</span>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.txt"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.currentTarget.value = "";
          }}
        />
      </div>
      <p className="text-[11.5px] text-muted mt-3">
        🔒 The file is parsed in your browser and saved to <strong>this device only</strong> — it is
        never uploaded anywhere. Only stock <em>symbols</em> go out, to fetch public price data.
      </p>
    </div>
  );
}
