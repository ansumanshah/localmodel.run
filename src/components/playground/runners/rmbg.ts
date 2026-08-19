import type { LoadOpts, RmbgApi } from "../types";
import { useSelfHostedOrt } from "./ort-paths";
import { adaptProgress, asDtype } from "./util";

// RMBG-1.4 is the one background-removal row that cannot go through the
// generic path below: its config declares a custom architecture string no
// transformers.js auto-class maps to, so pipeline("background-removal")
// rejects it outright. Every other row (MODNet, BiRefNet Lite, BEN2, ORMBG)
// has a real model_type registered in transformers.js 4.2's
// CUSTOM_ARCHITECTURES_MAPPING or its semantic-segmentation fallback (modnet,
// swin, ben, isnet respectively; verified 2026-08-20 by reading each repo's
// own config.json and node_modules/@huggingface/transformers/src/models/registry.js)
// and loads through the real pipeline() call, the same one the package's own
// docs use for MODNet.
const RMBG_1_4_REPO = "briaai/RMBG-1.4";

// This is the flow the official Xenova remove-background-web demo uses for
// RMBG-1.4: AutoModel with model_type "custom", an explicitly configured
// processor, and a manual alpha-mask composite.
const RMBG_1_4_PROCESSOR_CONFIG = {
  do_normalize: true,
  do_pad: false,
  do_rescale: true,
  do_resize: true,
  image_mean: [0.5, 0.5, 0.5],
  feature_extractor_type: "ImageFeatureExtractor",
  image_std: [1, 1, 1],
  resample: 2,
  rescale_factor: 1 / 255,
  size: { width: 1024, height: 1024 },
};

type CutOut = (imageUrl: string) => Promise<{ url: string; ms: number }>;

// Warm-up on a tiny blank image so the first real cut-out measures
// steady-state, not session/shader initialization.
async function warmUp(cutOut: CutOut): Promise<void> {
  const warm = document.createElement("canvas");
  warm.width = 8;
  warm.height = 8;
  warm.getContext("2d")?.fillRect(0, 0, 8, 8);
  const r = await cutOut(warm.toDataURL("image/png"));
  URL.revokeObjectURL(r.url);
}

async function loadRmbg14(opts: LoadOpts): Promise<RmbgApi> {
  useSelfHostedOrt(opts.device);
  const { AutoModel, AutoProcessor, RawImage } = await import("@huggingface/transformers");
  const model = await AutoModel.from_pretrained(opts.hfRepo, {
    // The library accepts a partial config override at runtime (this exact
    // shape is what the official demo passes); the type wants a full one.
    config: { model_type: "custom" } as never,
    device: opts.device,
    dtype: asDtype(opts.dtype),
    progress_callback: adaptProgress(opts.onProgress),
  });
  const processor = await AutoProcessor.from_pretrained(opts.hfRepo, {
    config: RMBG_1_4_PROCESSOR_CONFIG,
  });

  const cutOut: CutOut = async (imageUrl) => {
    const t0 = performance.now();
    const image = await RawImage.fromURL(imageUrl);
    const { pixel_values } = await processor(image);
    const { output } = await model({ input: pixel_values });
    const mask = await RawImage.fromTensor(output[0].mul(255).to("uint8")).resize(
      image.width,
      image.height,
    );
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable.");
    ctx.drawImage(image.toCanvas(), 0, 0);
    const pixels = ctx.getImageData(0, 0, image.width, image.height);
    for (let i = 0; i < mask.data.length; i += 1) pixels.data[4 * i + 3] = mask.data[i];
    ctx.putImageData(pixels, 0, 0);
    const ms = performance.now() - t0;
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG encode failed."))), "image/png"),
    );
    return { url: URL.createObjectURL(blob), ms };
  };

  await warmUp(cutOut);
  return { removeBackground: cutOut };
}

async function loadGeneric(opts: LoadOpts): Promise<RmbgApi> {
  useSelfHostedOrt(opts.device);
  const { pipeline } = await import("@huggingface/transformers");
  const pipe = await pipeline("background-removal", opts.hfRepo, {
    device: opts.device,
    dtype: asDtype(opts.dtype),
    progress_callback: adaptProgress(opts.onProgress),
  });

  const cutOut: CutOut = async (imageUrl) => {
    const t0 = performance.now();
    const result = await pipe(imageUrl);
    const image = Array.isArray(result) ? result[0] : result;
    const ms = performance.now() - t0;
    const blob = await image.toBlob("image/png");
    return { url: URL.createObjectURL(blob), ms };
  };

  await warmUp(cutOut);
  return { removeBackground: cutOut };
}

export async function load(opts: LoadOpts): Promise<RmbgApi> {
  return opts.hfRepo === RMBG_1_4_REPO ? loadRmbg14(opts) : loadGeneric(opts);
}
