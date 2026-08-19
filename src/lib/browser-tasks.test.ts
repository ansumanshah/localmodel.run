import { test, expect, describe } from "bun:test";
import type { BrowserModelRow } from "@/data/types";
import {
  browserGroupDensitySpreadBullet,
  browserGroupNotableModels,
  browserGroupReadingBullets,
  browserGroupSizeRatioBullet,
  browserGroupSizeStats,
  browserGroupSnippet,
  browserGroupTotalBytes,
  browserGroupUnder100MbBullet,
  browserGroupVariantUniformity,
  browserGroupWasmInversionBullet,
  browserTaskGroup,
  browserTaskGroups,
  browserTaskH1,
  type BrowserTaskGroup,
} from "@/lib/browser-tasks";

// Small fixture rows: only the fields the browser-tasks functions read.
// Sorted ascending by webgpu bytes, matching what browserModelsByTask() hands
// a real BrowserTaskGroup.
const row = (over: Partial<BrowserModelRow> & { id: string }): BrowserModelRow => ({
  name: over.id,
  hf_repo: `onnx-community/${over.id}`,
  task: "speech-to-text",
  params_m: null,
  headline: { webgpu: { variant: "q4f16", bytes: 100 }, wasm: { variant: "q8", bytes: 100 } },
  variants: {},
  pipeline_task: null,
  sources: [],
  ...over,
});

describe("browserGroupSizeStats", () => {
  test("smallest/largest/median for an odd-length group", () => {
    const models = [
      row({ id: "a", headline: { webgpu: { variant: "q4f16", bytes: 100 }, wasm: { variant: "q8", bytes: 90 } } }),
      row({ id: "b", headline: { webgpu: { variant: "q4f16", bytes: 200 }, wasm: { variant: "q8", bytes: 190 } } }),
      row({ id: "c", headline: { webgpu: { variant: "q4f16", bytes: 300 }, wasm: { variant: "q8", bytes: 290 } } }),
    ];
    const stats = browserGroupSizeStats(models);
    expect(stats.count).toBe(3);
    expect(stats.smallest.id).toBe("a");
    expect(stats.largest.id).toBe("c");
    expect(stats.median.id).toBe("b");
    expect(stats.medianBytes).toBe(200);
  });

  test("median for an even-length group averages the two middle bytes and picks the lower as the link", () => {
    const models = [
      row({ id: "a", headline: { webgpu: { variant: "q4f16", bytes: 100 }, wasm: { variant: "q8", bytes: 100 } } }),
      row({ id: "b", headline: { webgpu: { variant: "q4f16", bytes: 200 }, wasm: { variant: "q8", bytes: 200 } } }),
      row({ id: "c", headline: { webgpu: { variant: "q4f16", bytes: 400 }, wasm: { variant: "q8", bytes: 400 } } }),
      row({ id: "d", headline: { webgpu: { variant: "q4f16", bytes: 500 }, wasm: { variant: "q8", bytes: 500 } } }),
    ];
    const stats = browserGroupSizeStats(models);
    expect(stats.medianBytes).toBe(300); // (200 + 400) / 2
    expect(stats.median.id).toBe("b"); // lower of the two middle rows
  });
});

describe("browserGroupNotableModels", () => {
  test("dedupes smallest/median/largest to 2 links for a 2-model group", () => {
    const models = [
      row({ id: "a", headline: { webgpu: { variant: "q4f16", bytes: 100 }, wasm: { variant: "q8", bytes: 100 } } }),
      row({ id: "b", headline: { webgpu: { variant: "q4f16", bytes: 200 }, wasm: { variant: "q8", bytes: 200 } } }),
    ];
    const notable = browserGroupNotableModels(models);
    expect(notable.map((m) => m.id)).toEqual(["a", "b"]);
  });

  test("keeps 3 distinct links for a 3+ model group", () => {
    const models = [
      row({ id: "a", headline: { webgpu: { variant: "q4f16", bytes: 100 }, wasm: { variant: "q8", bytes: 100 } } }),
      row({ id: "b", headline: { webgpu: { variant: "q4f16", bytes: 200 }, wasm: { variant: "q8", bytes: 200 } } }),
      row({ id: "c", headline: { webgpu: { variant: "q4f16", bytes: 300 }, wasm: { variant: "q8", bytes: 300 } } }),
    ];
    expect(browserGroupNotableModels(models).map((m) => m.id)).toEqual(["a", "b", "c"]);
  });
});

describe("browserGroupSizeRatioBullet", () => {
  test("computes the largest/smallest ratio from measured bytes", () => {
    const models = [
      row({ id: "small", headline: { webgpu: { variant: "q4f16", bytes: 1024 * 1024 }, wasm: { variant: "q8", bytes: 1024 * 1024 } } }),
      row({ id: "big", headline: { webgpu: { variant: "q4f16", bytes: 10 * 1024 * 1024 }, wasm: { variant: "q8", bytes: 10 * 1024 * 1024 } } }),
    ];
    const parts = browserGroupSizeRatioBullet(models);
    const nums = parts.filter((p): p is { num: string } => typeof p !== "string");
    expect(nums[0]!.num).toBe("10.0x");
  });
});

