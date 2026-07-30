"use client";

import { INVESTORS } from "@/lib/investors";
import { Badge, Card } from "./ui";

/** Collapsible reference: the investors whose public principles the checks encode. */
export function MastersCard({ defaultOpen = false }: { defaultOpen?: boolean }) {
  return (
    <Card className="p-4">
      <details open={defaultOpen}>
        <summary className="cursor-pointer text-[14px] font-semibold text-ink select-none">
          The masters behind the checks{" "}
          <span className="text-[12px] font-normal text-muted">
            — {INVESTORS.length} investors whose public principles this scorecard encodes
          </span>
        </summary>
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2.5 mt-3">
          {INVESTORS.map((inv) => (
            <div key={inv.name} className="text-[12.5px] leading-snug">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-ink">{inv.name}</span>
                <Badge tone={inv.region === "India" ? "neutral" : "muted"}>{inv.region}</Badge>
              </div>
              <p className="text-ink-2 mt-0.5">{inv.principle}</p>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted mt-3 italic">
          Principles are paraphrased from public writings, letters, and interviews; every check in the app names
          the investor whose idea it encodes.
        </p>
      </details>
    </Card>
  );
}
