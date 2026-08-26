import { NextRequest, NextResponse } from "next/server";
import { gatherMacro } from "@/lib/yahoo";

export const maxDuration = 30;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ market: string }> }
) {
  const { market } = await params;
  if (market !== "india" && market !== "canada") {
    return NextResponse.json({ error: "market must be india or canada" }, { status: 400 });
  }
  try {
    return NextResponse.json(await gatherMacro(market, req.nextUrl.searchParams.get("fresh") === "1"));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message ?? "macro fetch failed" }, { status: 502 });
  }
}
