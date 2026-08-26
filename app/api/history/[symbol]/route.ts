import { NextRequest, NextResponse } from "next/server";
import { getHistory, type HistoryRange } from "@/lib/yahoo";

export const maxDuration = 30;

const RANGES: HistoryRange[] = ["6m", "1y", "3y", "5y", "max"];

// Warm-lambda memory cache, keyed by symbol|range.
const cache = new Map<string, { at: number; body: unknown }>();
const TTL_MS = 10 * 60 * 1000;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol: raw } = await params;
  const symbol = decodeURIComponent(raw).toUpperCase().trim();
  const range = (req.nextUrl.searchParams.get("range") ?? "1y") as HistoryRange;
  if (!symbol || symbol.length > 20) {
    return NextResponse.json({ error: "Invalid symbol" }, { status: 400 });
  }
  if (!RANGES.includes(range)) {
    return NextResponse.json({ error: `range must be one of ${RANGES.join(", ")}` }, { status: 400 });
  }

  const key = `${symbol}|${range}`;
  const fresh = req.nextUrl.searchParams.get("fresh") === "1"; // Coach refresh button
  const hit = cache.get(key);
  if (!fresh && hit && Date.now() - hit.at < TTL_MS) {
    return NextResponse.json(hit.body);
  }

  try {
    const body = await getHistory(symbol, range);
    cache.set(key, { at: Date.now(), body });
    return NextResponse.json(body);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message ?? "History fetch failed" }, { status: 502 });
  }
}
