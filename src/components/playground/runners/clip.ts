import type { ClipApi, LoadOpts } from "../types";
import { useSelfHostedOrt } from "./ort-paths";
import { adaptProgress, asDtype } from "./util";

export async function load(opts: LoadOpts): Promise<ClipApi> {
  useSelfHostedOrt(opts.device);
  const { pipeline } = await import("@huggingface/transformers");
  const pipe = await pipeline("zero-shot-image-classification", opts.hfRepo, {
    device: opts.device,
    dtype: asDtype(opts.dtype),
    progress_callback: adaptProgress(opts.onProgress),
  });

  async function classify(imageUrl: string, labels: string[]) {
    const t0 = performance.now();
    const out = (await pipe(imageUrl, labels)) as { label: string; score: number }[];
    const results = [...out].sort((a, b) => b.score - a.score);
    return { results, ms: performance.now() - t0 };
  }

  // Warm-up on a tiny blank image so the first real ranking measures
  // steady-state, not session/shader initialization.
  const warm = document.createElement("canvas");
  warm.width = 8;
  warm.height = 8;
  warm.getContext("2d")?.fillRect(0, 0, 8, 8);
  await classify(warm.toDataURL("image/png"), ["warm up"]);

  return { classify };
}
