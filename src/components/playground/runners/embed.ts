import type { EmbedApi, LoadOpts } from "../types";
import { adaptProgress, asDtype } from "./util";

export async function load(opts: LoadOpts): Promise<EmbedApi> {
  const { pipeline } = await import("@huggingface/transformers");
  const pipe = await pipeline("feature-extraction", opts.hfRepo, {
    device: opts.device,
    dtype: asDtype(opts.dtype),
    progress_callback: adaptProgress(opts.onProgress),
  });

  // One throwaway inference so the first user-visible run measures
  // steady-state, not GPU shader warm-up (~300 ms vs ~11 ms on an M4).
  await pipe("warm up", { pooling: "mean", normalize: true });

  async function embed(text: string): Promise<{ vec: Float32Array; ms: number }> {
    const t0 = performance.now();
    const out = await pipe(text, { pooling: "mean", normalize: true });
    return { vec: out.data as Float32Array, ms: performance.now() - t0 };
  }

  return {
    async similarity(a, b) {
      const ra = await embed(a);
      const rb = await embed(b);
      // Both vectors are L2-normalized, so cosine similarity is the dot product.
      let dot = 0;
      for (let i = 0; i < ra.vec.length; i += 1) dot += ra.vec[i] * rb.vec[i];
      return { cosine: dot, msA: ra.ms, msB: rb.ms };
    },
  };
}
