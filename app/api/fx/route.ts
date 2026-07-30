import { NextRequest, NextResponse } from "next/server";
import { getFxRates } from "@/lib/fx";
import type { Currency } from "@/lib/types";

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const base = (req.nextUrl.searchParams.get("base") ?? "CAD").toUpperCase();
  if (!["INR", "CAD", "USD"].includes(base)) {
    return NextResponse.json({ error: "base must be INR, CAD or USD" }, { status: 400 });
  }
  try {
    const fx = await getFxRates(base as Currency);
    return NextResponse.json(fx);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
