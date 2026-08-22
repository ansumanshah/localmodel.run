import type { DepthApi, LoadOpts } from "../types";
import { useSelfHostedOrt } from "./ort-paths";
import { adaptProgress, asDtype } from "./util";

// Inferno-style ramp for the depth readout: model output is normalized
// inverse depth (255 = nearest), so bright/warm reads as near, dark as far.
const STOPS: [number, [number, number, number]][] = [
  [0.0, [0, 0, 4]],
  [0.25, [87, 16, 110]],
  [0.5, [188, 55, 84]],
  [0.75, [249, 142, 9]],
  [1.0, [252, 255, 164]],
];

function buildLut(): Uint8Array {
  const lut = new Uint8Array(256 * 3);
  for (let v = 0; v < 256; v += 1) {
    const t = v / 255;
    let hi = STOPS.findIndex(([p]) => p >= t);
    if (hi <= 0) hi = t <= 0 ? 1 : STOPS.length - 1;
    const [p0, c0] = STOPS[hi - 1];
    const [p1, c1] = STOPS[hi];
    const f = (t - p0) / (p1 - p0);
    for (let ch = 0; ch < 3; ch += 1)
      lut[v * 3 + ch] = Math.round(c0[ch] + (c1[ch] - c0[ch]) * f);
  }
  return lut;
}

export async function load(opts: LoadOpts): Promise<DepthApi> {
  useSelfHostedOrt(opts.device);
  const { pipeline, RawImage } = await import("@huggingface/transformers");
  const pipe = await pipeline("depth-estimation", opts.hfRepo, {
    device: opts.device,
    dtype: asDtype(opts.dtype),
    progress_callback: adaptProgress(opts.onProgress),
  });
  const lut = buildLut();

  async function estimate(imageUrl: string) {
    const t0 = performance.now();
    const image = await RawImage.fromURL(imageUrl);
    const out = (await pipe(image)) as { depth: InstanceType<typeof RawImage> };
    // The pipeline interpolates the depth map back to the input size; resize
    // defensively anyway so the composite never depends on that behavior.
    let depth = out.depth;
    if (depth.width !== image.width || depth.height !== image.height)
      depth = await depth.resize(image.width, image.height);
    const gray = depth.data;
    const rgba = new Uint8ClampedArray(depth.width * depth.height * 4);
    for (let i = 0; i < depth.width * depth.height; i += 1) {
      const v = gray[i * depth.channels];
      rgba[4 * i] = lut[v * 3];
      rgba[4 * i + 1] = lut[v * 3 + 1];
      rgba[4 * i + 2] = lut[v * 3 + 2];
      rgba[4 * i + 3] = 255;
    }
    const canvas = document.createElement("canvas");
    canvas.width = depth.width;
    canvas.height = depth.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable.");
    ctx.putImageData(new ImageData(rgba, depth.width, depth.height), 0, 0);
    const ms = performance.now() - t0;
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG encode failed."))), "image/png"),
    );
    return { url: URL.createObjectURL(blob), ms, width: depth.width, height: depth.height };
  }

  // Warm-up on a tiny blank image so the first real map measures
  // steady-state, not session/shader initialization.
  const warm = document.createElement("canvas");
  warm.width = 8;
  warm.height = 8;
  warm.getContext("2d")?.fillRect(0, 0, 8, 8);
  await estimate(warm.toDataURL("image/png")).then((r) => URL.revokeObjectURL(r.url));

  return { estimate };
}
