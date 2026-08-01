import modelsData from "@/data/models.json";
import imageModelsData from "@/data/image-models.json";
import videoModelsData from "@/data/video-models.json";
import audioModelsData from "@/data/audio-models.json";
import devicesData from "@/data/devices.json";
import toolsData from "@/data/tools.json";
import metaData from "@/data/meta.json";
import browserModelsData from "@/data/browser-models.json";
import type {
  BrowserModelRow,
  DataMeta,
  DeviceRow,
  ModelRow,
  Platform,
  ToolRow,
} from "@/data/types";
import { modalityRunsOnDevice } from "@/lib/compute-mm";

// `models` is the validated TEXT array; every text-calibrated surface (rig
// score, leaderboard, best-llm-for, popularity) iterates this and is untouched
// by non-text models. Image/video/audio live in their own arrays; only the
// can-i-run grid and model profiles consume the union via `allModels`.
export const models = (modelsData as ModelRow[]).slice();
export const imageModels = (imageModelsData as ModelRow[]).slice();
export const videoModels = (videoModelsData as ModelRow[]).slice();
export const audioModels = (audioModelsData as ModelRow[]).slice();
export const allModels: ModelRow[] = [...models, ...imageModels, ...videoModels, ...audioModels];
export const devices = (devicesData as DeviceRow[]).slice();
export const tools = toolsData as ToolRow[];
export const meta = metaData as DataMeta;
// Browser/ONNX (Transformers.js) models: a separate catalog from the GGUF
// text/image/video/audio arrays above, with its own page tree under /browser.
export const browserModels = (browserModelsData as BrowserModelRow[]).slice();

const RELEASE_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
/** Format a release string ("2024-07" or "2024") as "Jul 2024" / "2024". Falls
 *  back to the raw value if it does not match the expected shape. */
export function formatRelease(release: string | null | undefined): string {
  if (!release) return "";
  const m = /^(\d{4})-(\d{2})$/.exec(release);
  if (!m) return release;
  const month = RELEASE_MONTHS[Number(m[2]) - 1];
  return month ? `${month} ${m[1]}` : release;
}

export function getModel(id: string): ModelRow | undefined {
  return models.find((m) => m.id === id);
}
/** Find a model in any modality array (for union surfaces). */
export function getAnyModel(id: string): ModelRow | undefined {
  return allModels.find((m) => m.id === id);
}
export function modelModality(model: ModelRow): string {
  return model.modality ?? "text";
}
export function getDevice(id: string): DeviceRow | undefined {
  return devices.find((d) => d.id === id);
}
export function getTool(platform: Platform): ToolRow | undefined {
  return tools.find((t) => t.platform === platform);
}

/** Map a device to the OS platform whose tool guide is most relevant. */
export function devicePlatform(device: DeviceRow): Platform {
  switch (device.category) {
    case "mac":
      return "mac";
    case "iphone":
      return "ios";
    case "android":
      return "android";
    default:
      return "windows"; // nvidia/amd/intel/laptop: Windows is the common case (Linux noted on page)
  }
}

export function platformLabel(p: Platform): string {
  return { mac: "macOS", windows: "Windows", linux: "Linux", ios: "iOS", android: "Android" }[p];
}

/** Sort helpers used across listing pages. */
export const modelsBySize = [...models].sort((a, b) => a.params_b - b.params_b);
export const devicesByMemory = [...devices].sort((a, b) => a.memory_gb - b.memory_gb);

/** Curated front-page subsets (the highest-search models/devices). */
const FEATURED_MODEL_IDS = [
  "llama-3.1-8b",
  "deepseek-r1-distill-qwen-7b",
  "qwen3-8b",
  "gemma-3-4b",
  "llama-3.3-70b",
  "qwen3-30b-a3b",
];
const FEATURED_DEVICE_IDS = [
  "apple-m4-16gb",
  "apple-m4-pro-48gb",
  "nvidia-rtx-4090-24gb",
  "nvidia-rtx-3060-12gb",
  "laptop-16gb",
  "iphone-16-pro",
];

export const featuredModels = FEATURED_MODEL_IDS.map(getModel).filter((m): m is ModelRow => !!m);
export const featuredDevices = FEATURED_DEVICE_IDS.map(getDevice).filter(
  (d): d is DeviceRow => !!d,
);

