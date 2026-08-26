import { NextRequest, NextResponse } from "next/server";
import { getOwnership, isThrottleError } from "@/lib/yahoo";

export const maxDuration = 30;

// Warm-lambda memory cache - ownership data moves quarterly.
const cache = new Map<string, { at: number; body: unknown }>();
const TTL_MS = 12 * 3600 * 1000;

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
  if (hit && Date.now() - hit.at < TTL_MS) return NextResponse.json(hit.body);
  try {
    const body = await getOwnership(symbol);
    cache.set(symbol, { at: Date.now(), body });
    return NextResponse.json(body);
  } catch (e) {
    const message = (e as Error).message ?? "Ownership fetch failed";
    return NextResponse.json(
      { error: message, throttled: isThrottleError(message) },
      { status: isThrottleError(message) ? 429 : 502 }
    );
  }
}
