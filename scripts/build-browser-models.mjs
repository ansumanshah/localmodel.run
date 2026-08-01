#!/usr/bin/env node
/**
 * Build src/data/browser-models.json from scripts/browser-model-sizes.json.
 *
 * The sizes file holds exact measured bytes per repo/variant (from the HF API
 * tree, see verify-browser-models.ts); this script never invents or rounds a
 * byte count, it only copies them and attaches curated metadata (task
 * grouping, verified param counts, the transformers.js pipeline task, and
 * honest caveats). Re-run after scripts/browser-model-sizes.json changes.
 *
 *   node scripts/build-browser-models.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SIZES_PATH = join(__dirname, "browser-model-sizes.json");
const OUT_PATH = join(__dirname, "..", "src", "data", "browser-models.json");
const MEASURED_DATE = "2026-08-01";
const LARGE_BYTES = 1500 * 1024 * 1024; // 1.5 GB: past this, flag the download-size caveat
const LARGE_NOTE =
  "This is a multi-gigabyte download. Between the file size and current browser memory limits, it is impractical to run on most machines today.";

// Per-repo variant exclusions: the measurement script's variant grouping
// mislabeled these buckets (contaminated with extra sub-builds, or missing
// files other variants ship). Dropped here rather than guessed at or backfilled.
const EXCLUDE_VARIANTS = {
  "onnx-community/Qwen3-0.6B-ONNX": ["fp32"],
  "onnx-community/Kokoro-82M-v1.0-ONNX": ["fp32"],
  "onnx-community/Bonsai-1.7B-ONNX": ["fp32"],
  "onnx-community/granite-docling-258M-ONNX": ["uint8", "bnb4"],
  "onnx-community/bge-m3-ONNX": ["fp16"],
};

// task: hub grouping key. pipelineTask: the exact transformers.js pipeline()
// task string (verified against https://huggingface.co/docs/transformers.js/en/pipelines),
// or null when no stable pipeline() task exists yet (documented in `notes`).
// params_m: verified from the HF API `safetensors.total` (own repo, or the
// base/original repo when the ONNX export carries no safetensors metadata) or
// a cited authoritative source; null when genuinely unverifiable.
const METADATA = [
  // ---- text-generation ----
  {
    id: "smollm2-135m-instruct",
    name: "SmolLM2-135M-Instruct",
    repo: "HuggingFaceTB/SmolLM2-135M-Instruct",
    task: "text-generation",
    pipelineTask: "text-generation",
    params_m: 134.5,
  },
  {
    id: "smollm2-360m-instruct",
    name: "SmolLM2-360M-Instruct",
    repo: "HuggingFaceTB/SmolLM2-360M-Instruct",
    task: "text-generation",
    pipelineTask: "text-generation",
    params_m: 361.8,
  },
  {
    id: "gemma-3-270m-it",
    name: "Gemma-3-270M-it",
    repo: "onnx-community/gemma-3-270m-it-ONNX",
    task: "text-generation",
    pipelineTask: "text-generation",
    params_m: 268.1,
    paramsSourceUrl: "https://huggingface.co/google/gemma-3-270m-it",
  },
  {
    id: "qwen2.5-0.5b-instruct",
    name: "Qwen2.5-0.5B-Instruct",
    repo: "onnx-community/Qwen2.5-0.5B-Instruct",
    task: "text-generation",
    pipelineTask: "text-generation",
    params_m: 494.0,
    paramsSourceUrl: "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct",
  },
  {
    id: "llama-3.2-1b-instruct",
    name: "Llama-3.2-1B-Instruct",
    repo: "onnx-community/Llama-3.2-1B-Instruct",
    task: "text-generation",
    pipelineTask: "text-generation",
    params_m: 1235.8,
    paramsSourceUrl: "https://huggingface.co/meta-llama/Llama-3.2-1B-Instruct",
    notes:
      "Every build exceeds 1 GB; q4f16 (about 1.04 GB) is the lightest WebGPU option, and even that is a meaningful download and load-time hit for a browser page.",
  },
  {
    id: "qwen3-0.6b",
    name: "Qwen3-0.6B",
    repo: "onnx-community/Qwen3-0.6B-ONNX",
    task: "text-generation",
    pipelineTask: "text-generation",
    params_m: 751.63,
    notes:
      "This repo's fp32 bucket bundles extra onnxruntime-specific sub-builds and is excluded from the sizes shown here; the other variants are clean single-file measurements.",
  },
  {
    id: "qwen2.5-1.5b-instruct",
    name: "Qwen2.5-1.5B-Instruct",
    repo: "onnx-community/Qwen2.5-1.5B-Instruct",
    task: "text-generation",
    pipelineTask: "text-generation",
    params_m: 1543.71,
  },
  {
    id: "deepseek-r1-distill-qwen-1.5b",
    name: "DeepSeek-R1-Distill-Qwen-1.5B",
    repo: "onnx-community/DeepSeek-R1-Distill-Qwen-1.5B-ONNX",
    task: "text-generation",
    pipelineTask: "text-generation",
    params_m: 1777.09,
  },
  {
    id: "gemma-3-1b-it",
    name: "Gemma-3-1B-it",
    repo: "onnx-community/gemma-3-1b-it-ONNX",
    task: "text-generation",
    pipelineTask: "text-generation",
    params_m: 999.89,
  },
  {
    id: "lfm2.5-350m",
    name: "LFM2.5-350M",
    repo: "onnx-community/LFM2.5-350M-ONNX",
    task: "text-generation",
    pipelineTask: "text-generation",
    params_m: 354.48,
  },
  {
    id: "granite-4.0-350m",
    name: "Granite-4.0-350M",
    repo: "onnx-community/granite-4.0-350m-ONNX-web",
    task: "text-generation",
    pipelineTask: "text-generation",
    params_m: 352.38,
    notes: "No int8 (q8/uint8) build is published for this repo; the lightest option is q4f16.",
  },
  {
    id: "bonsai-1.7b",
    name: "Bonsai-1.7B",
    repo: "onnx-community/Bonsai-1.7B-ONNX",
    task: "text-generation",
    pipelineTask: "text-generation",
    params_m: 1720.03,
    notes:
      "Only q4 and q8 are usable measurements here; the repo's fp32 bucket bundles unrelated experimental 1-bit/2-bit files and is excluded.",
  },
  {
    id: "phi-3.5-mini",
    name: "Phi-3.5-mini-instruct",
    repo: "onnx-community/Phi-3.5-mini-instruct-onnx-web",
    task: "text-generation",
    pipelineTask: "text-generation",
    params_m: 3821.08,
    notes:
      "Only a single q4f16 web build (about 2.3 GB) is published, no fp16 or int8 alternative, which alone makes it a heavy download for a browser page.",
  },

  // ---- multimodal (any-to-any) ----
  {
    id: "gemma-4-e2b-it",
    name: "Gemma-4-E2B-it",
    repo: "onnx-community/gemma-4-E2B-it-ONNX",
    task: "multimodal",
    pipelineTask: null,
    params_m: 5123.18,
    notes:
      "The E2B name is an effective/active-param label (like Gemma 3n), not the real stored parameter count: this checkpoint stores about 5.12B params, not 2B. Any-to-any multimodal generation (text, image and audio in and out) has no stable transformers.js pipeline() task yet; expect to wire the encoders and decoder manually.",
  },
  {
    id: "gemma-4-e4b-it",
    name: "Gemma-4-E4B-it",
    repo: "onnx-community/gemma-4-E4B-it-ONNX",
    task: "multimodal",
    pipelineTask: null,
    params_m: 7996.16,
    notes:
      "The E4B name is an effective/active-param label (like Gemma 3n), not the real stored parameter count: this checkpoint stores about 8.0B params, not 4B. Any-to-any multimodal generation (text, image and audio in and out) has no stable transformers.js pipeline() task yet; expect to wire the encoders and decoder manually.",
  },
  {
    id: "janus-pro-1b",
    name: "Janus-Pro-1B",
    repo: "onnx-community/Janus-Pro-1B-ONNX",
    task: "multimodal",
    pipelineTask: null,
    params_m: 2076.64,
    notes:
      "Janus-Pro does both image understanding and image generation from one checkpoint; there is no stable transformers.js pipeline() task for that yet, so expect custom wiring.",
  },

  // ---- vision-language ----
  {
    id: "smolvlm-256m-instruct",
    name: "SmolVLM-256M-Instruct",
    repo: "HuggingFaceTB/SmolVLM-256M-Instruct",
    task: "vision-language",
    pipelineTask: null,
    params_m: 256.5,
    notes:
      "No stable transformers.js pipeline() task for image+text chat yet; use AutoModelForVision2Seq and AutoProcessor directly (see the official SmolVLM-WebGPU demo).",
  },
  {
    id: "florence-2-base-ft",
    name: "Florence-2-base-ft",
    repo: "onnx-community/Florence-2-base-ft",
    task: "vision-language",
    pipelineTask: null,
    params_m: 231.6,
    paramsSourceUrl: "https://huggingface.co/microsoft/Florence-2-base-ft",
    notes:
      "Florence-2 uses task-prompt tokens (for example <OD>, <CAPTION>) via raw AutoModelForCausalLM and AutoProcessor, not a pipeline() call.",
  },
  {
    id: "qwen3.5-0.8b",
    name: "Qwen3.5-0.8B",
    repo: "onnx-community/Qwen3.5-0.8B-ONNX",
    task: "vision-language",
    pipelineTask: null,
    params_m: 873.44,
    notes: "Vision-language chat has no stable transformers.js pipeline() task yet; use the model's AutoModel classes directly.",
  },
  {
    id: "granite-docling-258m",
    name: "Granite-Docling-258M",
    repo: "onnx-community/granite-docling-258M-ONNX",
    task: "vision-language",
    pipelineTask: null,
    params_m: 257.52,
    notes:
      "Document-understanding VLM; no pipeline() task covers it yet. The uint8 and bnb4 builds in this repo are missing files the other variants ship, and are excluded here as incomplete.",
  },
  {
    id: "florence-2-large-ft",
    name: "Florence-2-large-ft",
    repo: "onnx-community/Florence-2-large-ft",
    task: "vision-language",
    pipelineTask: null,
    params_m: 770.43,
    notes:
      "Same task-prompt-token usage as Florence-2-base (see that model); no pipeline() call, use AutoModelForCausalLM and AutoProcessor directly.",
  },

  // ---- speech-to-text ----
  {
    id: "whisper-tiny",
    name: "Whisper Tiny",
    repo: "onnx-community/whisper-tiny",
    task: "speech-to-text",
    pipelineTask: "automatic-speech-recognition",
    params_m: 37.8,
    paramsSourceUrl: "https://huggingface.co/openai/whisper-tiny",
  },
  {
    id: "whisper-base",
    name: "Whisper Base",
    repo: "onnx-community/whisper-base",
    task: "speech-to-text",
    pipelineTask: "automatic-speech-recognition",
    params_m: 72.6,
    paramsSourceUrl: "https://huggingface.co/openai/whisper-base",
  },
  {
    id: "whisper-small",
    name: "Whisper Small",
    repo: "onnx-community/whisper-small",
    task: "speech-to-text",
    pipelineTask: "automatic-speech-recognition",
    params_m: 241.7,
    paramsSourceUrl: "https://huggingface.co/openai/whisper-small",
  },
  {
    id: "moonshine-base",
    name: "Moonshine Base",
    repo: "onnx-community/moonshine-base-ONNX",
    task: "speech-to-text",
    pipelineTask: "automatic-speech-recognition",
    params_m: 61.5,
    paramsSourceUrl: "https://huggingface.co/UsefulSensors/moonshine-base",
  },
  {
    id: "whisper-large-v3-turbo",
    name: "Whisper Large v3 Turbo",
    repo: "onnx-community/whisper-large-v3-turbo",
    task: "speech-to-text",
    pipelineTask: "automatic-speech-recognition",
    params_m: 808.88,
  },
  {
    id: "moonshine-tiny",
    name: "Moonshine Tiny",
    repo: "onnx-community/moonshine-tiny-ONNX",
    task: "speech-to-text",
    pipelineTask: "automatic-speech-recognition",
    params_m: 27.09,
  },
  {
    id: "voxtral-mini-4b-realtime",
    name: "Voxtral Mini 4B Realtime",
    repo: "onnx-community/Voxtral-Mini-4B-Realtime-2602-ONNX",
    task: "speech-to-text",
    pipelineTask: "automatic-speech-recognition",
    params_m: 4429.68,
    notes:
      "Built for realtime streaming transcription; the standard automatic-speech-recognition pipeline() call works for one-shot audio, but streaming needs custom chunking beyond the default pipeline.",
  },

  // ---- speaker-diarization ----
  {
    id: "pyannote-segmentation-3.0",
    name: "pyannote Speaker Segmentation 3.0",
    repo: "onnx-community/pyannote-segmentation-3.0",
    task: "speaker-diarization",
    pipelineTask: null,
    params_m: null,
    notes:
      "Frame-wise speaker segmentation, not transcription. transformers.js has no dedicated diarization pipeline() task; use AutoModel and decode the frame-level speaker-activity output yourself.",
  },

  // ---- text-to-speech ----
  {
    id: "kokoro-82m",
    name: "Kokoro-82M",
    repo: "onnx-community/Kokoro-82M-v1.0-ONNX",
    task: "text-to-speech",
    pipelineTask: "text-to-speech",
    params_m: 82,
    paramsSourceUrl: "https://huggingface.co/hexgrad/Kokoro-82M",
    notes:
      "Sizes are not monotonic by quant here: q8 (about 92 MB) is smaller than q4f16 (about 155 MB) and is the community-standard build most demos ship. In practice Kokoro is usually driven through the dedicated kokoro-js package rather than a generic pipeline() call.",
  },
  {
    id: "supertonic-tts-2",
    name: "Supertonic TTS 2",
    repo: "onnx-community/Supertonic-TTS-2-ONNX",
    task: "text-to-speech",
    pipelineTask: null,
    params_m: null,
    notes:
      "Ships as three separate ONNX parts (text encoder, latent denoiser, voice decoder) in fp32 only, no quantized build published yet. There is no pipeline() task that wires a 3-stage TTS graph together; expect custom ONNX Runtime code.",
  },

  // ---- embeddings ----
  {
    id: "all-minilm-l6-v2",
    name: "all-MiniLM-L6-v2",
    repo: "Xenova/all-MiniLM-L6-v2",
    task: "embeddings",
    pipelineTask: "feature-extraction",
    params_m: 22.7,
    paramsSourceUrl: "https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2",
  },
  {
    id: "bge-small-en-v1.5",
    name: "bge-small-en-v1.5",
    repo: "Xenova/bge-small-en-v1.5",
    task: "embeddings",
    pipelineTask: "feature-extraction",
    params_m: 33.4,
    paramsSourceUrl: "https://huggingface.co/BAAI/bge-small-en-v1.5",
  },
  {
    id: "embeddinggemma-300m",
    name: "EmbeddingGemma-300M",
    repo: "onnx-community/embeddinggemma-300m-ONNX",
    task: "embeddings",
    pipelineTask: "feature-extraction",
    params_m: 302.9,
    paramsSourceUrl: "https://huggingface.co/google/embeddinggemma-300m",
  },
  {
    id: "gte-multilingual-base",
    name: "GTE Multilingual Base",
    repo: "onnx-community/gte-multilingual-base",
    task: "embeddings",
    pipelineTask: "feature-extraction",
    params_m: 305,
    notes: "Param count is the model card's stated figure (no safetensors metadata to read directly), so treat it as approximate.",
  },
  {
    id: "qwen3-embedding-0.6b",
    name: "Qwen3-Embedding-0.6B",
    repo: "onnx-community/Qwen3-Embedding-0.6B-ONNX",
    task: "embeddings",
    pipelineTask: "feature-extraction",
    params_m: 595.78,
  },
  {
    id: "bge-m3",
    name: "BGE-M3",
    repo: "onnx-community/bge-m3-ONNX",
    task: "embeddings",
    pipelineTask: "feature-extraction",
    params_m: 569,
    notes:
      "Param count is BAAI's stated figure (no safetensors metadata to read directly), so treat it as approximate. The bnb4 and q4 builds in this repo are byte-identical (apparently the same file uploaded under both names); treat them as one option. The fp16 bucket is a near-empty placeholder file and is excluded here.",
  },
  {
    id: "voyage-4-nano",
    name: "voyage-4-nano",
    repo: "onnx-community/voyage-4-nano-ONNX",
    task: "embeddings",
    pipelineTask: "feature-extraction",
    params_m: 346.45,
  },

  // ---- reranker ----
  {
    id: "bge-reranker-v2-m3",
    name: "BGE Reranker v2 M3",
    repo: "onnx-community/bge-reranker-v2-m3-ONNX",
    task: "reranker",
    pipelineTask: "text-classification",
    params_m: 567.76,
    notes:
      "Rerankers score a (query, passage) pair, not a single string. Confirm the model card's expected input shape before assuming the generic text-classification pipeline() call handles pairs; AutoModelForSequenceClassification with a tokenizer pair encoding is the safer default.",
  },

  // ---- vision ----
  {
    id: "clip-vit-base-patch32",
    name: "CLIP ViT-B/32",
    repo: "Xenova/clip-vit-base-patch32",
    task: "vision",
    pipelineTask: "zero-shot-image-classification",
    params_m: 151.3,
    paramsSourceUrl: "https://huggingface.co/openai/clip-vit-base-patch32",
  },
  {
    id: "rmbg-1.4",
    name: "RMBG-1.4",
    repo: "briaai/RMBG-1.4",
    task: "vision",
    pipelineTask: "background-removal",
    params_m: 44.1,
  },
  {
    id: "modnet",
    name: "MODNet",
    repo: "Xenova/modnet",
    task: "vision",
    pipelineTask: "background-removal",
    params_m: 6.5,
    paramsSourceUrl:
      "https://github.com/openvinotoolkit/open_model_zoo/blob/master/models/public/modnet-photographic-portrait-matting/README.md",
  },
  {
    id: "depth-anything-v2-small",
    name: "Depth Anything V2 Small",
    repo: "onnx-community/depth-anything-v2-small",
    task: "vision",
    pipelineTask: "depth-estimation",
    params_m: 24.8,
    paramsSourceUrl: "https://huggingface.co/depth-anything/Depth-Anything-V2-Small-hf",
  },
  {
    id: "slimsam-77",
    name: "SlimSAM-77",
    repo: "Xenova/slimsam-77-uniform",
    task: "vision",
    pipelineTask: null,
    params_m: 9.7,
    paramsSourceUrl: "https://huggingface.co/Zigeng/SlimSAM-uniform-77",
    notes:
      "transformers.js has no mask-generation pipeline() task; SAM-family models are driven with the raw SamModel/SamProcessor classes plus a click or box prompt.",
  },
  {
    id: "siglip2-base-patch16-224",
    name: "SigLIP2 Base Patch16-224",
    repo: "onnx-community/siglip2-base-patch16-224-ONNX",
    task: "vision",
    pipelineTask: "zero-shot-image-classification",
    params_m: 375.19,
  },
  {
    id: "dinov3-vits16",
    name: "DINOv3 ViT-S/16",
    repo: "onnx-community/dinov3-vits16-pretrain-lvd1689m-ONNX",
    task: "vision",
    pipelineTask: "image-feature-extraction",
    params_m: 21.6,
    notes: "This repo has no fp16 build (only fp32/q4/q8); q4 is the smallest option and stands in as the WebGPU headline here.",
  },
  {
    id: "grounding-dino-tiny",
    name: "Grounding DINO Tiny",
    repo: "onnx-community/grounding-dino-tiny-ONNX",
    task: "vision",
    pipelineTask: "zero-shot-object-detection",
    params_m: 172.28,
  },
  {
    id: "sam2.1-hiera-tiny",
    name: "SAM 2.1 Hiera Tiny",
    repo: "onnx-community/sam2.1-hiera-tiny-ONNX",
    task: "vision",
    pipelineTask: null,
    params_m: 38.96,
    notes:
      "Same as SlimSAM: transformers.js has no mask-generation pipeline() task, so use SamModel/SamProcessor with a point or box prompt.",
  },
  {
    id: "birefnet-lite",
    name: "BiRefNet Lite",
    repo: "onnx-community/BiRefNet_lite-ONNX",
    task: "vision",
    pipelineTask: "background-removal",
    params_m: 44.36,
    notes: "Only fp16 and fp32 builds are published for this repo, no quantized variant yet.",
  },
  {
    id: "ben2",
    name: "BEN2",
    repo: "onnx-community/BEN2-ONNX",
    task: "vision",
    pipelineTask: "background-removal",
    params_m: 94.63,
    notes: "Only a single fp16 build is published for this repo.",
  },
  {
    id: "ormbg",
    name: "ORMBG",
    repo: "onnx-community/ormbg-ONNX",
    task: "vision",
    pipelineTask: "background-removal",
    params_m: null,
  },

  // ---- utility (token classification) ----
  {
    id: "punctuate-all",
    name: "Punctuate All",
    repo: "onnx-community/punctuate-all-ONNX",
    task: "utility",
    pipelineTask: "token-classification",
    params_m: 278.89,
    notes: "Param count is read from its xlm-roberta-base backbone (the token-classification head adds negligibly more); treat it as approximate.",
  },
  {
    id: "gliner-small-v2.1",
    name: "GLiNER Small v2.1",
    repo: "onnx-community/gliner_small-v2.1",
    task: "utility",
    pipelineTask: "token-classification",
    params_m: 166,
    notes:
      "Param count is the model card's stated figure, so treat it as approximate. GLiNER uses a span-based architecture rather than plain per-token labels; some setups need the dedicated GLiNER inference code rather than the generic token-classification pipeline().",
  },
  {
    id: "piiranha-v1",
    name: "Piiranha v1 (PII Detection)",
    repo: "onnx-community/piiranha-v1-detect-personal-information-ONNX",
    task: "utility",
    pipelineTask: "token-classification",
    params_m: 278.23,
  },
];

const sizes = JSON.parse(await readFile(SIZES_PATH, "utf8"));

function cleanVariants(repo) {
  const all = sizes[repo];
  if (!all) throw new Error(`No measured sizes for ${repo}`);
  const exclude = new Set(EXCLUDE_VARIANTS[repo] ?? []);
  const out = {};
  for (const [variant, entry] of Object.entries(all)) {
    if (exclude.has(variant)) continue;
    out[variant] = entry.bytes;
  }
  if (Object.keys(out).length === 0) throw new Error(`${repo}: no variants left after exclusions`);
  return out;
}

/** webgpu = q4f16 else fp16; wasm = smaller of q8/uint8 else whichever exists.
 *  If either backend still has nothing after that, fall back to the smallest
 *  clean variant overall so the page always has a headline number to show. */
