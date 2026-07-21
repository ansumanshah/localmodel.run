import { test, expect, describe } from "bun:test";
import type { DeviceRow, ImageSpec, ModelRow } from "@/data/types";
import { canRun, round1, usableGb } from "@/lib/compute";
import {
  canRunModality,
  modalityNeed,
  modalitySpec,
  modalityRunsOnDevice,
} from "@/lib/compute-mm";
import { imageModels, videoModels, audioModels, devices } from "@/lib/data";

// The multi-modal engine decides every image/video/audio verdict on the site.
// Its two rules that the text engine never had (the runtime gate, and the
// sourced peak-VRAM anchor as the verdict basis) are pinned here, plus the
// real-data invariants a weekly refresh must not break.

const device = (over: Partial<DeviceRow> = {}): DeviceRow =>
  ({
    id: "t",
    name: "T",
    category: "nvidia",
    memory_gb: 25,
    memory_type: "vram",
    usable_memory_gb: null,
    best_runtime: null,
    sources: [],
    notes: "",
    ...over,
  }) as DeviceRow;

const imageSpec = (over: Partial<ImageSpec> = {}): ImageSpec =>
  ({
    arch: "dit",
    backbone_params_b: 12,
    backbone_gb: { fp16: 24, fp8: 12, q8: 12, q4: 6 },
    components: [],
    vae_gb: 0.3,
    native_resolution: "1024x1024",
    steps: "20",
    recommended: { gb: 10, quant: "Q4 GGUF", source: "https://example.test" },
    device_classes: ["nvidia", "amd", "mac"],
    tools: [],
    ...over,
  }) as ImageSpec;

const imageModel = (spec: Partial<ImageSpec> = {}, over: Partial<ModelRow> = {}): ModelRow =>
  ({
    id: "img",
    name: "Img",
    family: "Img",
    params_b: 12,
    is_moe: false,
    active_params_b: null,
    q4_k_m_gb: null,
    q8_0_gb: null,
    fp16_gb: null,
    min_ram_q4_gb: null,
    default_context_k: 0,
    ollama_tag: null,
    release: null,
    sources: [],
    notes: "",
    pulls: null,
    pulls_text: null,
    modality: "image",
    image: imageSpec(spec),
    ...over,
  }) as ModelRow;

describe("dispatch", () => {
  test("text rows go straight back to the text engine", () => {
    const text = {
      id: "t",
      name: "T",
      family: "T",
      params_b: 8,
      is_moe: false,
      active_params_b: null,
      q4_k_m_gb: 4.9,
      q8_0_gb: null,
      fp16_gb: null,
      min_ram_q4_gb: null,
      default_context_k: 8,
      ollama_tag: "t",
      release: null,
      sources: [],
      notes: "",
      pulls: null,
      pulls_text: null,
      modality: "text",
    } as unknown as ModelRow;
    const d = device({ category: "mac", memory_type: "unified", usable_memory_gb: 10 });
    expect(canRunModality(text, d)).toEqual(canRun(text, d));
  });

  test("modalitySpec picks the one populated spec", () => {
    const m = imageModel();
    expect(modalitySpec(m)).toBe(m.image!);
  });
});

describe("runtime gate", () => {
  test("an unsupported device class is a no, however much memory it has", () => {
    const m = imageModel({ device_classes: ["nvidia"] });
    const r = canRunModality(m, device({ category: "iphone", memory_gb: 512 }));
    expect(r.verdict).toBe("no");
    expect(r.noRuntime).toBe(true);
    expect(r.reason).toContain("No local runtime");
    expect(r.speed).toBe("none");
  });

  test("a supported device class is not gated", () => {
    const m = imageModel({ device_classes: ["nvidia"] });
    expect(modalityRunsOnDevice(m, device({ category: "nvidia" }))).toBe(true);
    expect(canRunModality(m, device()).noRuntime).toBeUndefined();
  });
});

