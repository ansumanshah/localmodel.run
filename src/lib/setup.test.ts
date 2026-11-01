import { expect, test } from "bun:test";
import { canRun } from "./compute";
import { devices, hfRepo, models } from "./data";
import { setupModels, supportsSetupModel } from "./setup";

const device = devices.find((row) => row.id === "apple-m4-16gb")!;

test("setup shortlist returns measured, comfortable text fits in recorded popularity order", () => {
  const shortlist = setupModels(device, "chat", 4);

  expect(shortlist).toHaveLength(3);
  for (const { model, result } of shortlist) {
    expect(model.modality ?? "text").toBe("text");
    expect(model.subtype).not.toBe("embedding");
    expect(model.subtype).not.toBe("vlm");
    expect(model.q4_k_m_gb).toBeGreaterThan(0);
    expect(hfRepo(model)).toBeTruthy();
    expect(model.default_context_k).toBeGreaterThanOrEqual(4);
    expect(result.verdict).toBe("yes");
    expect(canRun(model, device, 4).verdict).toBe("yes");
  }
  for (let index = 1; index < shortlist.length; index++) {
    const before = shortlist[index - 1].model;
    const after = shortlist[index].model;
    expect(Number((before.pulls ?? 0) > 0)).toBeGreaterThanOrEqual(Number((after.pulls ?? 0) > 0));
    if ((before.pulls ?? 0) === (after.pulls ?? 0)) {
      expect(before.q4_k_m_gb).toBeGreaterThanOrEqual(after.q4_k_m_gb!);
    } else {
      expect(before.pulls!).toBeGreaterThan(after.pulls!);
    }
  }

  const example = models.find((model) => model.id === "llama-3.1-8b")!;
  expect(() => setupModels(device, "chat", 0, [example])).toThrow(RangeError);
  expect(() => setupModels(device, "chat", 1.5, [example])).toThrow(RangeError);
  const ordered = setupModels(device, "chat", 4, [
    { ...example, id: "unrecorded", pulls: null, q4_k_m_gb: 5 },
    { ...example, id: "smaller-tie", pulls: 10, q4_k_m_gb: 2 },
    { ...example, id: "larger-tie", pulls: 10, q4_k_m_gb: 4 },
  ]);
  expect(ordered.map(({ model }) => model.id)).toEqual(["larger-tie", "smaller-tie", "unrecorded"]);
  expect(setupModels(device, "coding", 4, [{ ...example, subtype: "embedding" }])).toEqual([]);
});

test("a compatible requested model survives the popularity cutoff without replacing it silently", () => {
  const example = models.find((model) => model.id === "llama-3.1-8b")!;
  const catalog = [4, 3, 2, 1].map((pulls) => ({ ...example, id: `model-${pulls}`, pulls }));
  const selected = setupModels(device, "chat", 3, catalog, "model-1");
  expect(selected.map(({ model }) => model.id)).toEqual(["model-4", "model-3", "model-1"]);
  expect(selected.find(({ model }) => model.id === "model-1")?.result.verdict).toBe("yes");

  const rejected = { ...example, id: "requested", q4_k_m_gb: 1000 };
  expect(setupModels(device, "chat", 4, [...catalog, rejected], rejected.id).some(({ model }) => model.id === rejected.id)).toBe(false);
  expect(setupModels(device, "coding", 4, catalog, "model-1")).toEqual([]);
  expect(setupModels(device, "chat", 4, [{ ...example, default_context_k: 2 }], example.id)).toEqual([]);
  expect(setupModels(device, "chat", 4, [{ ...example, modality: "image" }], example.id)).toEqual([]);
});


test("setup eligibility requires plain text, a measured Q4 download, and a GGUF source", () => {
  const example = models.find((model) => model.id === "llama-3.1-8b")!;
  expect(supportsSetupModel(example)).toBe(true);
  for (const model of [
    { ...example, modality: "audio" as const },
    { ...example, subtype: "embedding" },
    { ...example, subtype: "vlm" },
    ...[null, 0, -1, NaN, Infinity].map((q4_k_m_gb) => ({ ...example, q4_k_m_gb })),
    { ...example, sources: ["https://huggingface.co/meta-llama/Llama-3.1-8B"] },
  ]) {
    expect(supportsSetupModel(model)).toBe(false);
    expect(setupModels(device, "chat", 4, [model])).toEqual([]);
  }
});
