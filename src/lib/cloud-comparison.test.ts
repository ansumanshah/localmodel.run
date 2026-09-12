import { describe, expect, test } from "bun:test";
import candidates from "@/data/cloud-comparison-models.json";
import { assertComparisonCandidates, buildCloudComparison } from "./cloud-comparison";
import { canRun, estimateMemory } from "./compute";
import { devices, getModel } from "./data";

describe("local versus hosted boundary", () => {
  test("joins exact Arena variants and keeps hosted models out of the memory engine", () => {
    const comparison = buildCloudComparison();
    for (const row of comparison.rows) {
      expect(row.rating).toBe(comparison.snapshot.rows.find((score) => score.model_name === row.arenaName)!.rating);
      if (row.access === "hosted") {
        expect(row.memoryGb).toBeNull();
        expect(comparison.fits[row.id]).toBeUndefined();
      }
    }
    expect(comparison.rows.map((row) => row.rating)).toEqual(comparison.rows.map((row) => row.rating).sort((a, b) => b - a));
  });

  test("all precomputed local fits agree with the catalog engine at the selected context", () => {
    const comparison = buildCloudComparison();
    for (const row of comparison.rows.filter((row) => row.access === "local")) {
      const model = getModel(row.localModelId!)!;
      for (const device of devices) {
        for (const context of comparison.contexts) {
          const fit = comparison.fits[row.id][device.id][context];
          expect(fit.verdict).toBe(canRun(model, device, context).verdict);
          expect(fit.memoryGb).toBe(estimateMemory(model, "q4_k_m", context).totalGb);
        }
      }
    }
  });

  test("rejects duplicate identities, guessed local mappings and hosted memory mappings", () => {
    expect(() => assertComparisonCandidates([...candidates, candidates[0]])).toThrow("Duplicate");
    const local = candidates.find((row) => row.access === "local")!;
    expect(() => assertComparisonCandidates([{ ...local, localModelId: "invented-model" }])).toThrow("Missing measured");
    const hosted = candidates.find((row) => row.access === "hosted")!;
    expect(() => assertComparisonCandidates([{ ...hosted, localModelId: local.id }])).toThrow("no local mapping");
  });

  test("requires meaningful tariff scope, valid dates and nonnegative prices", () => {
    const hosted = candidates.find((row) => row.pricing)!;
    for (const update of [{ inputPerMillion: -1 }, { verifiedAt: "2099-01-01" }, { verifiedAt: "2026-02-30" }, { validThrough: "2026-02-30" }, { validThrough: "2020-01-01" }, { notes: "" }]) {
      expect(() => assertComparisonCandidates([{ ...hosted, pricing: { ...hosted.pricing, ...update } }])).toThrow();
    }
  });
});
