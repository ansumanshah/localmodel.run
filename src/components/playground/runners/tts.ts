import type { LoadOpts, TtsApi } from "../types";
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

export async function load(opts: LoadOpts): Promise<TtsApi> {
  const { KokoroTTS } = await import("kokoro-js");
  const tts = await KokoroTTS.from_pretrained(opts.hfRepo, {
    dtype: opts.dtype as "q8" | "q4f16" | "fp16" | "fp32",
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
