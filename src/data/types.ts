// Data contracts. Every record carries a `sources` array of primary-source URLs.
// These shapes mirror the validation pipeline output 1:1, so cron-refreshed
// JSON slots in without code changes.

export interface ModelRow {
  id: string; // slug, e.g. "llama-3.1-8b"
  name: string;
  family: string;
  params_b: number; // total parameters, billions
  is_moe: boolean;
  active_params_b: number | null; // active params for MoE; null = dense
  q4_k_m_gb: number | null; // on-disk Q4_K_M GGUF size (GB)
  q8_0_gb: number | null;
  fp16_gb: number | null;
  min_ram_q4_gb: number | null; // realistic min unified RAM / VRAM for Q4 + small ctx
  default_context_k: number | null;
  ollama_tag: string | null;
  release: string | null; // e.g. "2025-04"
  sources: string[];
  notes: string;
  pulls: number | null; // Ollama library pull count (popularity)
  pulls_text: string | null;
  arena_elo?: number | null; // LMArena text leaderboard
  arena_rank?: number | null;
  // Sourced third-party benchmark scores (the leaderboard axes). Partial coverage
  // by design: only set when a row was verified against the canonical leaderboard
  // for the SAME model (size + variant + version). Never estimated.
  aider_polyglot_pct?: number | null; // Aider polyglot coding benchmark, % of 225 Exercism tasks solved
  bfcl_v3_acc?: number | null; // Berkeley Function-Calling Leaderboard v3, overall accuracy % (tool use)
  hf_repo?: string | null; // GGUF repo (e.g. "bartowski/...-GGUF") so update-data.mjs can cron-refresh sizes
  ollama_default_gb?: number | null; // default-tag size from the Ollama OCI manifest (written by the cron)
  subtype?: "vlm" | "embedding" | "coder" | null; // display discriminant; VLM rows render via the text path
  vision_encoder_gb?: number | null; // VLM mmproj/vision projector size, already folded into the GGUF totals
  hf_id?: string | null; // canonical (non-GGUF) HuggingFace repo, for stats + provenance
  hf_downloads?: number | null; // HF Hub downloads, last 30 days (cron-refreshed)
  hf_likes?: number | null; // HF Hub likes (cron-refreshed)
  // Modality discriminant. Absent = "text" (the validated default path).
  // Image / video / audio models carry a modality spec below and use a
  // different memory model (see compute-mm.ts). The text engine is never
  // touched by their presence; they live in separate data arrays.
  modality?: Modality;
  license?: string | null; // SPDX-ish label, e.g. "Apache-2.0", "Stability Community"
  commercial_use?: CommercialUse; // can you ship a product with it?
  license_note?: string | null; // one-line caveat (revenue cap, non-commercial, etc.)
  // Exactly one of these is present when modality !== "text".
  image?: ImageSpec;
  video?: VideoSpec;
  audio?: AudioSpec;
}

export type Modality = "text" | "image" | "video" | "audio";
export type CommercialUse = "yes" | "no" | "conditional";

// A sourced peak-VRAM anchor. `gb` is peak VRAM *consumed* during a run
// (comparable to a device's usable memory), NOT the size of card it needs;
// usable-memory headroom is applied separately so semantics match the text
// engine's `needed <= usableGb(device)`. Every anchor carries its own source.
export interface VramAnchor {
  gb: number;
  quant: string; // human label rendered next to the verdict, e.g. "Q4 GGUF", "fp16"
  source: string; // primary-source URL (validate-data requires this)
  synthesis?: boolean; // true = composed from component sizes, not a single measurement
}

// A pipeline component, sized for the profile-page breakdown.
export interface ComponentSpec {
  name: string; // "T5-XXL text encoder", "VAE", "CLIP-L"
  fp16_gb?: number | null;
  fp8_gb?: number | null;
  q4_gb?: number | null;
  offloaded?: boolean; // moved to CPU before denoising (so not resident at peak)
  source?: string;
}

export type ImageArch = "unet" | "dit" | "mmdit";

