import type { DeviceRow, ModelRow, AudioSpec, ImageSpec, VideoSpec } from "@/data/types";
import { canRun, round1, usableGb, type RunResult, type SpeedClass } from "@/lib/compute";

/*
  Multi-modal memory engine. The text path in compute.ts is never touched:
  canRunModality() dispatches text straight back to canRun(). Image / video /
  audio use a different memory model where the verdict basis is a SOURCED
  peak-VRAM-consumed anchor (model.<modality>.recommended.gb), compared against
  the same usableGb(device) the text engine uses, so the "needed <= usable"
  semantics are identical and there is no double-counting of OS headroom.

  Two things text never had to model and this engine does:
  - Runtime gate: a 12B image DiT has no runtime on a phone or a CPU-only
    laptop. modalityRunsOnDevice() encodes where a local runtime exists; off
    those classes the verdict is "no local runtime", not a memory "yes".
  - Offload floor: diffusion can spill to CPU/RAM and run on far less VRAM,
    slowly. We surface that as a note (the inverse of the text upgradeQuant
    note), never as the headline verdict.
*/

export interface ModalityNeed {
  neededGb: number; // peak VRAM consumed at the recommended quant (verdict basis)
  quantLabel: string; // rendered next to the verdict, e.g. "Q4 GGUF"
  offloadFloorGb: number | null;
  noOffloadGb: number | null;
  source: string;
  synthesis: boolean;
  breakdown: { label: string; gb: number; note?: string }[];
}

const PLATFORM_WORD: Record<string, string> = {
  mac: "macOS",
  nvidia: "Windows/Linux GPU",
  amd: "Windows/Linux GPU",
  intel: "Intel",
  laptop: "a CPU-only laptop",
  iphone: "iOS",
  android: "Android",
};

export function modalitySpec(model: ModelRow): ImageSpec | VideoSpec | AudioSpec | null {
  return model.image ?? model.video ?? model.audio ?? null;
}

/** Is there a real local runtime for this model's modality on this device class? */
export function modalityRunsOnDevice(model: ModelRow, device: DeviceRow): boolean {
  const spec = modalitySpec(model);
  if (!spec) return true; // text runs everywhere a runtime exists (handled by canRun)
  return spec.device_classes.includes(device.category);
}

function imageNeed(spec: ImageSpec): ModalityNeed {
  const breakdown: { label: string; gb: number; note?: string }[] = [];
  const bb = spec.backbone_gb;
  const bbGb = bb.q4 ?? bb.fp8 ?? bb.q8 ?? bb.fp16 ?? null;
  if (bbGb != null) breakdown.push({ label: `Backbone (${spec.arch.toUpperCase()})`, gb: bbGb });
  for (const c of spec.components) {
    const g = c.q4_gb ?? c.fp8_gb ?? c.fp16_gb ?? null;
    if (g != null)
      breakdown.push({
        label: c.name,
        gb: g,
        note: c.offloaded ? "offloaded after encode" : undefined,
      });
  }
  if (spec.vae_gb) breakdown.push({ label: "VAE", gb: spec.vae_gb });
  return {
    neededGb: spec.recommended.gb,
    quantLabel: spec.recommended.quant,
    offloadFloorGb: spec.offload_floor_gb ?? null,
    noOffloadGb: spec.no_offload_gb ?? null,
    source: spec.recommended.source,
    synthesis: !!spec.recommended.synthesis,
    breakdown,
  };
}

function videoNeed(spec: VideoSpec): ModalityNeed {
  return {
    neededGb: spec.recommended.gb,
    quantLabel: spec.recommended.quant,
    offloadFloorGb: spec.offload_floor_gb ?? null,
    noOffloadGb: spec.no_offload_gb ?? null,
    source: spec.recommended.source,
    synthesis: !!spec.recommended.synthesis,
    breakdown: [],
  };
}

