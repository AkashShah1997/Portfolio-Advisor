import { NextResponse } from "next/server";
import { getSmartMoves } from "@/lib/edgar";

export const maxDuration = 60;

/** Superinvestor 13F conviction moves - free SEC EDGAR data, cached 6h in-process. */
export async function GET() {
  try {
    return NextResponse.json(await getSmartMoves());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message ?? "EDGAR fetch failed" }, { status: 502 });
  }
}
