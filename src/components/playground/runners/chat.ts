import type { ChatApi, LoadOpts } from "../types";
import { useSelfHostedOrt } from "./ort-paths";
import { adaptProgress, makeStreamMeter, asDtype } from "./util";

export async function load(opts: LoadOpts): Promise<ChatApi> {
  useSelfHostedOrt(opts.device);
  const { pipeline, TextStreamer } = await import("@huggingface/transformers");
  const pipe = await pipeline("text-generation", opts.hfRepo, {
    device: opts.device,
    dtype: asDtype(opts.dtype),
    progress_callback: adaptProgress(opts.onProgress),
  });
  return {
    async generate(prompt, onToken) {
      const meter = makeStreamMeter(onToken);
      const streamer = new TextStreamer(pipe.tokenizer, {
        skip_prompt: true,
        skip_special_tokens: true,
        callback_function: (piece: string) => meter.onPiece(piece),
        token_callback_function: () => meter.onTokens(),
      });
      const messages = [{ role: "user", content: prompt }];
      // Sampled decoding: greedy search collapses a 135M model into
      // repetition loops within a few sentences. This is still the model's
      // real output, just its usable configuration.
      await pipe(messages, {
        max_new_tokens: 256,
        do_sample: true,
        temperature: 0.7,
        top_p: 0.9,
        repetition_penalty: 1.15,
        streamer,
      });
      return meter.result();
    },
  };
}
