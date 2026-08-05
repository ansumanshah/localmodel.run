import type { LoadOpts, PiiApi, PiiEntity } from "../types";
import { alignEntities, type PipelineToken } from "./pii-align";
import { useSelfHostedOrt } from "./ort-paths";
import { adaptProgress, asDtype } from "./util";

export async function load(opts: LoadOpts): Promise<PiiApi> {
  useSelfHostedOrt(opts.device);
  const { pipeline } = await import("@huggingface/transformers");
  const pipe = await pipeline("token-classification", opts.hfRepo, {
    device: opts.device,
    dtype: asDtype(opts.dtype),
    progress_callback: adaptProgress(opts.onProgress),
  });

  async function detect(text: string): Promise<{ entities: PiiEntity[]; ms: number }> {
    const t0 = performance.now();
    // ignore_labels: [] so O tokens come through too; the offset alignment
    // needs the full ordered token stream, not just the flagged ones.
    const out = (await pipe(text, { ignore_labels: [] })) as unknown as
      | PipelineToken[]
      | PipelineToken[][];
    const tokens = (Array.isArray(out[0]) ? out[0] : out) as PipelineToken[];
    return { entities: alignEntities(text, tokens), ms: performance.now() - t0 };
  }

  // One throwaway inference so the first user-visible scan measures
  // steady-state, not session/shader warm-up.
  await detect("warm up");

  return { detect };
}
