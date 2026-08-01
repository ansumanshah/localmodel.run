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
