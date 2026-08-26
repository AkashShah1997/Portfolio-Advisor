/**
 * The pre-buy checklist: ten yes-or-no gates before any buy order, drawn from
 * the masters' actual filters (Lynch's crayon test, Buffett's 10-year market
 * closure, Munger's inversion, Graham's price-first discipline). No data
 * feed can answer these; only you can. Ticks are saved on-device per symbol,
 * so the work survives between sessions.
 *
 * The bar: if you cannot honestly tick 8 of 10, you are gambling, not
 * investing, and the position size should say so.
 */

export interface ChecklistItem {
  id: string;
  text: string;
  master: string;
}

export const PREBUY_CHECKLIST: ChecklistItem[] = [
  { id: "onesentence", text: "I can explain what this business sells and who pays for it, in one sentence.", master: "Lynch: if you can't, you don't own it, it owns you" },
  { id: "tenyear", text: "I would be comfortable holding if the market closed for 10 years tomorrow.", master: "Buffett's market-closure test" },
  { id: "moat", text: "I can name the specific moat: brand, switching costs, network, cost advantage, or license.", master: "Buffett/Munger: 'durable' is the key word" },
  { id: "competition", text: "I know who is trying to kill this business, and why they haven't succeeded.", master: "Munger: invert, always invert" },
  { id: "survival", text: "One terrible year (sales down 30%, credit tight) would not force dilution or distress.", master: "the fortress test" },
  { id: "management", text: "Management owns meaningful stock and has kept its past promises.", master: "Fisher's scuttlebutt" },
  { id: "whycheap", text: "I can say WHY this opportunity exists: who is selling, and what do I see that they don't?", master: "every trade has a counterparty, know your edge" },
  { id: "price", text: "I wrote down my buy-below price BEFORE looking at today's price.", master: "Graham: price discipline precedes price discovery" },
  { id: "sizing", text: "Position size is decided in advance, and a -30% quote would make me want more, not out.", master: "conviction you can't size is opinion" },
  { id: "fit", text: "I know where it fits: core compounder, satellite bet, or income, and what I'd sell to fund it.", master: "a portfolio is decisions, not a collection" },
];

const KEY = (symbol: string) => `pa.v2.checklist.${symbol.toUpperCase()}`;
const canStore = () => typeof window !== "undefined" && !!window.localStorage;

export function loadChecklist(symbol: string): Set<string> {
  if (!canStore()) return new Set();
  try {
    const raw = window.localStorage.getItem(KEY(symbol));
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    return new Set(Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

export function saveChecklist(symbol: string, checked: Iterable<string>): void {
  if (!canStore()) return;
  try {
    window.localStorage.setItem(KEY(symbol), JSON.stringify([...checked]));
  } catch {
    /* storage full/blocked: the ticks just won't persist */
  }
}