describe("browserGroupWasmInversionBullet", () => {
  test("reports zero inversions honestly, not as a gap", () => {
    const models = [
      row({ id: "a", headline: { webgpu: { variant: "q4f16", bytes: 100 }, wasm: { variant: "q8", bytes: 200 } } }),
      row({ id: "b", headline: { webgpu: { variant: "q4f16", bytes: 300 }, wasm: { variant: "q8", bytes: 400 } } }),
    ];
    const parts = browserGroupWasmInversionBullet(models);
    expect(parts.some((p) => typeof p === "string" && p.includes("None of the"))).toBe(true);
  });

  test("counts and names inversions when wasm is smaller than webgpu", () => {
    const models = [
      row({ id: "a", name: "Model A", headline: { webgpu: { variant: "q4f16", bytes: 200 }, wasm: { variant: "q8", bytes: 100 } } }),
      row({ id: "b", name: "Model B", headline: { webgpu: { variant: "q4f16", bytes: 300 }, wasm: { variant: "q8", bytes: 400 } } }),
    ];
    const parts = browserGroupWasmInversionBullet(models);
    const nums = parts.filter((p): p is { num: string } => typeof p !== "string");
    expect(nums[0]!.num).toBe("1 of 2");
    expect(parts.some((p) => typeof p === "string" && p.includes("Model A"))).toBe(true);
  });
});

describe("browserGroupUnder100MbBullet", () => {
  test("counts rows under the 100 MB threshold", () => {
    const mb = 1024 * 1024;
    const models = [
      row({ id: "a", headline: { webgpu: { variant: "q4f16", bytes: 50 * mb }, wasm: { variant: "q8", bytes: 50 * mb } } }),
      row({ id: "b", headline: { webgpu: { variant: "q4f16", bytes: 500 * mb }, wasm: { variant: "q8", bytes: 500 * mb } } }),
    ];
    const parts = browserGroupUnder100MbBullet(models);
    const nums = parts.filter((p): p is { num: string } => typeof p !== "string");
    expect(nums[0]!.num).toBe("1 of 2");
  });
});

describe("browserGroupDensitySpreadBullet", () => {
  test("null below 3 models with known params_m", () => {
    const mb = 1024 * 1024;
    const models = [
      row({ id: "a", params_m: 10, headline: { webgpu: { variant: "q4f16", bytes: 10 * mb }, wasm: { variant: "q8", bytes: 10 * mb } } }),
      row({ id: "b", params_m: 20, headline: { webgpu: { variant: "q4f16", bytes: 40 * mb }, wasm: { variant: "q8", bytes: 40 * mb } } }),
    ];
    expect(browserGroupDensitySpreadBullet(models)).toBeNull();
  });

  test("fires at 3+ known params_m with a >=1.5x spread", () => {
    const mb = 1024 * 1024;
    const models = [
      row({ id: "a", params_m: 10, headline: { webgpu: { variant: "q4f16", bytes: 10 * mb }, wasm: { variant: "q8", bytes: 10 * mb } } }), // 1 MB/M
      row({ id: "b", params_m: 20, headline: { webgpu: { variant: "q4f16", bytes: 20 * mb }, wasm: { variant: "q8", bytes: 20 * mb } } }), // 1 MB/M
      row({ id: "c", params_m: 10, headline: { webgpu: { variant: "q4f16", bytes: 30 * mb }, wasm: { variant: "q8", bytes: 30 * mb } } }), // 3 MB/M
    ];
    const parts = browserGroupDensitySpreadBullet(models);
    expect(parts).not.toBeNull();
    const nums = parts!.filter((p): p is { num: string } => typeof p !== "string");
    expect(nums[0]!.num).toBe("3.0x");
  });
});

describe("browserGroupReadingBullets", () => {
  test("always returns at least 3 bullets (ratio, inversion, under-100MB)", () => {
    const models = [
      row({ id: "a", headline: { webgpu: { variant: "q4f16", bytes: 1000 }, wasm: { variant: "q8", bytes: 1000 } } }),
      row({ id: "b", headline: { webgpu: { variant: "q4f16", bytes: 2000 }, wasm: { variant: "q8", bytes: 2000 } } }),
    ];
    expect(browserGroupReadingBullets(models).length).toBeGreaterThanOrEqual(3);
  });
});

