import { NextRequest, NextResponse } from "next/server";
import { getInvestorMoves } from "@/lib/edgar";

export const maxDuration = 30;

/**
 * One superinvestor's 13F moves. The UI calls this once per filer so cards
 * load progressively - one slow SEC response no longer blocks the whole tab.
 * (Server-side per-CIK cache lives in lib/edgar.ts, 6h.)
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ cik: string }> }
) {
  const { cik: raw } = await params;
  const cik = decodeURIComponent(raw).trim();
  if (!/^\d{10}$/.test(cik)) {
    return NextResponse.json({ error: "cik must be 10 digits" }, { status: 400 });
  }
  try {
    const inv = await getInvestorMoves(cik);
    if (!inv) return NextResponse.json({ error: "not on the bench" }, { status: 404 });
    return NextResponse.json(inv);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message ?? "EDGAR fetch failed" }, { status: 502 });
  }
}
