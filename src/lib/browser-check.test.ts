import { describe, expect, test } from "bun:test";
import type { BrowserModelRow } from "@/data/types";
import browserModelsData from "@/data/browser-models.json";
import {
  formatBytes,
  smallestCatalogDownload,
  toCatalogEntries,
  wasmFallbackCoverage,
  wasmVsWebgpuCost,
} from "@/lib/browser-check";

const realCatalog = browserModelsData as BrowserModelRow[];

function row(over: Partial<BrowserModelRow> & { id: string }): BrowserModelRow {
  return {
    id: over.id,
    name: over.name ?? over.id,
    hf_repo: over.hf_repo ?? `test/${over.id}`,
    task: over.task ?? "text-generation",
    params_m: over.params_m ?? null,
    headline: over.headline ?? {
      webgpu: { variant: "q4f16", bytes: 1000 },
      wasm: { variant: "uint8", bytes: 1000 },
    },
    variants: over.variants ?? {},
    pipeline_task: over.pipeline_task ?? null,
    sources: over.sources ?? [],
  };
}

describe("formatBytes", () => {
  test("renders sub-GB sizes in MB with one decimal", () => {
    expect(formatBytes(1024 * 1024 * 112.24)).toBe("112.2 MB");
  });
  test("renders GB-and-above sizes in GB with two decimals", () => {
    expect(formatBytes(1024 * 1024 * 1024 * 1.5)).toBe("1.50 GB");
  });
  test("crosses the 1 GB boundary at exactly 1024 MB", () => {
    expect(formatBytes(1024 * 1024 * 1024)).toBe("1.00 GB");
  });
});

describe("toCatalogEntries", () => {
  test("keeps only id/name/task/headline bytes, nothing else", () => {
    const models = [
      row({
        id: "a",
        name: "Model A",
        task: "vision",
        headline: {
          webgpu: { variant: "q4f16", bytes: 111 },
          wasm: { variant: "uint8", bytes: 222 },
        },
      }),
    ];
    expect(toCatalogEntries(models)).toEqual([
      {
        id: "a",
        name: "Model A",
        task: "vision",
        headlineWebgpuBytes: 111,
        headlineWasmBytes: 222,
      },
    ]);
  });
});

describe("smallestCatalogDownload", () => {
  test("finds the true global minimum across both backends", () => {
    const models = [
      row({
        id: "big",
        headline: {
          webgpu: { variant: "q4f16", bytes: 5_000_000 },
          wasm: { variant: "uint8", bytes: 6_000_000 },
        },
      }),
      row({
        id: "small",
        headline: {
          webgpu: { variant: "q4f16", bytes: 900_000 },
          wasm: { variant: "uint8", bytes: 800_000 },
        },
      }),
    ];
    const best = smallestCatalogDownload(models);
    expect(best).toEqual({
      modelId: "small",
      modelName: "small",
      backend: "wasm",
      variant: "uint8",
      bytes: 800_000,
    });
  });

  test("throws on an empty catalog rather than returning a fake zero", () => {
    expect(() => smallestCatalogDownload([])).toThrow();
  });

  test("holds against the real catalog: a finite positive minimum exists", () => {
    const best = smallestCatalogDownload(realCatalog);
    expect(best.bytes).toBeGreaterThan(0);
    expect(Number.isFinite(best.bytes)).toBe(true);
  });
});

describe("wasmFallbackCoverage", () => {
  test("counts rows with a real, positive WASM headline", () => {
    const models = [
      row({
        id: "a",
        headline: { webgpu: { variant: "q4f16", bytes: 1 }, wasm: { variant: "uint8", bytes: 1 } },
      }),
      row({
        id: "b",
        headline: { webgpu: { variant: "q4f16", bytes: 1 }, wasm: { variant: "uint8", bytes: 1 } },
      }),
    ];
    expect(wasmFallbackCoverage(models)).toBe(2);
  });

  test("holds against the real catalog: every row has a WASM headline (schema-guaranteed)", () => {
    expect(wasmFallbackCoverage(realCatalog)).toBe(realCatalog.length);
  });
});

describe("wasmVsWebgpuCost", () => {
  test("computes the median % the WASM build is larger, and the heavier/lighter split", () => {
    const models = [
      row({
        headline: {
          webgpu: { variant: "q4f16", bytes: 100 },
          wasm: { variant: "uint8", bytes: 150 },
        },
        id: "a",
      }), // +50%
      row({
        headline: {
          webgpu: { variant: "q4f16", bytes: 100 },
          wasm: { variant: "uint8", bytes: 200 },
        },
        id: "b",
      }), // +100%
      row({
        headline: {
          webgpu: { variant: "q4f16", bytes: 100 },
          wasm: { variant: "uint8", bytes: 80 },
        },
        id: "c",
      }), // -20%
    ];
    const cost = wasmVsWebgpuCost(models);
    expect(cost.heavierCount).toBe(2);
    expect(cost.lighterCount).toBe(1);
    // sorted ratios: 0.8, 1.5, 2.0 -> median 1.5 -> +50%
    expect(cost.medianExtraPct).toBe(50);
  });

  test("returns a zeroed result for an empty catalog instead of dividing by zero", () => {
    expect(wasmVsWebgpuCost([])).toEqual({ medianExtraPct: 0, heavierCount: 0, lighterCount: 0 });
  });

  test("holds against the real catalog: heavier + lighter always sum to the catalog size", () => {
    const cost = wasmVsWebgpuCost(realCatalog);
    expect(cost.heavierCount + cost.lighterCount).toBe(realCatalog.length);
  });
});
