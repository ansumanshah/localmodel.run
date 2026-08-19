// Browser-side task hub pages (/browser/task/<slug>): one destination per
// pipeline task ("speech to text in the browser", "run an LLM in your
// browser") answering real search queries the per-model pages under
// /browser/[model] don't. Every function here reads only from
// browser-models.json (via the browser* helpers in @/lib/data); nothing is
// estimated or hand-typed. House pattern mirrors the per-model "Reading"
// panel in data.ts, one level up: group-level observations instead of
// single-model ones.

import {
  browserModelsByTask,
  BROWSER_TASK_LABEL,
  formatBytes,
  type BrowserBulletPart,
} from "@/lib/data";
import type { BrowserModelRow } from "@/data/types";

/** A task only earns a hub page at 2+ models; a single-model "hub" is thin
 *  content (reranker, speaker-diarization today have exactly 1 each). */
const MIN_GROUP_SIZE = 2;

export interface BrowserTaskGroup {
  task: string;
  label: string;
  /** Sorted ascending by WebGPU headline bytes (inherited from browserModelsByTask). */
  models: BrowserModelRow[];
}

/** Every task that gets a hub page, in the site's task order. */
export function browserTaskGroups(): BrowserTaskGroup[] {
  return browserModelsByTask().filter((g) => g.models.length >= MIN_GROUP_SIZE);
}

export function browserTaskGroup(task: string): BrowserTaskGroup | undefined {
  return browserTaskGroups().find((g) => g.task === task);
}

/** H1 phrased as the query a visitor would actually type, one per task.
 *  Falls back to "<label> in the browser" for any future task not listed. */
const TASK_H1: Record<string, string> = {
  "text-generation": "Run an LLM in your browser",
  vision: "Computer vision in the browser",
  "speech-to-text": "Speech to text in the browser",
  embeddings: "Embeddings in the browser",
  "vision-language": "Vision-language models in the browser",
  multimodal: "Multimodal AI in the browser",
  utility: "Text utilities in the browser",
  "text-to-speech": "Text to speech in the browser",
};

export function browserTaskH1(task: string): string {
  return TASK_H1[task] ?? `${BROWSER_TASK_LABEL[task] ?? task} in the browser`;
}

// ── Lede stats: count, smallest, largest, median (all WebGPU headline bytes) ──

export interface BrowserGroupSizeStats {
  count: number;
  smallest: BrowserModelRow;
  largest: BrowserModelRow;
  smallestBytes: number;
  largestBytes: number;
  medianBytes: number;
  /** The middle model by WebGPU headline size: the "typical" download to link to. */
  median: BrowserModelRow;
}

/** `models` must already be sorted ascending by WebGPU headline bytes
 *  (true of every BrowserTaskGroup.models, which come straight from
 *  browserModelsByTask()). */
export function browserGroupSizeStats(models: BrowserModelRow[]): BrowserGroupSizeStats {
  const bytesList = models.map((m) => m.headline.webgpu.bytes);
  const mid = Math.floor(bytesList.length / 2);
  const medianBytes = bytesList.length % 2
    ? bytesList[mid]!
    : (bytesList[mid - 1]! + bytesList[mid]!) / 2;
  const medianIdx = bytesList.length % 2 ? mid : mid - 1;
  return {
    count: models.length,
    smallest: models[0]!,
    largest: models[models.length - 1]!,
    smallestBytes: bytesList[0]!,
    largestBytes: bytesList[bytesList.length - 1]!,
    medianBytes,
    median: models[medianIdx]!,
  };
}

/** Smallest, "typical" (median), and largest model, deduped: 2 links for a
 *  2-model group, 3 for anything bigger. For cross-linking to the notable
 *  models in a group, not for the ranked table (which lists every model). */
export function browserGroupNotableModels(models: BrowserModelRow[]): BrowserModelRow[] {
  const stats = browserGroupSizeStats(models);
  const seen = new Set<string>();
  return [stats.smallest, stats.median, stats.largest].filter((m) =>
    seen.has(m.id) ? false : (seen.add(m.id), true),
  );
}

// ── "Size ladder" reading: group-level observations true only of this group ──

function browserGroupDensity(m: BrowserModelRow): number | null {
  if (m.params_m == null) return null;
  return m.headline.webgpu.bytes / 1024 / 1024 / m.params_m;
}

/** Ratio between the largest and smallest WebGPU headline download. Always fires. */
export function browserGroupSizeRatioBullet(models: BrowserModelRow[]): BrowserBulletPart[] {
  const { smallest, largest, smallestBytes, largestBytes } = browserGroupSizeStats(models);
  const ratio = largestBytes / smallestBytes;
  return [
    "The WebGPU download spans ",
    { num: `${ratio.toFixed(1)}x` },
    " here: ",
    { num: formatBytes(smallestBytes) },
    ` (${smallest.name}) to `,
    { num: formatBytes(largestBytes) },
    ` (${largest.name}).`,
  ];
}

/** How many rows download a smaller build over WASM than WebGPU. Always
 *  fires, including the 0 case (worded as a fact, not a gap). */
