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
      // Sampled decoding: greedy search collapses a small instruction model
      // into repetition loops within a few sentences. This is still the
      // model's real output, just its usable configuration, and the same
      // knobs hold across every text-generation model this runner drives
      // (135M to 3.8B).
      await pipe(messages, {
        // Forwarded into apply_chat_template. transformers.js destructures
        // `tokenizer_encode_kwargs` off the generate options and spreads it
        // into chat_template_kwargs (src/pipelines/text-generation.js:111 and
        // :147). The name matters: `tokenizer_kwargs` is only its internal
        // alias and is silently dropped as an unknown generation option,
        // verified in a live browser run. Qwen3's template reads
        // enable_thinking and, left at its default, opens a <think> block
        // that eats the whole token budget and leaves the visitor looking at
        // an unfinished thought instead of an answer. Templates that do not
        // declare the variable ignore it, so this is safe for all 13 rows.
        tokenizer_encode_kwargs: { enable_thinking: false },
        // 384, not 256: the models whose template hard-codes a <think> block
        // with no switch to turn it off (Bonsai-1.7B) need room to close the
        // thought AND answer. Verified per model against its own
        // tokenizer_config.json chat template, not assumed.
        max_new_tokens: 384,
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
