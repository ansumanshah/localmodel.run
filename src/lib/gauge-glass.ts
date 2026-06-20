/*
  Gauge·Glass adapter — the single source that reshapes the REAL validated engine
  (compute.ts / rig.ts) into the flat "paint shape" the glass detector, the model
  profile device modal, and the compare matrix all render. Used at BUILD time by
  the .astro pages (SSG, so the heavy models/devices arrays never ship to those
  pages), and optionally exposed on `window.GaugeGlass` for genuinely interactive
  surfaces via buildGaugeGlass().

  Hard rule honored here: NO fabricated numbers. tok/s is not sourced, so the
  speed slot is the qualitative SpeedClass — never a guessed figure.
*/
import type { DeviceRow, ModelRow } from "@/data/types";
import { canRun, usableGb, QUANT_LABEL, DEFAULT_CONTEXT_K, type SpeedClass } from "@/lib/compute";
import { rigScore as realRigScore } from "@/lib/rig";

export interface GaugeResult {
  verdict: "yes" | "tight" | "no";
  need: number; // GB the model needs at the recommended quant + context
  usable: number; // GB usable on the device
  fillScale: number; // gauge-fill scaleX (0..1)
  markAt: number; // usable-threshold mark position (0..100 %)
  rec: string | null; // recommended quant label, e.g. "Q4_K_M"
  cmd: string | null; // sourced run command (ollama_tag), never fabricated
  speed: SpeedClass; // qualitative speed — NOT a tok/s number
  speedLabel: string; // "fast" | "runs" | "slow" | ""
  ctxK: number;
  maxCtxK: number;
}

const SPEED_LABEL: Record<SpeedClass, string> = {
  fast: "fast",
  ok: "runs",
  slow: "slow",
  none: "",
};

/** Reshape canRun() into the flat paint shape. The track formula matches the
 *  Gauge·Glass mock: a little headroom past max(need, usable). */
export function gaugeCompute(
  model: ModelRow,
  device: DeviceRow,
  ctxK = DEFAULT_CONTEXT_K,
): GaugeResult {
  const maxCtxK = model.default_context_k ?? 128;
  const effCtxK = Math.min(ctxK, maxCtxK);
  const r = canRun(model, device, effCtxK);
  const usable = usableGb(device);
  const need = r.estimate?.totalGb ?? 0;
  const trackMax = Math.max(need, usable) * 1.14 || 1;
  return {
    verdict: r.verdict === "unknown" ? "no" : r.verdict,
    need,
    usable,
    fillScale: Math.min(1, need / trackMax),
    markAt: Math.min(100, (usable / trackMax) * 100),
    rec: r.quant ? QUANT_LABEL[r.quant] : null,
    cmd: model.ollama_tag ? `ollama run ${model.ollama_tag}` : null,
    speed: r.speed,
    speedLabel: SPEED_LABEL[r.speed],
    ctxK: effCtxK,
    maxCtxK,
  };
}

export interface RigResult {
  grade: string;
  pct: number;
  runnable: number;
  total: number;
  biggest: string | null;
}

export function gaugeRig(device: DeviceRow): RigResult {
  const s = realRigScore(device);
  return {
    grade: s.grade,
    pct: s.pct,
    runnable: s.runnable,
    total: s.total,
    biggest: s.biggest?.name ?? null,
  };
}

/**
 * Expose a client-side window.GaugeGlass over the real data + engine. Only call
 * this from a page that genuinely needs live recompute in the browser (e.g. the
 * compare matrix filter) — it bundles the models/devices arrays to the client,
 * so SSG pages should prefer build-time gaugeCompute() instead.
 */
export function buildGaugeGlass(models: ModelRow[], devices: DeviceRow[]) {
  const byModel = new Map(models.map((m) => [m.id, m]));
  const byDevice = new Map(devices.map((d) => [d.id, d]));
  return {
    models: models.map((m) => ({ id: m.id, name: m.name, params_b: m.params_b })),
    devices: devices.map((d) => ({ id: d.id, name: d.name, memory_gb: d.memory_gb })),
    compute(modelId: string, deviceId: string, ctxK?: number): GaugeResult | null {
      const m = byModel.get(modelId);
      const d = byDevice.get(deviceId);
      return m && d ? gaugeCompute(m, d, ctxK) : null;
    },
    rigScore(deviceId: string): RigResult | null {
      const d = byDevice.get(deviceId);
      return d ? gaugeRig(d) : null;
    },
  };
}