export function browserGroupWasmInversionBullet(models: BrowserModelRow[]): BrowserBulletPart[] {
  const inverted = models.filter((m) => m.headline.wasm.bytes < m.headline.webgpu.bytes);
  const total = models.length;
  if (inverted.length === 0) {
    return [
      "None of the ",
      { num: `${total}` },
      " models here download smaller over WebAssembly than WebGPU: the WebGPU build is the lighter pick across the group.",
    ];
  }
  const names = inverted.length <= 3 ? ` (${inverted.map((m) => m.name).join(", ")})` : "";
  return [
    { num: `${inverted.length} of ${total}` },
    ` models${names} download a smaller build over WebAssembly than WebGPU: the CPU-fallback quant compresses tighter than the GPU pick there.`,
  ];
}

const UNDER_100MB = 100 * 1024 * 1024;

/** How many rows fit under 100 MB over WebGPU. Always fires, 0 included. */
export function browserGroupUnder100MbBullet(models: BrowserModelRow[]): BrowserBulletPart[] {
  const under = models.filter((m) => m.headline.webgpu.bytes < UNDER_100MB);
  if (under.length === 0) {
    return [
      "None of the ",
      { num: `${models.length}` },
      " models here fit under ",
      { num: "100 MB" },
      " over WebGPU.",
    ];
  }
  return [
    { num: `${under.length} of ${models.length}` },
    " models here fit under ",
    { num: "100 MB" },
    " over WebGPU.",
  ];
}

/** Bytes-per-million-params spread, when at least 3 models have a known
 *  params_m and the spread is at least 1.5x (below that it is not a
 *  meaningful observation, so the bullet is skipped rather than padded). */
export function browserGroupDensitySpreadBullet(
  models: BrowserModelRow[],
): BrowserBulletPart[] | null {
  const withDensity = models
    .map((m) => ({ m, d: browserGroupDensity(m) }))
    .filter((x): x is { m: BrowserModelRow; d: number } => x.d != null);
  if (withDensity.length < 3) return null;
  const sorted = [...withDensity].sort((a, b) => a.d - b.d);
  const min = sorted[0]!;
  const max = sorted[sorted.length - 1]!;
  const ratio = max.d / min.d;
  if (ratio < 1.5) return null;
  return [
    "Bytes-per-million-params ranges ",
    { num: `${ratio.toFixed(1)}x` },
    " within this group: ",
    { num: `${min.d.toFixed(2)} MB/M` },
    ` (${min.m.name}) to `,
    { num: `${max.d.toFixed(2)} MB/M` },
    ` (${max.m.name}).`,
  ];
}

/** The full "size ladder" reading for a task hub: 3 guaranteed observations
 *  (size ratio, WASM inversion count, under-100MB count) plus the density
 *  spread bullet when it fires. */
export function browserGroupReadingBullets(models: BrowserModelRow[]): BrowserBulletPart[][] {
  const bullets: BrowserBulletPart[][] = [
    browserGroupSizeRatioBullet(models),
    browserGroupWasmInversionBullet(models),
    browserGroupUnder100MbBullet(models),
  ];
  const density = browserGroupDensitySpreadBullet(models);
  if (density) bullets.push(density);
  return bullets;
}

// ── FAQ facts: distinct from the reading bullets above, always computable ──

export interface BrowserVariantUniformity {
  uniform: boolean;
  variant?: string;
  counts: { variant: string; count: number }[];
}

/** Whether every model's WebGPU headline uses the same quant variant, and
 *  the breakdown (most common first) if not. */
export function browserGroupVariantUniformity(models: BrowserModelRow[]): BrowserVariantUniformity {
  const counts = new Map<string, number>();
  for (const m of models) {
    const v = m.headline.webgpu.variant;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return {
    uniform: entries.length === 1,
    variant: entries.length === 1 ? entries[0]![0] : undefined,
    counts: entries.map(([variant, count]) => ({ variant, count })),
  };
}

/** Total WebGPU download across every model in the group: what it costs to
 *  fetch them all, not just the smallest one the lede leads with. */
export function browserGroupTotalBytes(models: BrowserModelRow[]): number {
  return models.reduce((sum, m) => sum + m.headline.webgpu.bytes, 0);
}

// ── Copy-paste snippet: only when every model in the group shares one pipeline_task ──

/** The transformers.js pipeline() call for the group's smallest model, built
 *  the same way [model].astro builds its own snippet. Returns null unless
 *  every member of the group shares a single non-null pipeline_task (a mixed
 *  or pipeline-less group has no one correct snippet to show). */
export function browserGroupSnippet(group: BrowserTaskGroup): string | null {
  const tasks = new Set(group.models.map((m) => m.pipeline_task));
  if (tasks.size !== 1) return null;
  const [pipelineTask] = tasks;
  if (!pipelineTask) return null;
  const { smallest } = browserGroupSizeStats(group.models);
  return `import { pipeline } from "@huggingface/transformers";

const pipe = await pipeline("${pipelineTask}", "${smallest.hf_repo}", {
  device: "webgpu", // usually falls back to "wasm"; wrap in try/catch for production
  dtype: "${smallest.headline.webgpu.variant}", // use "${smallest.headline.wasm.variant}" for the WASM build
});

const result = await pipe(/* your input */);`;
}
