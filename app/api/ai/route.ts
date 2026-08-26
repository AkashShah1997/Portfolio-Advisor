import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

/**
 * Optional AI commentary layer.
 * The user's Anthropic API key is passed per-request from the browser and is
 * NEVER stored, logged, or persisted anywhere. The app is fully functional
 * without this - the deterministic scorecard is the source of truth.
 */
export async function POST(req: NextRequest) {
  let payload: {
    apiKey?: string;
    model?: string;
    stock?: unknown;
    portfolio?: unknown;
  };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }

  const { apiKey, model, stock, portfolio } = payload;
  if (!apiKey || typeof apiKey !== "string" || !apiKey.startsWith("sk-ant-")) {
    return NextResponse.json({ error: "A valid Anthropic API key (sk-ant-…) is required." }, { status: 400 });
  }
  if (!stock && !portfolio) {
    return NextResponse.json({ error: "Provide `stock` or `portfolio` payload." }, { status: 400 });
  }

  const system = `You are a long-horizon value-investing analyst channeling the quality-value school: Warren Buffett, Charlie Munger, Benjamin Graham, Philip Fisher, Peter Lynch, Chuck Akre, Joel Greenblatt, Terry Smith, Mohnish Pabrai, and India's Radhakishan Damani, Rakesh Jhunjhunwala, Raamdeo Agrawal (QGLP) and Saurabh Mukherjea (Coffee Can). The investor holds for 5+ years minimum.

Given pre-computed fundamentals (multi-year ratios, growth, valuation, scorecard results), write a tight, concrete assessment:
1. **The business in one line** - what has to stay true for 5 years.
2. **What the numbers say** - 3-4 bullets grounded ONLY in the data provided (never invent figures).
3. **What the masters would notice** - 2-3 bullets tying specific numbers to named principles (e.g. Coffee Can consistency, Akre's reinvestment engine, Greenblatt's yield-vs-ROC pairing, Munger's quality-over-cheapness).
4. **Risks to the 5-year thesis** - 2 bullets.
5. **Bottom line** - one sentence consistent with the scorecard verdict unless the data clearly argues otherwise (then explain why).

Rules: no price targets, no certainty language ("will", "guaranteed"), markdown only, under 300 words. End with: "_Analysis, not financial advice._"`;

  const userContent = stock
    ? `Analyze this holding:\n\`\`\`json\n${JSON.stringify(stock, null, 1).slice(0, 14000)}\n\`\`\``
    : `Review this whole portfolio (allocation, verdict mix, concentration) and give portfolio-level guidance in the same style, under 350 words:\n\`\`\`json\n${JSON.stringify(portfolio, null, 1).slice(0, 14000)}\n\`\`\``;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: model && typeof model === "string" ? model : "claude-sonnet-4-5",
        max_tokens: 1200,
        system,
        messages: [{ role: "user", content: userContent }],
      }),
    });

    if (!res.ok) {
      const errBody = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      return NextResponse.json(
        { error: errBody?.error?.message ?? `Anthropic API error (${res.status})` },
        { status: res.status === 401 ? 401 : 502 }
      );
    }

    const j = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = (j.content ?? [])
      .filter((b) => b.type === "text" && b.text)
      .map((b) => b.text)
      .join("\n");
    return NextResponse.json({ text });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