// Diffusion image-generation model. Memory = backbone(quant) + resident
// encoders + VAE + activation, with the big text encoder offloaded after
// prompt-encoding, so peak = max(encode-phase, denoise-phase), not the sum.
export interface ImageSpec {
  arch: ImageArch;
  backbone_params_b: number;
  backbone_gb: {
    fp16?: number | null;
    fp8?: number | null;
    q8?: number | null;
    q4?: number | null;
    q2?: number | null;
  };
  components: ComponentSpec[]; // text encoders + VAE, for the breakdown
  vae_gb: number;
  native_resolution: string; // "1024×1024"
  steps: string; // "50", "4", "1-4"
  recommended: VramAnchor; // VERDICT BASIS: peak VRAM consumed at the consumer-default quant
  no_offload_gb?: number | null; // all components resident (the "without offload" note)
  offload_floor_gb?: number | null; // aggressive CPU-offload floor (slow)
  device_classes: DeviceCategory[]; // where a real local runtime exists (the runtime gate)
  tools: string[]; // display, e.g. ["ComfyUI", "Draw Things"]
}

export type VideoArch = "dit" | "unet";

// Video diffusion. Same shape as image plus a frames/seconds activation
// term that dominates peak memory. Populated in a later phase.
export interface VideoSpec {
  arch: VideoArch;
  backbone_params_b: number;
  backbone_gb: {
    fp16?: number | null;
    fp8?: number | null;
    q8?: number | null;
    q4?: number | null;
    q2?: number | null;
  };
  components: ComponentSpec[];
  vae_gb: number;
  default_resolution: string; // "480p", "720p"
  default_frames: number;
  default_seconds: number;
  recommended: VramAnchor;
  no_offload_gb?: number | null;
  offload_floor_gb?: number | null;
  device_classes: DeviceCategory[];
  tools: string[];
}

export type AudioSubtype = "stt" | "tts" | "music";

// Audio / voice. Mostly weights + a small fixed activation; runs on almost
// anything for the small subtypes. Populated in a later phase.
export interface AudioSpec {
  subtype: AudioSubtype;
  backbone_params_b: number;
  precision: string; // dominant runtime precision, e.g. "fp16", "int8 (GGUF)"
  recommended: VramAnchor; // peak VRAM/RAM consumed
  cpu_ok: boolean; // runs acceptably on CPU (true for tiny TTS/STT)
  device_classes: DeviceCategory[];
  tools: string[];
  task: string; // human label, e.g. "Speech to text", "Text to speech", "Music generation"
}

export type DeviceCategory = "mac" | "nvidia" | "amd" | "intel" | "laptop" | "iphone" | "android";

export type MemoryType = "unified" | "vram" | "ram";

export interface DeviceRow {
  id: string;
  name: string;
  category: DeviceCategory;
  memory_gb: number;
  memory_type: MemoryType;
  usable_memory_gb: number | null; // usable for weights after OS/headroom
  bandwidth_gbs?: number | null; // peak memory bandwidth (GB/s), drives the tok/s estimate
  msrp_usd?: number | null; // approximate launch/street price (USD), base config
  tdp_w?: number | null; // typical power draw under load (watts)
  best_runtime: string | null;
  sources: string[];
  notes: string;
}

export type Platform = "mac" | "windows" | "linux" | "ios" | "android";

export interface ToolRow {
  platform: Platform;
  beginner: { name: string; why: string; command: string | null };
  power: { name: string; why: string; command: string | null };
  runtimes: { name: string; what: string; status: string; url: string }[];
  gotcha: string;
  ceiling: string; // realistic model-size ceiling on typical hardware
  sources: string[];
}

export interface DataMeta {
  updated: string; // ISO date of last validated data refresh (drives "Validated …" prose)
  site_updated?: string; // ISO date the site itself was last meaningfully updated (footer)
  launched?: string; // stable site launch date, used as JSON-LD datePublished
  generated_by: string;
  sources: string[]; // global provenance
  formula_version: string;
}

export type Verdict = "yes" | "tight" | "no" | "unknown";
