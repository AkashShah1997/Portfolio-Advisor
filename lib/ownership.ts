/**
 * "Who owns this stock" - pure shapes and the mapper from Yahoo's
 * quoteSummary ownership modules (fundOwnership / institutionOwnership /
 * majorHoldersBreakdown). Works fully for US and most Canadian listings;
 * for NSE stocks Yahoo's coverage is partial (often a handful of domestic
 * mutual funds) - the UI says so instead of pretending.
 */

export interface OwnershipEntry {
  organization: string;
  pctHeld?: number; // fraction of shares outstanding
  position?: number; // shares
  value?: number; // native currency
  reportDate?: string; // YYYY-MM-DD
}

export interface OwnershipPayload {
  symbol: string;
  breakdown: {
    insidersPct?: number;
    institutionsPct?: number;
    institutionsFloatPct?: number;
    institutionsCount?: number;
  };
  funds: OwnershipEntry[];
  institutions: OwnershipEntry[];
  mock?: boolean;
}

type Raw = Record<string, unknown>;

const asNum = (v: unknown): number | undefined => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const raw = (v as { raw?: number } | null | undefined)?.raw;
  return typeof raw === "number" && Number.isFinite(raw) ? raw : undefined;
};

const asDate = (v: unknown): string | undefined => {
  const n = asNum(v);
  if (n !== undefined && n > 10_000_000) return new Date(n * 1000).toISOString().slice(0, 10);
  if (typeof v === "string" && v.length >= 10) return v.slice(0, 10);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return undefined;
};

function mapList(list: unknown): OwnershipEntry[] {
  if (!Array.isArray(list)) return [];
  const out: OwnershipEntry[] = [];
  for (const item of list as Raw[]) {
    const organization = typeof item?.organization === "string" ? item.organization : undefined;
    if (!organization) continue;
    out.push({
      organization,
      pctHeld: asNum(item.pctHeld),
      position: asNum(item.position),
      value: asNum(item.value),
      reportDate: asDate(item.reportDate),
    });
  }
  return out.sort((a, b) => (b.pctHeld ?? 0) - (a.pctHeld ?? 0)).slice(0, 10);
}

export function mapOwnership(
  symbol: string,
  qs: {
    majorHoldersBreakdown?: Raw;
    fundOwnership?: { ownershipList?: unknown };
    institutionOwnership?: { ownershipList?: unknown };
  }
): OwnershipPayload {
  const b = qs.majorHoldersBreakdown ?? {};
  return {
    symbol,
    breakdown: {
      insidersPct: asNum(b.insidersPercentHeld),
      institutionsPct: asNum(b.institutionsPercentHeld),
      institutionsFloatPct: asNum(b.institutionsFloatPercentHeld),
      institutionsCount: asNum(b.institutionsCount),
    },
    funds: mapList(qs.fundOwnership?.ownershipList),
    institutions: mapList(qs.institutionOwnership?.ownershipList),
  };
}
