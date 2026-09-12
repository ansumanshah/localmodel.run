import candidateData from "@/data/cloud-comparison-models.json";
import snapshotData from "@/data/arena-snapshot.json";
import { devices, getModel, meta } from "@/lib/data";
import { canRun, estimateMemory, usableGb } from "@/lib/compute";
import { assertArenaSnapshot, type ArenaSnapshot } from "@/lib/arena-snapshot";
import type { ApiPricing } from "@/lib/api-cost";

export interface ComparisonCandidate {
  id: string;
  name: string;
  arenaName: string;
  access: "local" | "hosted";
  sourceUrl: string;
  providerModelId: string | null;
  localModelId: string | null;
  pricing: ApiPricing | null;
}

export interface ComparisonRow extends ComparisonCandidate {
  rating: number;
  ratingLower: number;
  ratingUpper: number;
  votes: number;
  sourceRank: number;
  memoryGb: number | null;
}

export interface ComparisonFit {
  verdict: "yes" | "tight" | "no";
  memoryGb: number;
  usableGb: number;
  pairUrl: string;
}

export interface CloudComparison {
  snapshot: ArenaSnapshot;
  rows: ComparisonRow[];
  devices: { id: string; name: string; usableGb: number }[];
  contexts: number[];
  fits: Record<string, Record<string, Record<string, ComparisonFit>>>;
  defaultDeviceId: string;
  defaultContextK: number;
  memoryUpdated: string;
}

function assertUrl(value: unknown): asserts value is string {
  if (typeof value !== "string" || new URL(value).protocol !== "https:") {
    throw new Error("Comparison sources must be HTTPS URLs");
  }
}

export function assertComparisonCandidates(value: unknown): asserts value is ComparisonCandidate[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error("Comparison selection is empty");
  const ids = new Set<string>();
  const arenaNames = new Set<string>();
  for (const row of value) {
    if (!row || typeof row !== "object") throw new Error("Invalid comparison model");
    for (const key of ["id", "name", "arenaName"] as const) {
      if (typeof row[key] !== "string" || !row[key].trim()) throw new Error(`Missing comparison ${key}`);
    }
    if (!/^[a-z0-9][a-z0-9.-]*$/.test(row.id)) throw new Error(`Invalid comparison id: ${row.id}`);
    if (ids.has(row.id) || arenaNames.has(row.arenaName)) throw new Error("Duplicate comparison identity");
    ids.add(row.id);
    arenaNames.add(row.arenaName);
    assertUrl(row.sourceUrl);
    if (row.access === "local") {
      const model = typeof row.localModelId === "string" && getModel(row.localModelId);
      if (!model || model.q4_k_m_gb == null) throw new Error(`Missing measured local model: ${row.id}`);
      if (row.providerModelId !== null || row.pricing !== null) throw new Error("Local fit rows cannot carry an assumed hosted tariff");
    } else if (row.access === "hosted") {
      if (row.localModelId !== null || typeof row.providerModelId !== "string" || !row.providerModelId.trim()) {
        throw new Error(`Hosted models require a provider ID and no local mapping: ${row.id}`);
      }
      if (row.pricing !== null) {
        const price = row.pricing;
        if (!price || typeof price !== "object") throw new Error(`Invalid pricing for ${row.id}`);
        for (const rate of [price.inputPerMillion, price.outputPerMillion]) {
          if (typeof rate !== "number" || !Number.isFinite(rate) || rate < 0) throw new Error(`Invalid tariff for ${row.id}`);
        }
        if (price.cacheReadPerMillion !== null && (typeof price.cacheReadPerMillion !== "number" || !Number.isFinite(price.cacheReadPerMillion) || price.cacheReadPerMillion < 0)) {
          throw new Error(`Invalid cache tariff for ${row.id}`);
        }
        assertUrl(price.sourceUrl);
        if (typeof price.verifiedAt !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(price.verifiedAt)
          || !Number.isFinite(Date.parse(price.verifiedAt))
          || new Date(price.verifiedAt).toISOString().slice(0, 10) !== price.verifiedAt
          || Date.parse(price.verifiedAt) > Date.now()) {
          throw new Error(`Invalid pricing date for ${row.id}`);
        }
        if (typeof price.notes !== "string" || !price.notes.trim()) throw new Error(`Missing tariff scope for ${row.id}`);
        if (price.validThrough !== null && (typeof price.validThrough !== "string"
          || !/^\d{4}-\d{2}-\d{2}$/.test(price.validThrough)
          || !Number.isFinite(Date.parse(price.validThrough))
          || new Date(price.validThrough).toISOString().slice(0, 10) !== price.validThrough
          || price.validThrough < price.verifiedAt)) {
          throw new Error(`Invalid tariff expiry for ${row.id}`);
        }
      }
    } else throw new Error(`Invalid model access: ${row.id}`);
  }
}

/** Build-time adapter. Only the small result payload belongs in the browser. */
export function buildCloudComparison(): CloudComparison {
  const candidates: unknown = candidateData;
  assertComparisonCandidates(candidates);
  assertArenaSnapshot(snapshotData, candidates.map((row) => row.arenaName));
  const contexts = [4, 16, 32, 64];
  const defaultContextK = 4;
  const defaultDeviceId = "apple-m4-24gb";
  if (!devices.some((device) => device.id === defaultDeviceId)) throw new Error("Comparison default device missing");
  const scores = new Map(snapshotData.rows.map((row) => [row.model_name, row]));
  const fits: CloudComparison["fits"] = {};
  const rows = candidates.map((candidate): ComparisonRow => {
    const score = scores.get(candidate.arenaName)!;
    const model = candidate.localModelId ? getModel(candidate.localModelId)! : null;
    if (model) {
      fits[candidate.id] = {};
      for (const device of devices) {
        fits[candidate.id][device.id] = {};
        for (const context of contexts) {
          const fit = canRun(model, device, context);
          if (fit.verdict === "unknown") throw new Error(`Cannot determine local memory fit: ${model.id}`);
          fits[candidate.id][device.id][context] = {
            verdict: fit.verdict,
            memoryGb: estimateMemory(model, "q4_k_m", context).totalGb,
            usableGb: fit.usableGb,
            pairUrl: `/can-i-run/${model.id}/${device.id}`,
          };
        }
      }
    }
    return {
      ...candidate, rating: score.rating, ratingLower: score.rating_lower,
      ratingUpper: score.rating_upper, votes: score.vote_count, sourceRank: score.rank,
      memoryGb: model ? estimateMemory(model, "q4_k_m", defaultContextK).totalGb : null,
    };
  }).sort((a, b) => b.rating - a.rating || a.id.localeCompare(b.id));
  return {
    snapshot: snapshotData, rows, contexts, fits,
    devices: devices.map((device) => ({ id: device.id, name: device.name, usableGb: usableGb(device) })),
    defaultDeviceId, defaultContextK, memoryUpdated: meta.updated,
  };
}
