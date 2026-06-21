import type { DeviceRow, ModelRow, Verdict } from '@/data/types'

/*
  Memory estimator. Designed to be defensible to a skeptical local-LLM
  audience. Constants are sourced and centralised here (formula_version in
  meta.json). The validated formula pass can tune BPW / KV constants without
  touching page code.

  References:
  - GGUF quant bits-per-weight: llama.cpp k-quant mixes & bartowski quant notes
    https://github.com/ggml-org/llama.cpp/blob/master/examples/quantize/README.md
  - KV cache = 2 * n_layers * n_kv_heads * head_dim * ctx * bytes; GQA shrinks
    the n_kv_heads term. We approximate with a size-scaled per-1k-token cost
    when per-model architecture is not present.
  - Apple Silicon: unified memory, ~70% usable for GPU working set
    (Metal recommendedMaxWorkingSetSize).
*/

export type Quant = 'q4_k_m' | 'q8_0' | 'fp16'

// Effective bits-per-weight for common GGUF quants, from the llama.cpp
// quantize README benchmark table (Q4_K_M = 4.89, Q8_0 = 8.5, F16 = 16).
// https://github.com/ggml-org/llama.cpp/blob/master/tools/quantize/README.md
export const BPW: Record<Quant, number> = {
  q4_k_m: 4.89,
  q8_0: 8.5,
  fp16: 16,
}

export const QUANT_LABEL: Record<Quant, string> = {
  q4_k_m: 'Q4_K_M',
  q8_0: 'Q8_0',
  fp16: 'FP16',
}

// Full quant ladder for display. Sizes use measured values where we have them,
// else bits-per-weight (llama.cpp k-quant table). MoE sizes scale with TOTAL params.
export const QUANT_LADDER: { key: string; label: string; bpw: number }[] = [
  { key: 'q2_k', label: 'Q2_K', bpw: 3.35 },
  { key: 'q3_k_m', label: 'Q3_K_M', bpw: 3.91 },
  { key: 'q4_k_m', label: 'Q4_K_M', bpw: 4.89 },
  { key: 'q5_k_m', label: 'Q5_K_M', bpw: 5.7 },
  { key: 'q6_k', label: 'Q6_K', bpw: 6.56 },
  { key: 'q8_0', label: 'Q8_0', bpw: 8.5 },
  { key: 'fp16', label: 'FP16', bpw: 16 },
]

export function quantLadderSizes(model: ModelRow): { label: string; gb: number; measured: boolean }[] {
  return QUANT_LADDER.map((q) => {
    if (q.key === 'q4_k_m' && model.q4_k_m_gb) return { label: q.label, gb: model.q4_k_m_gb, measured: true }
    if (q.key === 'q8_0' && model.q8_0_gb) return { label: q.label, gb: model.q8_0_gb, measured: true }
    if (q.key === 'fp16' && model.fp16_gb) return { label: q.label, gb: model.fp16_gb, measured: true }
    return {
      label: q.label,
      gb: Math.round(((model.params_b * q.bpw) / 8) * 10) / 10,
      measured: false,
    }
  })
}

const OVERHEAD_GB = 0.8 // compute buffers + runtime
// KV cache grows SUBLINEARLY with model size: modern models use Grouped Query
// Attention (few KV heads) and hidden dim scales slower than total params, so a
// 70B does not use ~9x the KV of an 8B. We approximate KV at ~0.06 GB per 1k
// tokens per sqrt(B params), which tracks real GQA models (8B ~1.4GB @ 8k,
// 70B ~4GB @ 8k). Use Q8-style KV cache assumptions; conservative by ~10-20%.
const KV_GB_PER_KTOK = 0.06
export const DEFAULT_CONTEXT_K = 4

/** Weights-only memory for a model at a quant (GB). MoE stores ALL experts, so total params drive memory, not active params. */
export function weightsGb(model: ModelRow, quant: Quant): number {
  // Prefer the measured on-disk size when we have it (most accurate).
  if (quant === 'q4_k_m' && model.q4_k_m_gb) return model.q4_k_m_gb
  if (quant === 'q8_0' && model.q8_0_gb) return model.q8_0_gb
  if (quant === 'fp16' && model.fp16_gb) return model.fp16_gb
  return round1((model.params_b * BPW[quant]) / 8)
}

/** Approx KV-cache memory at a context length (GB), GQA-adjusted, sublinear in size. */
export function kvCacheGb(model: ModelRow, contextK: number): number {
  return round1(KV_GB_PER_KTOK * Math.sqrt(model.params_b) * contextK)
}

export interface MemoryEstimate {
  quant: Quant
  weightsGb: number
  kvGb: number
  overheadGb: number
  totalGb: number
}

export function estimateMemory(model: ModelRow, quant: Quant, contextK = DEFAULT_CONTEXT_K): MemoryEstimate {
  const w = weightsGb(model, quant)
  const kv = kvCacheGb(model, contextK)
  return {
    quant,
    weightsGb: w,
    kvGb: kv,
    overheadGb: OVERHEAD_GB,
    totalGb: round1(w + kv + OVERHEAD_GB),
  }
}

/** Usable memory for weights on a device (after OS/headroom). */
export function usableGb(device: DeviceRow): number {
  if (device.usable_memory_gb != null) return device.usable_memory_gb
  // Every Mac row in devices.json sets usable_memory_gb explicitly (per the
  // tiered ~66%/<64GB and ~75%/>=64GB Metal rule documented in /methodology),
  // so this 0.7 fallback is a rough safety net only and should not normally fire.
  if (device.memory_type === 'unified' && device.category === 'mac') return round1(device.memory_gb * 0.7)
  if (device.memory_type === 'vram') return round1(device.memory_gb - 1)
  return round1(device.memory_gb * 0.6) // CPU RAM: leave room for OS/apps
}

