import type { PlaygroundTask } from "./types";

// The ONLY pages that ship a React island. Everything else on /browser stays
// zero-client-JS. Each entry is a flagship model whose in-browser run is the
// demo for its whole task family.
export const PLAYGROUND_TASKS: Record<string, PlaygroundTask> = {
  "smollm2-135m-instruct": "chat",
  "whisper-tiny": "asr",
  "kokoro-82m": "tts",
  "rmbg-1.4": "rmbg",
  "all-minilm-l6-v2": "embed",
  "smolvlm-256m-instruct": "vlm",
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
};
