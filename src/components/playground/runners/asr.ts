import type { AsrApi, LoadOpts } from "../types";
import { adaptProgress, asDtype } from "./util";

export async function load(opts: LoadOpts): Promise<AsrApi> {
  const { pipeline } = await import("@huggingface/transformers");
  const pipe = await pipeline("automatic-speech-recognition", opts.hfRepo, {
    device: opts.device,
    dtype: asDtype(opts.dtype),
    progress_callback: adaptProgress(opts.onProgress),
  });
  // Warm-up on half a second of silence so the first real transcription
  // measures steady-state, not session/shader initialization.
  await pipe(new Float32Array(8000));
  return {
    async transcribe(audio) {
      const t0 = performance.now();
      // Mono Float32Array at 16 kHz goes straight in; clips here are ≤30 s,
      // whisper's native window, so no chunking options are needed.
      const out = (await pipe(audio)) as { text: string };
      return { text: out.text, ms: performance.now() - t0 };
    },
  };
}