export interface RunResult {
  verdict: Verdict
  quant: Quant | null // recommended quant (Q4_K_M baseline when it fits)
  estimate: MemoryEstimate | null // memory at the recommended quant
  upgradeQuant: Quant | null // highest higher-quality quant that ALSO fits
  usableGb: number
  headroomGb: number
  speed: SpeedClass
  reason: string
  // Set only by the multi-modal engine (compute-mm.ts); text leaves these unset.
  neededGb?: number // verdict basis for non-text (peak VRAM consumed)
  quantLabel?: string // precision label to render next to the verdict ("Q4 GGUF")
  offloadFloorGb?: number | null // runs on this much with aggressive offload, slowly
  noRuntime?: boolean // no local runtime for this modality on this device class
}

export type SpeedClass = 'fast' | 'ok' | 'slow' | 'none'

/**
 * Can this device run this model? Verdict is based on Q4_K_M, the community
 * default, so an 8B on a 16GB Mac reads as a comfortable "yes", not "tight".
 * Higher quants that also fit are surfaced via `upgradeQuant`.
 */
export function canRun(model: ModelRow, device: DeviceRow, contextK = DEFAULT_CONTEXT_K): RunResult {
  const usable = usableGb(device)
  const q4 = estimateMemory(model, 'q4_k_m', contextK)
  const speed = speedClass(model, device)

  if (q4.totalGb > usable) {
    return {
      verdict: 'no',
      quant: null,
      estimate: q4,
      upgradeQuant: null,
      usableGb: usable,
      headroomGb: round1(usable - q4.totalGb),
      speed: 'none',
      reason: `Needs ~${q4.totalGb} GB even at Q4_K_M, but only ~${usable} GB is usable.`,
    }
  }

  // Best higher-quality quant that still fits (for the "you can go higher" note).
  let upgrade: Quant | null = null
  for (const q of ['fp16', 'q8_0'] as Quant[]) {
    if (estimateMemory(model, q, contextK).totalGb <= usable) {
      upgrade = q
      break
    }
  }

  const headroom = round1(usable - q4.totalGb)
  const tight = headroom < Math.max(1, usable * 0.1)
  return {
    verdict: tight ? 'tight' : 'yes',
    quant: 'q4_k_m',
    estimate: q4,
    upgradeQuant: upgrade,
    usableGb: usable,
    headroomGb: headroom,
    speed,
    reason: tight
      ? `Fits at Q4_K_M (~${q4.totalGb} GB of ~${usable} GB usable) but with little headroom, close other apps.`
      : `Runs at Q4_K_M using ~${q4.totalGb} GB of ~${usable} GB usable${upgrade ? `. You have room for ${QUANT_LABEL[upgrade]} for higher quality` : ''}.`,
  }
}

function speedClass(model: ModelRow, device: DeviceRow): SpeedClass {
  const effB = model.is_moe && model.active_params_b ? model.active_params_b : model.params_b
  // Phones/CPU are memory-bandwidth limited; GPUs/Apple-Silicon are quick.
  if (device.category === 'iphone' || device.category === 'android') {
    return effB <= 4 ? 'ok' : 'slow'
  }
  if (device.memory_type === 'ram') return effB <= 8 ? 'ok' : 'slow' // CPU-only laptop
  if (device.category === 'mac') return effB <= 32 ? 'fast' : 'ok'
  // discrete GPU
  return effB <= 34 ? 'fast' : 'ok'
}

// Real-world fraction of peak memory bandwidth a runtime sustains, by device class.
// Estimates, sanity-checked against published llama.cpp / MLX benchmarks (Mac unified
// sustains more of peak than a discrete GPU's path; CPU/phone least). See /methodology.
const TPS_EFFICIENCY: Record<string, number> = {
  mac: 0.8,
  nvidia: 0.65,
  amd: 0.65,
  laptop: 0.5,
  iphone: 0.5,
  android: 0.5,
}

/**
 * Estimated generation speed in tokens/sec, memory-bandwidth-bound:
 * tok/s ≈ efficiency × device_bandwidth / weights-read-per-token.
 * DENSE models only — returns null with no device bandwidth, or for MoE (the bound
 * overestimates MoE because only active experts are read per token, with overhead;
 * MoE shows the qualitative "runs at ~Nb speed" instead). Always an ESTIMATE.
 */
export function estTokPerSec(model: ModelRow, device: DeviceRow, quant: Quant = 'q4_k_m'): number | null {
  const bw = device.bandwidth_gbs
  if (bw == null || model.is_moe) return null
  const w = weightsGb(model, quant) // weights are read once per generated token; they dominate
  if (!w) return null
  const eff = TPS_EFFICIENCY[device.category] ?? 0.6
  const tps = (bw / w) * eff
  return tps >= 1 ? Math.round(tps) : Math.round(tps * 10) / 10
}

export function verdictLabel(v: Verdict): string {
  return v === 'yes'
    ? 'Yes, it runs'
    : v === 'tight'
      ? 'Yes, but tight'
      : v === 'no'
        ? 'No, not enough memory'
        : 'Unknown'
}

// Compact form for dense grids/tables where the surrounding context (a "can run"
// column, a device card) already supplies the meaning. The hero verdict uses the
// full verdictLabel().
export function verdictLabelShort(v: Verdict): string {
  return v === 'yes' ? 'Yes' : v === 'tight' ? 'Tight' : v === 'no' ? 'No' : 'Unknown'
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10
}
