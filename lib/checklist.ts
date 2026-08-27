/**
 * The pre-buy gates: ten yes-or-no questions before any buy order, drawn from
 * the masters' actual filters (Lynch's one-sentence test, Buffett's 10-year
 * market closure, Munger's inversion, Graham's price-first discipline).
 *
 * No data feed can answer these - they need facts about the BUSINESS, not the
 * ticker. So instead of asking you to self-grade, the app builds a research
 * prompt: paste it into any AI (ChatGPT, Claude, Gemini, Perplexity) and it
 * answers each gate YES / NO / UNKNOWN with the fact behind the answer and a
 * source, then totals the score. You read the evidence and decide.
 */

export interface ChecklistItem {
  id: string;
  text: string;
  master: string;
  /** what an AI should go and look up to answer this honestly */
  lookFor: string;
}

export const PREBUY_CHECKLIST: ChecklistItem[] = [
  {
    id: "onesentence",
    text: "The business can be explained in one sentence: what it sells and who pays for it.",
    master: "Lynch: if you can't explain it, you don't own it - it owns you",
    lookFor: "the actual revenue lines from the latest annual report, and who the paying customer is",
  },
  {
    id: "tenyear",
    text: "The product/service will very likely still be needed in 10 years.",
    master: "Buffett's market-closure test",
    lookFor: "how old the core product is, whether demand is structural or a fad, and any technology that could replace it",
  },
  {
    id: "moat",
    text: "There is a specific, nameable moat: brand, switching costs, network effects, cost advantage, or licence/regulation.",
    master: "Buffett/Munger: 'durable' is the key word",
    lookFor: "market share trend, pricing power evidence, gross-margin stability vs peers, and any regulatory barrier",
  },
  {
    id: "competition",
    text: "The identity of the main competitors is known, and there is a factual reason they have not taken this business's share.",
    master: "Munger: invert, always invert",
    lookFor: "named competitors, their share moves over 5 years, and any new entrant (including foreign or online)",
  },
  {
    id: "survival",
    text: "One terrible year (sales down 30%, credit tight) would not force dilution, asset sales or distress.",
    master: "the fortress test",
    lookFor: "net debt vs EBITDA, interest cover, debt maturities in the next 24 months, cash on hand, past rights issues",
  },
  {
    id: "management",
    text: "Management owns meaningful stock and has kept its past public promises.",
    master: "Fisher's scuttlebutt",
    lookFor: "promoter/insider shareholding and its trend, pledged shares, past guidance vs delivery, related-party transactions, auditor changes",
  },
  {
    id: "whycheap",
    text: "There is a known reason this opportunity exists: who is selling, and what the market is currently worried about.",
    master: "every trade has a counterparty - know your edge",
    lookFor: "recent news, the bear case in analyst notes, and whether the worry is temporary or structural",
  },
  {
    id: "governance",
    text: "No governance or accounting red flags in the last 3 years.",
    master: "Jhunjhunwala: you can survive a bad quarter, not a dishonest promoter",
    lookFor: "auditor qualifications or resignations, regulator (SEBI/OSC/SEC) actions, restatements, unusual receivables or cash-flow gaps",
  },
  {
    id: "capital",
    text: "Capital allocation has been sensible: reinvestment earns good returns, and buybacks/dividends were not funded by debt.",
    master: "Buffett: the CEO's most important job",
    lookFor: "5-year incremental ROIC, acquisition record and write-offs, dividend/buyback funding source",
  },
  {
    id: "cyclerisk",
    text: "The main external risks are identified: regulation, commodity input, currency, customer concentration or a single geography.",
    master: "Damani: know exactly what can go wrong before it does",
    lookFor: "top-customer concentration, input-cost exposure, export/import dependence, regulated prices, and geographic concentration",
  },
];

export interface ChecklistPromptContext {
  symbol: string;
  name?: string;
  sector?: string;
  industry?: string;
  price?: string;
  /** short facts the app already computed, so the AI doesn't re-derive them */
  appFacts?: string[];
}

/**
 * Builds the research prompt. It demands FACTS ONLY, forces an explicit
 * UNKNOWN where evidence is missing (the honest answer most tools fake), and
 * asks for a source per line so nothing has to be taken on trust.
 */
export function buildChecklistPrompt(ctx: ChecklistPromptContext): string {
  const who = ctx.name ? `${ctx.name} (${ctx.symbol})` : ctx.symbol;
  const lines: string[] = [];
  lines.push(
    `You are a sceptical long-term equity analyst. Answer a 10-gate pre-buy checklist for ${who}.`,
    ``,
    `COMPANY`,
    `- Ticker: ${ctx.symbol}`,
    ctx.name ? `- Name: ${ctx.name}` : "",
    ctx.sector ? `- Sector: ${ctx.sector}${ctx.industry && ctx.industry !== ctx.sector ? ` / ${ctx.industry}` : ""}` : "",
    ctx.price ? `- Recent price: ${ctx.price}` : "",
    ``
  );
  if (ctx.appFacts?.length) {
    lines.push(`NUMBERS ALREADY COMPUTED (from 5 years of filings - use them, don't re-derive):`);
    for (const f of ctx.appFacts) lines.push(`- ${f}`);
    lines.push("");
  }
  lines.push(
    `RULES - these matter more than the answers:`,
    `1. Answer ONLY from verifiable facts: annual reports, filings, exchange disclosures, regulator sites, credible financial press.`,
    `2. Every gate gets exactly one of: YES / NO / UNKNOWN. Use UNKNOWN whenever you cannot find real evidence - a guess dressed as an answer is worse than no answer.`,
    `3. After each verdict give ONE sentence of the specific fact that decided it (with a number or a date), then the source in brackets.`,
    `4. Do not soften a NO, and do not give investment advice. No price targets.`,
    `5. If your information may be out of date, say so on that line.`,
    ``,
    `THE 10 GATES`
  );
  PREBUY_CHECKLIST.forEach((g, i) => {
    lines.push(`${i + 1}. ${g.text}`, `   Look for: ${g.lookFor}.`);
  });
  lines.push(
    ``,
    `OUTPUT FORMAT`,
    `A markdown table with columns: # | Gate (short) | YES/NO/UNKNOWN | The fact that decided it | Source.`,
    `Then, below the table:`,
    `- SCORE: x YES / y NO / z UNKNOWN out of 10.`,
    `- THE TWO BIGGEST UNKNOWNS: what a buyer should go and verify before committing money, and where to find it.`,
    `- THE BEAR CASE IN 3 LINES: the strongest factual argument against owning this for 10 years.`,
    ``,
    `Context for you (do not repeat it back): the reader is a long-term value investor with a 5-year-plus horizon who will not trade on this. Fewer than 8 YES answers means the position should be small or skipped.`
  );
  return lines.filter((l) => l !== "").join("\n");
}