/**
 * Model x device pairs across ALL modalities, with the runtime gate applied:
 * a pair is emitted only where a local runtime exists for that modality on that
 * device class. Text passes everywhere; a 12B image DiT skips phones and
 * CPU-only laptops (those get answered once on the model profile instead).
 */
export function modalityPairs(): { model: ModelRow; device: DeviceRow }[] {
  const out: { model: ModelRow; device: DeviceRow }[] = [];
  for (const model of allModels)
    for (const device of devices)
      if (modalityRunsOnDevice(model, device)) out.push({ model, device });
  return out;
}

export function categoryDevices(): Record<string, DeviceRow[]> {
  const groups: Record<string, DeviceRow[]> = {};
  for (const d of devicesByMemory) (groups[d.category] ||= []).push(d);
  return groups;
}

export const CATEGORY_LABEL: Record<string, string> = {
  mac: "Apple Silicon Macs",
  nvidia: "NVIDIA GPUs",
  amd: "AMD GPUs",
  intel: "Intel",
  laptop: "RAM-only laptops",
  iphone: "iPhone & iPad",
  android: "Android",
};

export function dedupeSources(...lists: string[][]): string[] {
  return [...new Set(lists.flat())];
}

export const modelsByPopularity = [...models].sort((a, b) => (b.pulls ?? 0) - (a.pulls ?? 0));
// One model per family (most popular), so the homepage grid is diverse.
export const popularModels = (() => {
  const seen = new Set<string>();
  const out: ModelRow[] = [];
  for (const m of modelsByPopularity) {
    if (seen.has(m.family)) continue;
    seen.add(m.family);
    out.push(m);
    if (out.length === 6) break;
  }
  return out;
})();

export const modelsByArena = models
  .filter((m) => m.arena_elo != null)
  .sort((a, b) => (b.arena_elo ?? 0) - (a.arena_elo ?? 0));