function headline(variants) {
  let webgpuBytes = variants.q4f16 ?? variants.fp16 ?? null;
  let webgpuVariant = variants.q4f16 != null ? "q4f16" : variants.fp16 != null ? "fp16" : null;

  let wasmBytes = null;
  let wasmVariant = null;
  if (variants.q8 != null && variants.uint8 != null) {
    if (variants.q8 <= variants.uint8) {
      wasmBytes = variants.q8;
      wasmVariant = "q8";
    } else {
      wasmBytes = variants.uint8;
      wasmVariant = "uint8";
    }
  } else if (variants.q8 != null) {
    wasmBytes = variants.q8;
    wasmVariant = "q8";
  } else if (variants.uint8 != null) {
    wasmBytes = variants.uint8;
    wasmVariant = "uint8";
  }

  if (webgpuBytes == null || wasmBytes == null) {
    const [smallestVariant, smallestBytes] = Object.entries(variants).reduce((a, b) => (b[1] < a[1] ? b : a));
    if (webgpuBytes == null) {
      webgpuBytes = smallestBytes;
      webgpuVariant = smallestVariant;
    }
    if (wasmBytes == null) {
      wasmBytes = smallestBytes;
      wasmVariant = smallestVariant;
    }
  }

  return {
    webgpu: { variant: webgpuVariant, bytes: webgpuBytes },
    wasm: { variant: wasmVariant, bytes: wasmBytes },
  };
}

const seen = new Set();
const rows = METADATA.map((m) => {
  if (seen.has(m.id)) throw new Error(`duplicate id: ${m.id}`);
  seen.add(m.id);
  const variants = cleanVariants(m.repo);
  const head = headline(variants);
  const isLarge = head.webgpu.bytes >= LARGE_BYTES || head.wasm.bytes >= LARGE_BYTES;
  const notes = [m.notes, isLarge ? LARGE_NOTE : null].filter(Boolean).join(" ") || undefined;
  const sources = [
    { label: `HuggingFace (sizes measured from HF API ${MEASURED_DATE})`, url: `https://huggingface.co/${m.repo}` },
    ...(m.paramsSourceUrl ? [{ label: "Parameter count source", url: m.paramsSourceUrl }] : []),
  ];
  return {
    id: m.id,
    name: m.name,
    hf_repo: m.repo,
    task: m.task,
    params_m: m.params_m ?? null,
    headline: head,
    variants,
    pipeline_task: m.pipelineTask ?? null,
    sources,
    ...(notes ? { notes } : {}),
  };
});

await writeFile(OUT_PATH, JSON.stringify(rows, null, 2) + "\n");
console.log(`Wrote ${rows.length} rows to ${OUT_PATH}`);
