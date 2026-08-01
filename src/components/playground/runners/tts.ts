import type { LoadOpts, TtsApi } from "../types";
import { KOKORO_ORT_PREFIX } from "./ort-paths";
import { adaptProgress } from "./util";

// Kokoro is driven through the dedicated kokoro-js package (the
// community-standard path; see the model row's notes), which bundles its own
// transformers.js runtime in this chunk only.
const VOICES = [
  { id: "af_heart", label: "Heart (US female)" },
  { id: "af_bella", label: "Bella (US female)" },
  { id: "am_michael", label: "Michael (US male)" },
  { id: "bf_emma", label: "Emma (UK female)" },
  { id: "bm_george", label: "George (UK male)" },
];

// kokoro-js accepts a narrower dtype union than transformers.js; fail loud
// rather than cast if the catalog ever picks one it cannot load.
const KOKORO_DTYPES = ["fp32", "fp16", "q8", "q4", "q4f16"] as const;
type KokoroDtype = (typeof KOKORO_DTYPES)[number];

function asKokoroDtype(d: string): KokoroDtype {
  if (!(KOKORO_DTYPES as readonly string[]).includes(d)) {
    throw new Error(`The catalog picked dtype "${d}", which kokoro-js does not accept.`);
  }
  return d as KokoroDtype;
}

export async function load(opts: LoadOpts): Promise<TtsApi> {
  const { KokoroTTS, env } = await import("kokoro-js");
  // Self-hosted ORT runtime for kokoro-js's bundled transformers 3.x, which
  // assigns its cdn.jsdelivr.net default at module load, so this overwrite
  // must be unconditional (see scripts/copy-ort-wasm.mjs). Prefix form: its
  // runtime appends its own jsep filenames. The ORT wasm itself loads lazily
  // at session creation, safely after this line.
  env.wasmPaths = KOKORO_ORT_PREFIX;
  const tts = await KokoroTTS.from_pretrained(opts.hfRepo, {
    dtype: asKokoroDtype(opts.dtype),
    device: opts.device,
    progress_callback: adaptProgress(opts.onProgress),
  });
  // Warm-up: synthesizes one word with the default voice, which also fetches
  // that voice's 0.5 MB style file (a raw fetch kokoro-js makes outside
  // progress_callback; measured 522,240 bytes) so the first user run is
  // steady-state and surprise-free.
  await tts.generate("Ready.", { voice: "af_heart" });
  return {
    voices: VOICES,
    async speak(text, voice) {
      const t0 = performance.now();
      const audio = await tts.generate(text, { voice: voice as never });
      const ms = performance.now() - t0;
      const seconds = audio.audio.length / audio.sampling_rate;
      const blob = audio.toBlob();
      return { url: URL.createObjectURL(blob), audioSeconds: seconds, ms };
    },
  };
}