/** Parse a HuggingFace GGUF repo (owner/name) from a model's sources, if present. */
export function hfRepo(model: ModelRow): string | null {
  for (const s of model.sources) {
    const m = s.match(/huggingface\.co\/([^/]+\/[^/?#]+)/i);
    if (m && /gguf/i.test(m[1])) return m[1];
  }
  return null;
}

export interface InstallCmd {
  tool: string;
  cmd: string;
}

/** Multi-tool install commands for a model on a desktop platform. */
export function installCommands(model: ModelRow, platform: Platform): InstallCmd[] {
  const out: InstallCmd[] = [];
  const desktop = platform === "mac" || platform === "windows" || platform === "linux";
  if (desktop && model.ollama_tag)
    out.push({ tool: "Ollama", cmd: `ollama run ${model.ollama_tag}` });
  const repo = hfRepo(model);
  if (desktop && repo) {
    out.push({ tool: "llama.cpp", cmd: `llama-cli -hf ${repo}:Q4_K_M` });
    out.push({ tool: "LM Studio", cmd: `lms get ${repo}` });
  }
  return out;
}

// ── Browser / ONNX (Transformers.js) models ────────────────────────────────

/** Hub group order: rough practical popularity, per the brief. */
export const BROWSER_TASK_ORDER = [
  "speech-to-text",
  "speaker-diarization",
  "text-generation",
  "embeddings",
  "reranker",
  "text-to-speech",
  "vision",
  "vision-language",
  "multimodal",
  "utility",
] as const;

export const BROWSER_TASK_LABEL: Record<string, string> = {
  "speech-to-text": "Speech to text",
  "speaker-diarization": "Speaker diarization",
  "text-generation": "Text generation",
  embeddings: "Embeddings",
  reranker: "Reranking",
  "text-to-speech": "Text to speech",
  vision: "Vision",
  "vision-language": "Vision + language",
  multimodal: "Multimodal (any-to-any)",
  utility: "Text utilities",
};

/** Browser models grouped by task, in BROWSER_TASK_ORDER (unknown tasks appended last). */
export function browserModelsByTask(): {
  task: string;
  label: string;
  models: BrowserModelRow[];
}[] {
  const groups = new Map<string, BrowserModelRow[]>();
  for (const m of browserModels) {
    const list = groups.get(m.task);
    if (list) list.push(m);
    else groups.set(m.task, [m]);
  }
  const order = [
    ...BROWSER_TASK_ORDER,
    ...[...groups.keys()].filter((t) => !(BROWSER_TASK_ORDER as readonly string[]).includes(t)),
  ];
  return order
    .filter((t) => groups.has(t))
    .map((t) => ({
      task: t,
      label: BROWSER_TASK_LABEL[t] ?? t,
      models: (groups.get(t) ?? []).sort(
        (a, b) => a.headline.webgpu.bytes - b.headline.webgpu.bytes,
      ),
    }));
}

/** Bytes -> "123.4 MB" under 1 GB, "1.23 GB" at/above (1024-based, one/two decimals). */
export function formatBytes(bytes: number): string {
  const mb = bytes / 1024 / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

/** Next-smaller / next-bigger sibling within the same task, by WebGPU headline size. */
export function browserSizeNeighbors(model: BrowserModelRow): {
  smaller?: BrowserModelRow;
  bigger?: BrowserModelRow;
} {
  const ladder = browserModels
    .filter((m) => m.task === model.task && m.id !== model.id)
    .sort((a, b) => a.headline.webgpu.bytes - b.headline.webgpu.bytes);
  const smaller = [...ladder]
    .reverse()
    .find((m) => m.headline.webgpu.bytes < model.headline.webgpu.bytes);
  const bigger = ladder.find((m) => m.headline.webgpu.bytes > model.headline.webgpu.bytes);
  return { smaller, bigger };
}

/** "37.8" -> "37.8M", "1543.71" -> "1.54B". Shared by the model page and hub cards. */
export function formatParamsM(paramsM: number): string {
  return paramsM >= 1000 ? `${(paramsM / 1000).toFixed(2)}B` : `${paramsM}M`;
}

// ── Browser "Reading" panel: computed, per-model observations ──────────────
//
// Every bullet is built ONLY from the row's own measured fields (headline
// bytes, variants, params_m) or the catalog it is compared against. No copy
// is invented; a detector returns null when its condition does not hold, and
// the page renders only the bullets that actually fire. `num` parts render
// mono (JetBrains Mono numerals); plain strings render in body copy, per the
// "mono never prose, body never a measured value" rule.

export type BrowserBulletPart = string | { num: string };

/** Bytes-per-million-params "density" for a browser model's WebGPU headline. */
function browserDensity(model: BrowserModelRow): number | null {
  if (model.params_m == null) return null;
  return model.headline.webgpu.bytes / 1024 / 1024 / model.params_m;
}

/**
 * The WASM (CPU-fallback) build downloads smaller than the WebGPU build.
 * Fires whenever the measured bytes say so; no claim about how common this
 * is across the catalog, since it varies a lot by task (see browser-insights
 * tests / the audit that shaped this).
 */
export function browserWasmInversion(model: BrowserModelRow): BrowserBulletPart[] | null {
  const { webgpu, wasm } = model.headline;
  if (wasm.bytes >= webgpu.bytes) return null;
  return [
    "The WASM build downloads smaller here: ",
    { num: `${formatBytes(wasm.bytes)} (${wasm.variant})` },
    " against ",
    { num: `${formatBytes(webgpu.bytes)} (${webgpu.variant})` },
    " for WebGPU. The CPU-fallback quant compresses tighter than the GPU pick for this model.",
  ];
}

/** Ratio between the largest and smallest measured variant, when it is at least 3x. */
export function browserQuantSpread(model: BrowserModelRow): BrowserBulletPart[] | null {
  const entries = Object.entries(model.variants);
  if (entries.length < 2) return null;
  let min = entries[0]!;
  let max = entries[0]!;
  for (const entry of entries) {
    if (entry[1] < min[1]) min = entry;
    if (entry[1] > max[1]) max = entry;
  }
  const ratio = max[1] / min[1];
  if (ratio < 3) return null;
  return [
    "The quant ladder spans ",
    { num: `${ratio.toFixed(1)}x` },
    ": ",
    { num: `${formatBytes(min[1])} (${min[0]})` },
    " to ",
    { num: `${formatBytes(max[1])} (${max[0]})` },
    ".",
  ];
}

/**
 * Rank within the same task group by WebGPU headline size, when the model is
 * the smallest, second-smallest, largest, or second-largest. Only fires for
 * groups of 4+ (below that, "second-smallest" and "second-largest" collide
 * on the same row, which is not an informative rank).
 */
export function browserCatalogRankBullet(
  model: BrowserModelRow,
  catalog: BrowserModelRow[] = browserModels,
): BrowserBulletPart[] | null {
  const group = catalog.filter((m) => m.task === model.task);
  if (group.length < 4) return null;
  const sorted = [...group].sort((a, b) => a.headline.webgpu.bytes - b.headline.webgpu.bytes);
  const idx = sorted.findIndex((m) => m.id === model.id);
  if (idx < 0) return null;
  const n = sorted.length;
  const label =
    idx === 0
      ? "smallest"
      : idx === 1
        ? "second-smallest"
        : idx === n - 1
          ? "largest"
          : idx === n - 2
            ? "second-largest"
            : null;
  if (!label) return null;
  const taskLabel = (BROWSER_TASK_LABEL[model.task] ?? model.task).toLowerCase();
  return [
    `The ${label} ${taskLabel} download in the catalog (`,
    { num: formatBytes(model.headline.webgpu.bytes) },
    ").",
  ];
}

/**
 * Bytes-per-million-params vs. the task group's median, when off by more than
 * 25%. Framed as size density, never speed. Requires at least 3 models in the
 * group with a known params_m, so "median" means something.
 */
export function browserSizePerParamBullet(
  model: BrowserModelRow,
  catalog: BrowserModelRow[] = browserModels,
): BrowserBulletPart[] | null {
  const own = browserDensity(model);
  if (own == null) return null;
  const group = catalog.filter(
    (m) => m.task === model.task && m.id !== model.id && m.params_m != null,
  );
  const values = group
    .map((m) => browserDensity(m))
    .filter((v): v is number => v != null)
    .concat(own)
    .sort((a, b) => a - b);
  if (values.length < 3) return null;
  const mid = Math.floor(values.length / 2);
  const median = values.length % 2 ? values[mid]! : (values[mid - 1]! + values[mid]!) / 2;
  const dev = own / median - 1;
  if (Math.abs(dev) <= 0.25) return null;
  const taskLabel = (BROWSER_TASK_LABEL[model.task] ?? model.task).toLowerCase();
  return [
    { num: `${own.toFixed(2)} MB/M` },
    " params against a ",
    { num: `${median.toFixed(2)} MB/M` },
    ` ${taskLabel} median: `,
    dev > 0 ? "dense" : "light",
    " for its parameter count.",
  ];
}

const NOTE_COVERS_SIZE_RE = /\bGB\b|gigabyte/i;

/**
 * A plain multi-gigabyte reality check, when the larger build clears 1 GB.
 * Skipped when the model's own hand-authored `notes` already say so (several
 * do, verbatim), so the panel never repeats itself.
 */
export function browserLargeDownloadBullet(model: BrowserModelRow): BrowserBulletPart[] | null {
  const maxBytes = Math.max(model.headline.webgpu.bytes, model.headline.wasm.bytes);
  if (maxBytes < 1024 ** 3) return null;
  if (model.notes && NOTE_COVERS_SIZE_RE.test(model.notes)) return null;
  return [
    "The larger build here clears ",
    { num: "1 GB" },
    " (",
    { num: formatBytes(maxBytes) },
    "); browser cache and memory limits make this a real download to budget for, not an instant load.",
  ];
}

/** All computed (non-notes) insights that fire for a model, in priority order. */
function browserComputedInsights(
  model: BrowserModelRow,
  catalog: BrowserModelRow[],
): BrowserBulletPart[][] {
  const candidates = [
    browserWasmInversion(model),
    browserCatalogRankBullet(model, catalog),
    browserSizePerParamBullet(model, catalog),
    browserLargeDownloadBullet(model),
    browserQuantSpread(model),
  ];
  return candidates.filter((b): b is BrowserBulletPart[] => b != null);
}

/**
 * The full Reading panel for a model page: the hand-authored `notes` first
 * (when present), then up to 3 more computed insights, capped at 4 bullets
 * total. Only what actually fires renders; a plain model can end up with 1.
 */
export function browserReadingBullets(
  model: BrowserModelRow,
  catalog: BrowserModelRow[] = browserModels,
): BrowserBulletPart[][] {
  const bullets: BrowserBulletPart[][] = [];
  if (model.notes) bullets.push([model.notes]);
  for (const insight of browserComputedInsights(model, catalog)) {
    if (bullets.length >= 4) break;
    bullets.push(insight);
  }
  return bullets;
}

/** The single most notable *computed* insight (notes excluded), for the hub card annotation. */
export function browserTopComputedInsight(
  model: BrowserModelRow,
  catalog: BrowserModelRow[] = browserModels,
): BrowserBulletPart[] | null {
  return browserComputedInsights(model, catalog)[0] ?? null;
}

// ── Browser lede + FAQ copy: per-task/per-pipeline shapes ──────────────────

/** transformers.js pipeline() task -> what it actually does, in plain words. */
const PIPELINE_ACTION: Record<string, string> = {
  "text-generation": "generate text",
  "automatic-speech-recognition": "transcribe speech to text",
  "text-to-speech": "turn text into a spoken voice",
  "background-removal": "strip backgrounds from images",
  "depth-estimation": "estimate depth from a single image",
  "feature-extraction": "turn text into vectors for search and comparison",
  "image-feature-extraction": "turn images into vectors for search and comparison",
  "zero-shot-image-classification": "classify images against your own text labels",
  "zero-shot-object-detection": "find objects in an image from a text prompt",
};

/** Per-model overrides for jobs a shared pipeline_task label hides (several
 *  token/text-classification models, or models with no pipeline_task at all). */
const MODEL_ACTION: Record<string, string> = {
  "punctuate-all": "restore punctuation and capitalization to raw text",
  "gliner-small-v2.1": "pull named entities out of text for label types you choose",
  "piiranha-v1": "find personally identifiable information in text",
  "bge-reranker-v2-m3": "score how well a passage answers a query",
  "slimsam-77": "cut a precise mask around an object you point at",
  "sam2.1-hiera-tiny": "cut a precise mask around an object you point at",
  "janus-pro-1b": "both understand and generate images from one checkpoint",
  "florence-2-base-ft": "caption, detect, or segment an image using task-prompt tokens",
  "florence-2-large-ft": "caption, detect, or segment an image using task-prompt tokens",
  "granite-docling-258m": "convert scanned documents into structured text",
};

/** Task-level fallback, for models whose pipeline_task is null and are not in MODEL_ACTION. */
const TASK_ACTION: Record<string, string> = {
  "text-generation": "generate text",
  "speech-to-text": "transcribe speech to text",
  "speaker-diarization": "work out who is speaking and when, from raw audio",
  "text-to-speech": "turn text into a spoken voice",
  embeddings: "turn text into vectors for search and comparison",
  reranker: "score how well a passage answers a query",
  vision: "process an image",
  "vision-language": "read an image and answer questions about it in text",
  multimodal: "handle text, image, and audio from one checkpoint",
  utility: "analyze text",
};

/** What the model actually does in the tab, for the lede's trailing clause. */
export function browserLedeAction(model: BrowserModelRow): string {
  return (
    MODEL_ACTION[model.id] ??
    (model.pipeline_task ? PIPELINE_ACTION[model.pipeline_task] : undefined) ??
    TASK_ACTION[model.task] ??
    "run"
  );
}

/** Quant/variant code -> a plain-words explanation of the precision trade-off. */
const QUANT_PLAIN_WORDS: Record<string, string> = {
  fp32: "full 32-bit floating point, the uncompressed original weights",
  fp16: "16-bit floating point (half precision): smaller than fp32 with effectively no quality loss",
  bnb4: "4-bit bitsandbytes quantization: a big size cut with a small, usually hard-to-notice quality trade",
  q4: "4-bit weights: a big size cut with a small, usually hard-to-notice quality trade",
  q4f16:
    "4-bit weights with some layers kept at 16-bit for stability: WebGPU's usual smallest clean build",
  q8: "8-bit integers: about a quarter the size of fp32, with a smaller quality trade than 4-bit",
  uint8:
    "8-bit integers: about a quarter the size of fp32, with a smaller quality trade than 4-bit",
};

/** Plain-words explanation for a variant code; a safe fallback for any future addition. */
export function browserQuantPlainWords(variant: string): string {
  return QUANT_PLAIN_WORDS[variant] ?? `the ${variant} build`;
}