function audioNeed(spec: AudioSpec): ModalityNeed {
  return {
    neededGb: spec.recommended.gb,
    quantLabel: spec.recommended.quant,
    offloadFloorGb: null,
    noOffloadGb: null,
    source: spec.recommended.source,
    synthesis: !!spec.recommended.synthesis,
    breakdown: [],
  };
}

export function modalityNeed(model: ModelRow): ModalityNeed | null {
  if (model.image) return imageNeed(model.image);
  if (model.video) return videoNeed(model.video);
  if (model.audio) return audioNeed(model.audio);
  return null;
}

/**
 * Verdict for any model on any device. Text dispatches to canRun() untouched.
 * Non-text: gate on runtime, then compare the sourced peak-VRAM anchor to the
 * same usable memory the text engine uses.
 */
export function canRunModality(model: ModelRow, device: DeviceRow): RunResult {
  if (!model.modality || model.modality === "text") return canRun(model, device);

  const usable = usableGb(device);
  const need = modalityNeed(model);
  if (!need) return canRun(model, device); // defensive: mislabeled row falls back to text

  // Runtime gate first; memory is moot if nothing can load the model here.
  if (!modalityRunsOnDevice(model, device)) {
    const word = PLATFORM_WORD[device.category] ?? device.category;
    const kind =
      model.modality === "image" ? "image" : model.modality === "video" ? "video" : "audio";
    return {
      verdict: "no",
      quant: null,
      estimate: null,
      upgradeQuant: null,
      usableGb: usable,
      headroomGb: 0,
      speed: "none",
      reason: `No local runtime to run ${kind} models like ${model.name} on ${word} yet.`,
      neededGb: need.neededGb,
      quantLabel: need.quantLabel,
      offloadFloorGb: need.offloadFloorGb,
      noRuntime: true,
    };
  }

  const headroom = round1(usable - need.neededGb);
  const floorNote =
    need.offloadFloorGb != null
      ? ` With aggressive CPU offload it can run on as little as ~${need.offloadFloorGb} GB, much slower.`
      : "";

  if (need.neededGb > usable) {
    return {
      verdict: "no",
      quant: null,
      estimate: null,
      upgradeQuant: null,
      usableGb: usable,
      headroomGb: headroom,
      speed: "none",
      reason: `Needs ~${need.neededGb} GB at ${need.quantLabel}, but only ~${usable} GB is usable on ${device.name}.${floorNote}`,
      neededGb: need.neededGb,
      quantLabel: need.quantLabel,
      offloadFloorGb: need.offloadFloorGb,
    };
  }

  const tight = headroom < Math.max(1, usable * 0.1);
  const speed: SpeedClass =
    device.category === "nvidia" || device.category === "amd"
      ? "fast"
      : device.category === "mac"
        ? "ok"
        : "slow";
  return {
    verdict: tight ? "tight" : "yes",
    quant: null,
    estimate: null,
    upgradeQuant: null,
    usableGb: usable,
    headroomGb: headroom,
    speed,
    reason: tight
      ? `Fits at ${need.quantLabel} (~${need.neededGb} GB of ~${usable} GB usable) but with little headroom. ${tightAdviceMM(device)}`
      : `Runs at ${need.quantLabel} using ~${need.neededGb} GB of ~${usable} GB usable.`,
    neededGb: need.neededGb,
    quantLabel: need.quantLabel,
    offloadFloorGb: need.offloadFloorGb,
  };
}

// Device-class advice for a tight multi-modal fit. No text context to trim here
// (image/video/audio), so the advice differs from the text engine's. Display only.
function tightAdviceMM(device: DeviceRow): string {
  switch (device.category) {
    case "mac":
      return "Close other apps to free unified memory before generating.";
    case "nvidia":
    case "amd":
      return "Close other apps to free a little VRAM before generating.";
    case "iphone":
    case "android":
      return "Close background apps; expect slow generation on a phone.";
    default:
      return "Close background apps, and expect slow CPU generation.";
  }
}
