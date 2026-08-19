// Build-time (and shared client-side) helpers for /browser/check, the Browser
// Capability Report. Pure functions over the browser-models catalog: every
// number here is read from src/data/browser-models.json, never invented.
//
// Deliberately imports only the BrowserModelRow TYPE (erased at compile time,
// zero runtime cost), never the data.ts module or any JSON file. That keeps
// this file safe to import from the client-side island without pulling the
// full site catalog (models/devices/tools/...) into that bundle. Mirrors the
// same discipline as src/components/playground/progress.ts, which duplicates
// formatBytes rather than importing it from @/lib/data.

import type { BrowserModelRow } from "@/data/types";

/** Bytes -> "123.4 MB" under 1 GB, "1.23 GB" at/above (1024-based, one/two
 *  decimals). Mirrors src/lib/data.ts formatBytes exactly so numbers render
 *  identically wherever they appear on the page. */
export function formatBytes(bytes: number): string {
  const mb = bytes / 1024 / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

/** The slim shape handed to the client island as props: id/name/task plus
 *  both headline byte counts, nothing else (no variants table, no sources).
 *  The island calls localfit's fit(id) itself for the real per-model verdict;
 *  this is only for the initial render, labels, and linking. */
export interface CatalogEntry {
  id: string;
  name: string;
  task: string;
  headlineWebgpuBytes: number;
  headlineWasmBytes: number;
}

export function toCatalogEntries(models: BrowserModelRow[]): CatalogEntry[] {
  return models.map((m) => ({
    id: m.id,
    name: m.name,
    task: m.task,
    headlineWebgpuBytes: m.headline.webgpu.bytes,
    headlineWasmBytes: m.headline.wasm.bytes,
  }));
}

export interface SmallestDownload {
  modelId: string;
  modelName: string;
  backend: "webgpu" | "wasm";
  variant: string;
  bytes: number;
}

/** The single smallest measured download across the whole catalog, on either
 *  backend. Scans every row's two headline builds; nothing is estimated. */
export function smallestCatalogDownload(models: BrowserModelRow[]): SmallestDownload {
  let best: SmallestDownload | null = null;
  for (const m of models) {
    for (const backend of ["webgpu", "wasm"] as const) {
      const h = m.headline[backend];
      if (!best || h.bytes < best.bytes) {
        best = { modelId: m.id, modelName: m.name, backend, variant: h.variant, bytes: h.bytes };
      }
    }
  }
  if (!best) throw new Error("smallestCatalogDownload: catalog is empty");
  return best;
}

/** How many catalog rows publish a real (positive, finite) WebAssembly
 *  headline build. The BrowserModelRow schema guarantees one per row (the
 *  field is non-optional), so this is normally models.length, but it is
 *  computed rather than assumed: a future data shape change would show up
 *  here instead of the page silently overclaiming WASM coverage. */
export function wasmFallbackCoverage(models: BrowserModelRow[]): number {
  return models.filter((m) => Number.isFinite(m.headline.wasm.bytes) && m.headline.wasm.bytes > 0)
    .length;
}

export interface WasmVsWebgpuCost {
  /** Median % the WASM build is larger than the WebGPU build, across the catalog. */
  medianExtraPct: number;
  /** Models where the WASM build downloads larger than the WebGPU build. */
  heavierCount: number;
  /** Models where the WASM build downloads the same size or smaller. */
  lighterCount: number;
}

/** What falling back from WebGPU to WASM actually costs, in download bytes,
 *  computed across the whole catalog (a median, not a single anecdote). */
export function wasmVsWebgpuCost(models: BrowserModelRow[]): WasmVsWebgpuCost {
  if (models.length === 0) return { medianExtraPct: 0, heavierCount: 0, lighterCount: 0 };
  const ratios = models
    .map((m) => m.headline.wasm.bytes / m.headline.webgpu.bytes)
    .sort((a, b) => a - b);
  const heavierCount = ratios.filter((r) => r > 1).length;
  const lighterCount = models.length - heavierCount;
  const mid = Math.floor(ratios.length / 2);
  const medianRatio =
    ratios.length % 2 === 1 ? ratios[mid]! : (ratios[mid - 1]! + ratios[mid]!) / 2;
  const medianExtraPct = Math.round((medianRatio - 1) * 100);
  return { medianExtraPct, heavierCount, lighterCount };
}
