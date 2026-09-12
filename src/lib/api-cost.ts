/** Vendor text-token prices in USD. These are not subscription prices. */
export interface ApiPricing {
  inputPerMillion: number;
  outputPerMillion: number;
  cacheReadPerMillion: number | null;
  sourceUrl: string;
  verifiedAt: string;
  validThrough: string | null;
  notes: string;
}

export function isApiPriceCurrent(pricing: ApiPricing, now = new Date()): boolean {
  return pricing.validThrough === null || now.toISOString().slice(0, 10) <= pricing.validThrough;
}

export function formatApiCost(value: number | null): string {
  if (value == null || !Number.isFinite(value) || value < 0) return "Unavailable";
  if (value > 0 && value < 0.001) return "<$0.001";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: value < 1 ? 3 : 2 }).format(value);
}

/**
 * Standard text-token charge for a workload expressed in millions of tokens.
 * Output must include billed reasoning tokens. Excludes tools, cache creation,
 * storage, tax and request-length/service-tier surcharges. A cache percentage,
 * when supplied, describes reads of an already-populated cache only.
 */
export function estimateApiCost(
  pricing: ApiPricing | null,
  inputMillion: number,
  outputMillion: number,
  cachedPercent = 0,
  now = new Date(),
): number | null {
  if (!pricing || ![inputMillion, outputMillion, cachedPercent].every(Number.isFinite)) return null;
  if (!isApiPriceCurrent(pricing, now)) return null;
  if (inputMillion < 0 || outputMillion < 0 || cachedPercent < 0 || cachedPercent > 100) return null;
  if (![pricing.inputPerMillion, pricing.outputPerMillion].every((rate) => Number.isFinite(rate) && rate >= 0)) return null;
  const cached = inputMillion * cachedPercent / 100;
  if (cached > 0 && (pricing.cacheReadPerMillion == null || !Number.isFinite(pricing.cacheReadPerMillion) || pricing.cacheReadPerMillion < 0)) return null;
  const cost = (inputMillion - cached) * pricing.inputPerMillion
    + cached * (pricing.cacheReadPerMillion ?? 0)
    + outputMillion * pricing.outputPerMillion;
  return Number.isFinite(cost) ? cost : null;
}
