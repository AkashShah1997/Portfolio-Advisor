import "server-only";
import type { Currency, FxRates } from "./types";
import { yahooUsdRates } from "./yahoo";
import { MOCK_ENABLED } from "./mock";

/**
 * FX strategy:
 *  1. frankfurter.dev (free, no key, ECB-sourced)
 *  2. Yahoo Finance currency pairs as fallback
 * Returned `rates[cur]` = value of 1 unit of `cur` expressed in `base`.
 */
export async function getFxRates(base: Currency): Promise<FxRates> {
  let usdRates: { INR?: number; CAD?: number } | undefined; // 1 USD in INR / CAD
  let source = "frankfurter.dev (ECB)";

  if (MOCK_ENABLED) {
    usdRates = { INR: 87.2, CAD: 1.36 };
    source = "mock (MOCK_DATA=1)";
  } else {
    try {
      const res = await fetch("https://api.frankfurter.dev/v2/rates?base=USD&quotes=INR,CAD", {
        next: { revalidate: 3600 },
      });
      if (res.ok) {
        const j = (await res.json()) as { rates?: { INR?: number; CAD?: number } };
        if (j.rates?.INR && j.rates?.CAD) usdRates = j.rates;
      }
      if (!usdRates) {
        // older host/path variant
        const res2 = await fetch("https://api.frankfurter.app/latest?from=USD&to=INR,CAD", {
          next: { revalidate: 3600 },
        });
        if (res2.ok) {
          const j2 = (await res2.json()) as { rates?: { INR?: number; CAD?: number } };
          if (j2.rates?.INR && j2.rates?.CAD) usdRates = j2.rates;
        }
      }
    } catch {
      /* fall through */
    }
    if (!usdRates?.INR || !usdRates?.CAD) {
      const y = await yahooUsdRates();
      if (y.INR && y.CAD) {
        usdRates = y;
        source = "Yahoo Finance FX";
      }
    }
  }

  if (!usdRates?.INR || !usdRates?.CAD) {
    throw new Error("Could not fetch FX rates from frankfurter.dev or Yahoo Finance.");
  }

  const perUsd: Record<Currency, number> = { USD: 1, INR: usdRates.INR, CAD: usdRates.CAD };
  // 1 unit of cur in base = (1 / perUsd[cur]) * perUsd[base]
  const rates: Record<Currency, number> = {
    USD: perUsd[base] / perUsd.USD,
    INR: perUsd[base] / perUsd.INR,
    CAD: perUsd[base] / perUsd.CAD,
  };

  return { base, rates, asOf: new Date().toISOString(), source };
}
