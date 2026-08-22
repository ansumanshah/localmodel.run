// Shared shapes for the "Run it" playground islands. The island ships on
// every /browser model a runner can honestly drive, not a fixed set of pages
// (see components/playground/registry.ts for the full enabled/denied list
// and why); everything heavy (transformers.js, kokoro-js) lives behind
// dynamic imports in runners/ and loads only on user action.
export type PlaygroundTask =
  | "chat" // pipeline("text-generation", ...): 13 catalog rows, SmolLM2-135M to Phi-3.5-mini
  | "asr" // pipeline("automatic-speech-recognition", ...): the Whisper rows (Moonshine is denied, see registry)
  | "tts" // kokoro-82m only, via the dedicated kokoro-js package
  | "rmbg" // pipeline("background-removal", ...) for most rows; RMBG-1.4 is a bespoke custom-architecture exception
  | "embed" // pipeline("feature-extraction", ...): the embeddings-task rows
  | "vlm" // smolvlm-256m-instruct only, no stable pipeline() task yet
  | "pii" // pipeline("token-classification", ...): piiranha-v1 only, its PII label set specifically
  | "depth" // pipeline("depth-estimation", ...)
  | "clip"; // pipeline("zero-shot-image-classification", ...)
// Serializable subset of BrowserModelRow passed from the .astro page as
// island props. Only what the client needs: identity + the promised numbers.
export interface PlaygroundModel {
  id: string;
  name: string;
  hf_repo: string;
  headline: {
    webgpu: { variant: string; bytes: number };
    wasm: { variant: string; bytes: number };
  };
  // What the live run actually loads, per backend. Usually the headline pick;
  // differs when the headline quant is verified-broken at runtime (SmolVLM's
  // q4f16 garbles on WebGPU), in which case runNote says so on the page.
  run: {
    webgpu: { variant: string; bytes: number };
    wasm: { variant: string; bytes: number };
  };
  runNote?: string;
}

// Normalized model-file download progress, aggregated across files.
export interface ProgressSnapshot {
  /** Bytes downloaded so far for model weight files (.onnx / onnx data). */
  weightsLoaded: number;
  /** Total bytes the runtime reported for weight files seen so far. */
  weightsTotal: number;
  /** Bytes for everything else (tokenizer/config JSON, voice data, ...). */
  extraLoaded: number;
  extraTotal: number;
  /** Files completed / files seen. */
  filesDone: number;
  filesSeen: number;
  /** The file currently downloading, for the status line. */
  currentFile: string | null;
}

export interface NormalizedProgressEvent {
  file: string;
  loaded: number;
  total: number;
  done: boolean;
}

export interface LoadOpts {
  device: "webgpu" | "wasm";
  dtype: string;
  hfRepo: string;
  onProgress: (e: NormalizedProgressEvent) => void;
}

// One measured figure shown in a .readout tile. Values are always measured
// in this session on this device, never estimated.
export interface Metric {
  key: string;
  label: string;
  value: string;
  unit?: string;
}

export type Phase =
  | { name: "idle" }
  | { name: "loading"; progress: ProgressSnapshot }
  | { name: "ready" }
  | { name: "error"; message: string };

// ── Runner contracts ────────────────────────────────────────────────────────
// Our own stable API over the runtimes. Each runners/*.ts module exports
// `load(opts: LoadOpts): Promise<XxxApi>`; sections only see these shapes.
// Timings are wall-clock measurements from this session, nothing estimated.

export interface GenerationResult {
  text: string;
  /** ms from generate() start to the first emitted token. */
  prefillMs: number;
  /** Tokens emitted after the first one, and the ms they took. */
  decodeTokens: number;
  decodeMs: number;
}

export interface ChatApi {
  generate(prompt: string, onToken: (text: string) => void): Promise<GenerationResult>;
}

export interface AsrApi {
  /** audio: mono Float32Array at 16 kHz. */
  transcribe(audio: Float32Array, audioSeconds: number): Promise<{ text: string; ms: number }>;
}

export interface TtsApi {
  voices: { id: string; label: string }[];
  speak(text: string, voice: string): Promise<{ url: string; audioSeconds: number; ms: number }>;
}

export interface RmbgApi {
  /** Returns an object URL of the cut-out PNG. */
  removeBackground(imageUrl: string): Promise<{ url: string; ms: number }>;
}

export interface EmbedApi {
  /** Embeds both texts, returns cosine similarity + per-text embed time. */
  similarity(a: string, b: string): Promise<{ cosine: number; msA: number; msB: number }>;
}

export interface VlmApi {
  describe(
    imageUrl: string,
    prompt: string,
    onToken: (text: string) => void,
  ): Promise<GenerationResult>;
}

/** One detected PII span, with exact character offsets into the input text. */
export interface PiiEntity {
  start: number;
  end: number;
  /** Plain-words category tag: NAME, EMAIL, PHONE, CARD, SSN, ... */
  tag: string;
  text: string;
  /** Mean model confidence across the span's tokens, 0..1. */
  score: number;
}

export interface PiiApi {
  detect(text: string): Promise<{ entities: PiiEntity[]; ms: number }>;
}

export interface DepthApi {
  /** Returns an object URL of the colorized depth-map PNG (bright = near). */
  estimate(imageUrl: string): Promise<{ url: string; ms: number; width: number; height: number }>;
}

export interface ClipApi {
  /** Scores the image against the given labels; probabilities sum to 1. */
  classify(
    imageUrl: string,
    labels: string[],
  ): Promise<{ results: { label: string; score: number }[]; ms: number }>;
}

export type TaskApi =
  | ChatApi
  | AsrApi
  | TtsApi
  | RmbgApi
  | EmbedApi
  | VlmApi
  | PiiApi
  | DepthApi
  | ClipApi;
