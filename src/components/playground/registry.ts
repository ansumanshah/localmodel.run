import type { BrowserModelRow } from "@/data/types";
import type { PlaygroundTask } from "./types";

// Which /browser models get a live "Run it" island, and why. Resolution
// order (see playgroundTaskFor at the bottom): PLAYGROUND_DENY wins over
// everything, then PLAYGROUND_EXTRA, then a PIPELINE_TASK_RUNNER match on
// the catalog's own pipeline_task. Every one of the 54 catalog rows lands in
// exactly one of these three buckets or falls through to null (out of scope:
// no runner drives its task family at all, e.g. object detection or mask
// generation), so this file is the full audit trail.

// pipeline_task -> playground task, for rows whose runner drives them
// through the real @huggingface/transformers `pipeline(task, hfRepo, ...)`
// call (checked against the installed package, v4.2.0):
//   chat  (runners/chat.ts)  pipeline("text-generation", ...)
//   asr   (runners/asr.ts)   pipeline("automatic-speech-recognition", ...)
//   embed (runners/embed.ts) pipeline("feature-extraction", ...)
//   rmbg  (runners/rmbg.ts)  pipeline("background-removal", ...) for every
//     row here; RMBG-1.4 itself reaches "rmbg" through PLAYGROUND_EXTRA
//     below instead, because its config forces a bespoke path within the
//     same runner file.
//   depth (runners/depth.ts) pipeline("depth-estimation", ...)
//   clip  (runners/clip.ts)  pipeline("zero-shot-image-classification", ...)
export const PIPELINE_TASK_RUNNER: Record<string, PlaygroundTask> = {
  "text-generation": "chat",
  "automatic-speech-recognition": "asr",
  "feature-extraction": "embed",
  "background-removal": "rmbg",
  "depth-estimation": "depth",
  "zero-shot-image-classification": "clip",
};

// Models with a verified bespoke runner that bypasses the generic
// pipeline_task path above: either pipeline_task is null (no stable
// pipeline() call exists for the model at all), or, for Kokoro, a dedicated
// npm package is the community-standard route instead of a generic
// pipeline() call. Each comment names the exact non-generic path; see the
// runner file for the full reasoning.
export const PLAYGROUND_EXTRA: Record<string, PlaygroundTask> = {
  // pipeline_task IS "token-classification", but this one is deliberately
  // per-model rather than a PIPELINE_TASK_RUNNER entry: the other two
  // token-classification rows (punctuate-all, gliner-small-v2.1) emit
  // punctuation and generic NER labels, so the PII runner's "here is your
  // redacted text" output would be nonsense for them. The runner reads
  // piiranha's PII label set specifically.
  "piiranha-v1": "pii",
  // pipeline_task is null: the config declares a custom architecture string
  // no auto-class maps to. AutoModel + a hand-supplied processor config
  // (runners/rmbg.ts, the same flow the official remove-background-web demo
  // uses).
  "rmbg-1.4": "rmbg",
  // pipeline_task is null: no vision-language pipeline() task exists yet.
  // AutoModelForVision2Seq direct, the official SmolVLM-WebGPU demo's flow
  // (runners/vlm.ts).
  "smolvlm-256m-instruct": "vlm",
  // pipeline_task is "text-to-speech", but the runner drives it through the
  // dedicated kokoro-js package rather than a generic pipeline() call, the
  // community-standard path for this model (runners/tts.ts).
  "kokoro-82m": "tts",
};

// Rows a runner cannot honestly drive, and the specific reason, checked
// against either the installed @huggingface/transformers package
// (node_modules/@huggingface/transformers, v4.2.0: src/models/registry.js's
// model-type mappings) or the model's own HuggingFace config.json, not
// assumed. A row here never gets a Run button even when its pipeline_task
// would otherwise match PIPELINE_TASK_RUNNER above; deny wins.
export const PLAYGROUND_DENY: Record<string, string> = {
  "voxtral-mini-4b-realtime":
    "A 4B streaming audio-LLM, not a Whisper-style ASR model. The catalog's automatic-speech-recognition pipeline_task describes what it is used for, not a verified one-shot pipeline() call; the realtime chunking API it is designed around is not wired up here.",
  "gte-multilingual-base":
    'Its config.json declares model_type "new" (Alibaba\'s custom NewModel/GTE architecture), which has no class registered anywhere in @huggingface/transformers 4.2 (checked node_modules/@huggingface/transformers/src/models/registry.js). AutoModel.from_pretrained() throws for it.',
  // Both Moonshine rows fail identically at session creation, verified by
  // pressing Run on each in Chrome on Apple silicon (2026-08-20). The
  // onnxruntime error is the same for tiny and base, so this is the export,
  // not the device: "This is an invalid model. Subgraph output (logits) is an
  // outer scope value being returned directly. Please update the model to add
  // an Identity node between the outer scope value and the subgraph output."
  // The measured sizes on the page stay true; only the Run button is off.
  // Worth retesting against a non-q4f16 build, or a re-export upstream,
  // before re-enabling: a run override needs its own in-browser check first.
  "moonshine-tiny":
    "The q4f16 decoder export onnxruntime loads for this model is rejected as an invalid graph (subgraph output returned directly from outer scope), verified live in Chrome on Apple silicon 2026-08-20. Whisper covers the same task here and runs.",
  "moonshine-base":
    "Same invalid-graph rejection as moonshine-tiny, verified live in Chrome on Apple silicon 2026-08-20, so the fault is the ONNX export rather than the device. Whisper covers the same task here and runs.",
  "bge-reranker-v2-m3":
    "Rerankers score a (query, passage) pair, not a single string. The catalog's own pipeline_task for this row is text-classification, not feature-extraction, so the embed runner's single-text cosine-similarity flow does not apply.",
};

// Per-backend variant the live run loads when the headline pick is
// verified-broken at runtime. Every entry needs an in-browser verification
// and a note that states the finding plainly on the page.
export const PLAYGROUND_RUN_OVERRIDES: Record<
  string,
  { webgpu?: string; wasm?: string; note: string }
> = {
  "smolvlm-256m-instruct": {
    webgpu: "fp32",
    note: "Both the q4f16 and fp16 builds generate garbled text over WebGPU today (verified in Chrome on Apple silicon, 2026-08-01), which is why the official demo ships fp32. The live run loads the fp32 build: big, but it is the one that works.",
  },
  "kokoro-82m": {
    webgpu: "fp32",
    note: "The live run loads the bigger fp32 build over WebGPU rather than the catalog's q4f16 pick, which sounds audibly degraded there (details in the reading above). The WebAssembly fallback keeps the small q8 build.",
  },
};

/**
 * The single resolver: which playground task (if any) drives this model's
 * live "Run it" island. Denied rows return null even when their
 * pipeline_task would otherwise match a runner. Everything that returns null
 * falls back to the static WebGPU live-check on the model page.
 */
export function playgroundTaskFor(
  model: Pick<BrowserModelRow, "id" | "pipeline_task">,
): PlaygroundTask | null {
  if (model.id in PLAYGROUND_DENY) return null;
  const extra = PLAYGROUND_EXTRA[model.id];
  if (extra) return extra;
  if (model.pipeline_task) return PIPELINE_TASK_RUNNER[model.pipeline_task] ?? null;
  return null;
}
