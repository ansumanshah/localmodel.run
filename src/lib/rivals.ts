import { models } from "./data";
import type { ModelRow } from "../data/types";

// Curated cross-family, size-matched pairs. Same-family pairs are generated
// automatically by compare/[pair].astro; these are the "X vs Y" searches.
// Each entry is [idA, idB]; ids are validated against the catalog at build.
const RIVAL_IDS: [string, string][] = [
  ["gemma-4-31b", "qwen3.6-27b"], // dense
  ["gemma-4-26b-a4b", "qwen3.6-35b-a3b"], // MoE
  ["gemma-4-31b", "qwen3.8-27b"],
  ["gemma-4-26b-a4b", "qwen3.6-27b"],
  ["gemma-4-31b", "qwen3.6-35b-a3b"],
  ["gemma-4-12b", "qwen3.6-27b"],
  ["gemma-4-12b", "qwen3-14b"],
  ["gemma-4-e4b", "qwen3-4b"],
];

const byId = new Map(models.map((m) => [m.id, m]));
const need = (id: string): ModelRow => {
  const m = byId.get(id);
  if (!m) throw new Error(`rivals.ts: model id not in catalog: ${id}`);
  return m;
};

export interface RivalPair {
  a: ModelRow;
  b: ModelRow;
  /** Canonical id-sorted slug, same shape as same-family pair pages. */
  slug: string;
}

export const RIVAL_PAIRS: RivalPair[] = RIVAL_IDS.map(([x, y]) => {
  const [a, b] = [need(x), need(y)].sort((p, q) => (p.id < q.id ? -1 : 1));
  return { a, b, slug: `${a.id}-vs-${b.id}` };
});

export interface Matchup {
  slug: string;
  a: { name: string; idPrefix: string };
  b: { name: string; idPrefix: string };
  pairs: RivalPair[];
}

const rival = (x: string, y: string) => {
  const p = RIVAL_PAIRS.find((r) => r.slug === [x, y].sort().join("-vs-"));
  if (!p) throw new Error(`rivals.ts: no rival pair ${x} vs ${y}`);
  return p;
};

export const MATCHUPS: Matchup[] = [
  {
    slug: "gemma-4-vs-qwen-3.6",
    a: { name: "Gemma 4", idPrefix: "gemma-4-" },
    // "qwen3.6-" excludes qwen-agentworld-35b-a3b (family Qwen3.6, different line).
    b: { name: "Qwen 3.6", idPrefix: "qwen3.6-" },
    pairs: [
      rival("gemma-4-31b", "qwen3.6-27b"),
      rival("gemma-4-26b-a4b", "qwen3.6-35b-a3b"),
      rival("gemma-4-26b-a4b", "qwen3.6-27b"),
      rival("gemma-4-31b", "qwen3.6-35b-a3b"),
      rival("gemma-4-12b", "qwen3.6-27b"),
    ],
  },
];

export const matchupModels = (mu: Matchup, side: "a" | "b") =>
  models.filter((m) => m.id.startsWith(mu[side].idPrefix)).sort((x, y) => x.params_b - y.params_b);

/** Matchups a model belongs to (for model-page links). */
export const matchupsFor = (id: string) =>
  MATCHUPS.filter((mu) => id.startsWith(mu.a.idPrefix) || id.startsWith(mu.b.idPrefix));