describe("verdict from the sourced anchor", () => {
  test("needed above usable is a no and reports both numbers", () => {
    const m = imageModel({ recommended: { gb: 30, quant: "Q4 GGUF", source: "s" } });
    const d = device({ memory_gb: 13 }); // 12 GB usable
    const r = canRunModality(m, d);
    expect(r.verdict).toBe("no");
    expect(r.neededGb).toBe(30);
    expect(r.usableGb).toBe(12);
    expect(r.reason).toContain("30");
    expect(r.reason).toContain("12");
  });

  test("the offload floor is a note on a no, never the verdict", () => {
    const spec = { recommended: { gb: 30, quant: "Q4 GGUF", source: "s" }, offload_floor_gb: 6 };
    const r = canRunModality(imageModel(spec), device({ memory_gb: 13 }));
    expect(r.verdict).toBe("no");
    expect(r.offloadFloorGb).toBe(6);
    expect(r.reason).toContain("6 GB");
  });

  test("no floor in the data means no floor sentence", () => {
    const r = canRunModality(
      imageModel({ recommended: { gb: 30, quant: "Q4 GGUF", source: "s" } }),
      device({ memory_gb: 13 }),
    );
    expect(r.offloadFloorGb).toBeNull();
    expect(r.reason).not.toContain("offload");
  });

  test("comfortable headroom is a yes, thin headroom is tight", () => {
    const m = imageModel({ recommended: { gb: 10, quant: "Q4 GGUF", source: "s" } });
    expect(canRunModality(m, device({ memory_gb: 25 })).verdict).toBe("yes"); // 24 usable
    expect(canRunModality(m, device({ memory_gb: 11 })).verdict).toBe("tight"); // 10 usable
  });

  test("headroom is usable minus needed, rounded to one decimal", () => {
    const m = imageModel({ recommended: { gb: 10.4, quant: "Q4 GGUF", source: "s" } });
    const d = device({ memory_gb: 25 });
    const r = canRunModality(m, d);
    expect(r.headroomGb).toBe(round1(usableGb(d) - 10.4));
  });

  test("speed class follows the device family", () => {
    const m = imageModel({ device_classes: ["nvidia", "amd", "mac", "laptop"] });
    expect(canRunModality(m, device({ category: "nvidia" })).speed).toBe("fast");
    expect(canRunModality(m, device({ category: "amd" })).speed).toBe("fast");
    expect(
      canRunModality(m, device({ category: "mac", memory_type: "unified", usable_memory_gb: 24 }))
        .speed,
    ).toBe("ok");
    expect(
      canRunModality(m, device({ category: "laptop", memory_type: "ram", memory_gb: 64 })).speed,
    ).toBe("slow");
  });
});

describe("memory breakdown", () => {
  test("the backbone row prefers the smallest sourced quant", () => {
    const need = modalityNeed(imageModel())!;
    expect(need.breakdown[0].gb).toBe(6); // q4 over fp8/q8/fp16
    expect(need.breakdown[0].label).toContain("DIT");
  });

  test("components carry the offload note, the VAE closes the list", () => {
    const need = modalityNeed(
      imageModel({
        components: [
          { name: "T5-XXL", fp16_gb: 9.5, q8_gb: 5, offloaded: true },
          { name: "CLIP-L", fp16_gb: 0.25, offloaded: false },
        ] as ImageSpec["components"],
      }),
    )!;
    const t5 = need.breakdown.find((b) => b.label === "T5-XXL")!;
    expect(t5.note).toBe("offloaded after encode");
    expect(need.breakdown.find((b) => b.label === "CLIP-L")!.note).toBeUndefined();
    expect(need.breakdown.at(-1)!.label).toBe("VAE");
  });
});

describe("real catalog invariants", () => {
  const mm = [...imageModels, ...videoModels, ...audioModels];

  test("every multi-modal row has a sourced anchor and somewhere to run", () => {
    expect(mm.length).toBeGreaterThan(0);
    for (const m of mm) {
      const need = modalityNeed(m);
      expect(need).not.toBeNull();
      expect(need!.neededGb).toBeGreaterThan(0);
      expect(need!.source.length).toBeGreaterThan(0);
      expect(modalitySpec(m)!.device_classes.length).toBeGreaterThan(0);
    }
  });

  test("the offload floor never exceeds the anchor, which never exceeds no-offload", () => {
    for (const m of mm) {
      const spec = modalitySpec(m)!;
      const rec = spec.recommended.gb;
      if ("offload_floor_gb" in spec && spec.offload_floor_gb != null)
        expect(spec.offload_floor_gb).toBeLessThanOrEqual(rec);
      if ("no_offload_gb" in spec && spec.no_offload_gb != null)
        expect(spec.no_offload_gb).toBeGreaterThanOrEqual(rec);
    }
  });

  test("no page can claim a fit without a runtime or without the memory", () => {
    for (const m of mm) {
      for (const d of devices) {
        const r = canRunModality(m, d);
        if (r.verdict === "yes" || r.verdict === "tight") {
          expect(modalityRunsOnDevice(m, d)).toBe(true);
          expect(r.neededGb!).toBeLessThanOrEqual(r.usableGb);
        }
      }
    }
  });
});
