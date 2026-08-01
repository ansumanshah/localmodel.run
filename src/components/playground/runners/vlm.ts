import type { LoadOpts, VlmApi } from "../types";
import { adaptProgress, asDtype, makeStreamMeter } from "./util";

// SmolVLM has no stable pipeline() task; this is the verified low-level flow
// from the official smolvlm-webgpu example (AutoProcessor +
// AutoModelForVision2Seq + apply_chat_template), the same flow the page's
// code snippet documents.
export async function load(opts: LoadOpts): Promise<VlmApi> {
  const { AutoProcessor, AutoModelForVision2Seq, TextStreamer, load_image } =
    await import("@huggingface/transformers");
  const processor = await AutoProcessor.from_pretrained(opts.hfRepo, {
    progress_callback: adaptProgress(opts.onProgress),
  });
  const model = await AutoModelForVision2Seq.from_pretrained(opts.hfRepo, {
    device: opts.device,
    dtype: asDtype(opts.dtype),
    progress_callback: adaptProgress(opts.onProgress),
  });
  const tokenizer = processor.tokenizer;
  if (!tokenizer) throw new Error("The processor for this model has no tokenizer to stream with.");
  return {
    async describe(imageUrl, prompt, onToken) {
      const image = await load_image(imageUrl);
      const messages = [
        { role: "user", content: [{ type: "image" }, { type: "text", text: prompt }] },
      ];
      const text = processor.apply_chat_template(messages, { add_generation_prompt: true });
      const inputs = await processor(text, [image]);
      const meter = makeStreamMeter(onToken);
      const streamer = new TextStreamer(tokenizer, {
        skip_prompt: true,
        skip_special_tokens: true,
        callback_function: (piece: string) => meter.onPiece(piece),
        token_callback_function: () => meter.onTokens(),
      });
      await model.generate({ ...inputs, max_new_tokens: 128, do_sample: false, streamer });
      return meter.result();
    },
  };
}
