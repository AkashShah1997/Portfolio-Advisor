import { NextRequest, NextResponse } from "next/server";
import { getStockData } from "@/lib/yahoo";
import { buildScorecard } from "@/lib/scorecard";

export const maxDuration = 60;

// Warm-lambda memory cache: repeated analyses in one session shouldn't hammer Yahoo.
const cache = new Map<string, { at: number; body: unknown }>();
const TTL_MS = 10 * 60 * 1000;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol: raw } = await params;
  const symbol = decodeURIComponent(raw).toUpperCase().trim();
  if (!symbol || symbol.length > 20) {
    return NextResponse.json({ error: "Invalid symbol" }, { status: 400 });
  }

  const hit = cache.get(symbol);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return NextResponse.json(hit.body);
  }

  try {
    const data = await getStockData(symbol);
    const scorecard = buildScorecard(data);
    const body = { data, scorecard };
    cache.set(symbol, { at: Date.now(), body });
    return NextResponse.json(body);
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message ?? "Fetch failed" },
      { status: 502 }
    );
  }
}
