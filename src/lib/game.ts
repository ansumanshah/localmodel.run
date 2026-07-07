import type { DeviceRow, ModelRow } from "@/data/types";
import { canRun, estimateMemory, usableGb } from "@/lib/compute";
import { devices, models } from "@/lib/data";

/**
 * "Can it run?" daily quiz pool, built at compile time from the real engine.
 * Every round is a genuine model x device pair with the engine's own verdict
 * and numbers; the client only picks 8 per day and keeps score. Nothing is
 * recomputed or invented client-side.
 */
export interface GameRound {
  /** model display name */
  m: string;
  /** params label, e.g. "32B", "235B MoE" */
  p: string;
  /** device display name */
  d: string;
  /** device total memory GB */
  mem: number;
  /** needed GB at Q4_K_M (engine total: weights + KV + overhead) */
  g: number;
  /** usable GB on the device */
  u: number;
  /** 1 = it runs (yes or tight), 0 = it does not */
  r: 0 | 1;
  v: "yes" | "tight" | "no";
  /** pair page path for "the full math" link */
  url: string;
  /** difficulty tier: easy / medium / hard (by needed:usable ratio) */
  t: "e" | "m" | "h";
  /** reveal note (MoE gotcha, tight fit, near miss) */
  n?: string;
  /** 1 = mixture of experts (drives the lifetime-stats blind-spot readout) */
  moe?: 1;
}

const sizeLabel = (p: number, moe: boolean) =>
  `${p >= 1000 ? `${p / 1000}T` : p < 1 ? `${Math.round(p * 1000)}M` : `${p}B`}${moe ? " MoE" : ""}`;

// Deterministic order without Math.random: FNV-1a over the pair ids, so the
// pool is stable for a given catalog and reshuffles itself when data changes.
const hash = (s: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

const round1 = (x: number) => Math.round(x * 10) / 10;

// Tier by how close the call is. The hard zone straddles the fit line.
function tierOf(ratio: number): "e" | "m" | "h" | null {
  if (ratio >= 0.65 && ratio <= 1.6) return "h";
  if ((ratio >= 0.3 && ratio < 0.65) || (ratio > 1.6 && ratio <= 3)) return "m";
  if ((ratio >= 0.02 && ratio < 0.3) || (ratio > 3 && ratio <= 20)) return "e";
  return null; // 175x blowouts and sub-2% trivia teach nothing
}

// Famous first: the quiz is only fun when you recognize the contestant.
// Fame = a household family name + Ollama pull volume + an LMArena ranking.
// The pool fills highest-fame first, so obscure catalog entries only appear
// if a tier cannot be filled without them.
const FAMOUS_FAMILIES = new Set([
  "Llama",
  "Llama 4",
  "Llama 3.2 Vision",
  "TinyLlama",
  "Gemma",
  "Qwen3",
  "Qwen3.6",
  "Qwen2.5",
  "Qwen2.5-Coder",
  "Qwen3-Coder",
  "Qwen2.5-VL",
  "Mistral",
  "phi",
  "Phi-3.5",
  "Phi-4",
  "DeepSeek-R1",
  "DeepSeek-R1-Distill",
  "DeepSeek-V2",
  "DeepSeek-V3",
  "DeepSeek-V4",
  "gpt-oss",
  "Kimi",
  "GLM",
  "SmolLM2",
  "SmolLM3",
]);
const parsePulls = (t?: string | null) => {
  if (!t) return 0;
  const v = parseFloat(t);
  return t.includes("M") ? v * 1e6 : t.includes("K") ? v * 1e3 : v;
};
const fameOf = (m: ModelRow) => {
  const pulls = parsePulls(m.pulls_text);
  return (
    (FAMOUS_FAMILIES.has(m.family) ? 3 : 0) +
    (pulls >= 10e6 ? 3 : pulls >= 1e6 ? 2 : pulls > 0 ? 1 : 0) +
    (m.arena_elo ? 1 : 0)
  );
};

const TIER_CAP = { e: 60, m: 80, h: 100 } as const;
const PER_MODEL_CAP = 4;
const PER_DEVICE_CAP = 12;

export function buildGamePool(): GameRound[] {
  const candidates: (GameRound & { _h: number; _f: number; _mid: string; _did: string })[] = [];

  for (const model of models as ModelRow[]) {
    const fame = fameOf(model);
    const est = estimateMemory(model, "q4_k_m");
    for (const device of devices as DeviceRow[]) {
      const u = usableGb(device);
      if (!u || u <= 0) continue;
      const ratio = est.totalGb / u;
      const t = tierOf(ratio);
      if (!t) continue;
      const res = canRun(model, device);
      const runs = res.verdict !== "no";

      let n: string | undefined;
      if (model.is_moe && model.active_params_b) {
        n = `The MoE trap: it only uses ${model.active_params_b}B params at a time, but all ${sizeLabel(model.params_b, false)} have to fit in memory.`;
      } else if (res.verdict === "tight") {
        n = `A tight fit: about ${round1(u - est.totalGb)} GB of headroom left.`;
      } else if (!runs && ratio <= 1.35) {
        n = `A near miss: the gap is about ${round1(est.totalGb - u)} GB.`;
      }

      candidates.push({
        m: model.name,
        // Plain size only: "MoE" is jargon on the question view, and it does not
        // change the memory answer (all params must fit either way); the reveal
        // note is where the MoE trap is taught.
        p: sizeLabel(model.params_b, false),
        d: device.name,
        mem: device.memory_gb,
        g: est.totalGb,
        u,
        r: runs ? 1 : 0,
        v: res.verdict as GameRound["v"],
        url: `/can-i-run/${model.id}/${device.id}`,
        t,
        n,
        moe: model.is_moe ? 1 : undefined,
        _h: hash(`${model.id}|${device.id}`),
        _f: fame,
        _mid: model.id,
        _did: device.id,
      });
    }
  }

  // Highest fame first; the hash only breaks ties, so recognizable models
  // claim the tier caps before the long tail gets a slot.
  candidates.sort((a, b) => b._f - a._f || a._h - b._h);

  const perModel = new Map<string, number>();
  const perDevice = new Map<string, number>();
  const perTier = { e: 0, m: 0, h: 0 };
  const pool: GameRound[] = [];

  for (const c of candidates) {
    if (perTier[c.t] >= TIER_CAP[c.t]) continue;
    if ((perModel.get(c._mid) ?? 0) >= PER_MODEL_CAP) continue;
    if ((perDevice.get(c._did) ?? 0) >= PER_DEVICE_CAP) continue;
    perTier[c.t]++;
    perModel.set(c._mid, (perModel.get(c._mid) ?? 0) + 1);
    perDevice.set(c._did, (perDevice.get(c._did) ?? 0) + 1);
    const { _h, _f, _mid, _did, ...round } = c;
    pool.push(round);
  }

  return pool;
}
