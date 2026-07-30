/**
 * The masters behind the checks — fundamentally-driven, long-horizon investors
 * whose public principles the scorecard encodes. Grouped for display.
 */

export interface Investor {
  name: string;
  region: "Global" | "India";
  principle: string; // one-line, as used across the app
}

export const INVESTORS: Investor[] = [
  {
    name: "Warren Buffett",
    region: "Global",
    principle: "Durable moats, owner earnings (FCF), low debt — a wonderful company at a fair price, held forever.",
  },
  {
    name: "Charlie Munger",
    region: "Global",
    principle: "Quality over cheapness; the big money is in the waiting; invert problems to spot what kills a thesis.",
  },
  {
    name: "Benjamin Graham",
    region: "Global",
    principle: "Margin of safety above all; Mr. Market is there to serve you, not to guide you.",
  },
  {
    name: "Philip Fisher",
    region: "Global",
    principle: "Scuttlebutt research — ask customers, suppliers, competitors; buy outstanding growth and hold almost forever.",
  },
  {
    name: "Peter Lynch",
    region: "Global",
    principle: "Know what you own and why; earnings drive prices; growth at a reasonable price.",
  },
  {
    name: "Chuck Akre",
    region: "Global",
    principle: "Compounding machines: high returns on equity, reinvestment runway, and managers who allocate well.",
  },
  {
    name: "Joel Greenblatt",
    region: "Global",
    principle: "The Magic Formula: pair a high earnings yield with a high return on capital — good business, cheap price.",
  },
  {
    name: "Terry Smith",
    region: "Global",
    principle: "Buy good companies (sustained high ROCE), don't overpay, then do nothing.",
  },
  {
    name: "Mohnish Pabrai",
    region: "Global",
    principle: "Dhandho: heads I win, tails I don't lose much — low-risk bets sized with a margin of safety; clone the greats shamelessly.",
  },
  {
    name: "Radhakishan Damani",
    region: "India",
    principle: "Simple, predictable businesses bought at reasonable prices and held for decades (schooled by Chandrakant Sampat, who asked one question first: what is the ROCE?).",
  },
  {
    name: "Rakesh Jhunjhunwala",
    region: "India",
    principle: "Buy right, sit tight; ROCE and earnings growth are the engine; respect leverage — it kills more portfolios than bad picks.",
  },
  {
    name: "Raamdeo Agrawal",
    region: "India",
    principle: "QGLP — Quality of business & management, Growth in earnings, Longevity of the moat, at a reasonable Price.",
  },
  {
    name: "Saurabh Mukherjea",
    region: "India",
    principle: "Coffee Can investing: revenue growth ≥10% with ROCE ≥15% year after year — then leave it untouched for a decade.",
  },
];

/** Compact roster line used in generated prompts and the AI system prompt. */
export const ROSTER_LINE =
  "Warren Buffett, Charlie Munger, Benjamin Graham, Philip Fisher, Peter Lynch, Chuck Akre, Joel Greenblatt, Terry Smith, Mohnish Pabrai — and India's Radhakishan Damani, Rakesh Jhunjhunwala, Raamdeo Agrawal (QGLP) and Saurabh Mukherjea (Coffee Can)";

/** Named frameworks the scorecard borrows, for prompts. */
export const FRAMEWORKS_LINE =
  "QGLP (Quality-Growth-Longevity-at-a-reasonable-Price), Coffee Can consistency (revenue growth ≥10% and ROCE ≥15% held year after year), Greenblatt's Magic-Formula pairing (earnings yield × return on capital), and Akre's compounding machine (high ROE × reinvestment runway)";