describe("browserGroupVariantUniformity", () => {
  test("uniform when every model shares one webgpu variant", () => {
    const models = [
      row({ id: "a", headline: { webgpu: { variant: "q4f16", bytes: 100 }, wasm: { variant: "q8", bytes: 100 } } }),
      row({ id: "b", headline: { webgpu: { variant: "q4f16", bytes: 200 }, wasm: { variant: "q8", bytes: 200 } } }),
    ];
    const u = browserGroupVariantUniformity(models);
    expect(u.uniform).toBe(true);
    expect(u.variant).toBe("q4f16");
  });

  test("breaks down counts, most common first, when variants differ", () => {
    const models = [
      row({ id: "a", headline: { webgpu: { variant: "fp16", bytes: 100 }, wasm: { variant: "q8", bytes: 100 } } }),
      row({ id: "b", headline: { webgpu: { variant: "q4f16", bytes: 200 }, wasm: { variant: "q8", bytes: 200 } } }),
      row({ id: "c", headline: { webgpu: { variant: "q4f16", bytes: 300 }, wasm: { variant: "q8", bytes: 300 } } }),
    ];
    const u = browserGroupVariantUniformity(models);
    expect(u.uniform).toBe(false);
    expect(u.counts[0]).toEqual({ variant: "q4f16", count: 2 });
  });
});

describe("browserGroupTotalBytes", () => {
  test("sums webgpu headline bytes across the group", () => {
    const models = [
      row({ id: "a", headline: { webgpu: { variant: "q4f16", bytes: 100 }, wasm: { variant: "q8", bytes: 100 } } }),
      row({ id: "b", headline: { webgpu: { variant: "q4f16", bytes: 250 }, wasm: { variant: "q8", bytes: 250 } } }),
    ];
    expect(browserGroupTotalBytes(models)).toBe(350);
  });
});

describe("browserGroupSnippet", () => {
  test("builds a pipeline() snippet for the smallest model when the group shares one pipeline_task", () => {
    const group: BrowserTaskGroup = {
      task: "embeddings",
      label: "Embeddings",
      models: [
        row({
          id: "small-embed",
          name: "Small Embed",
          hf_repo: "onnx-community/small-embed",
          pipeline_task: "feature-extraction",
          headline: { webgpu: { variant: "q4f16", bytes: 100 }, wasm: { variant: "q8", bytes: 100 } },
        }),
        row({
          id: "big-embed",
          pipeline_task: "feature-extraction",
          headline: { webgpu: { variant: "q4f16", bytes: 200 }, wasm: { variant: "q8", bytes: 200 } },
        }),
      ],
    };
    const snippet = browserGroupSnippet(group);
    expect(snippet).toContain('pipeline("feature-extraction", "onnx-community/small-embed"');
    expect(snippet).toContain('dtype: "q4f16"');
  });

  test("returns null when pipeline_task is mixed across the group", () => {
    const group: BrowserTaskGroup = {
      task: "vision",
      label: "Vision",
      models: [
        row({ id: "a", pipeline_task: "background-removal" }),
        row({ id: "b", pipeline_task: "depth-estimation" }),
      ],
    };
    expect(browserGroupSnippet(group)).toBeNull();
  });

  test("returns null when the shared pipeline_task is null", () => {
    const group: BrowserTaskGroup = {
      task: "vision-language",
      label: "Vision + language",
      models: [row({ id: "a", pipeline_task: null }), row({ id: "b", pipeline_task: null })],
    };
    expect(browserGroupSnippet(group)).toBeNull();
  });
});

// A pass against the real catalog: shape + invariant checks, not fixed
// counts, so this does not need updating every time a model is added.
describe("browserTaskGroups against the real catalog", () => {
  test("every generated group has at least 2 models, sorted ascending by webgpu bytes", () => {
    const groups = browserTaskGroups();
    expect(groups.length).toBeGreaterThan(0);
    for (const g of groups) {
      expect(g.models.length).toBeGreaterThanOrEqual(2);
      for (let i = 1; i < g.models.length; i++) {
        expect(g.models[i]!.headline.webgpu.bytes).toBeGreaterThanOrEqual(
          g.models[i - 1]!.headline.webgpu.bytes,
        );
      }
    }
  });

  test("excludes single-model tasks (reranker, speaker-diarization)", () => {
    const tasks = browserTaskGroups().map((g) => g.task);
    expect(tasks).not.toContain("reranker");
    expect(tasks).not.toContain("speaker-diarization");
  });

  test("browserTaskGroup looks up a single group by task slug", () => {
    const g = browserTaskGroup("text-generation");
    expect(g).toBeDefined();
    expect(g!.models.length).toBeGreaterThanOrEqual(2);
    expect(browserTaskGroup("reranker")).toBeUndefined();
  });

  test("every generated group has an H1 and a non-empty reading + FAQ-fact set", () => {
    for (const g of browserTaskGroups()) {
      expect(browserTaskH1(g.task).length).toBeGreaterThan(0);
      expect(browserGroupReadingBullets(g.models).length).toBeGreaterThanOrEqual(2);
      expect(browserGroupTotalBytes(g.models)).toBeGreaterThan(0);
      const u = browserGroupVariantUniformity(g.models);
      expect(u.counts.length).toBeGreaterThan(0);
    }
  });
});
