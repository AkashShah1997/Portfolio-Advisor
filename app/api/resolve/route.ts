import { NextRequest, NextResponse } from "next/server";
import { resolveSymbol } from "@/lib/yahoo";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const { query } = (await req.json()) as { query?: string };
    if (!query || typeof query !== "string" || query.length > 40) {
      return NextResponse.json({ error: "Invalid query" }, { status: 400 });
    }
    const matches = await resolveSymbol(query.trim());
    return NextResponse.json({ matches });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
