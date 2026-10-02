import { expect, test } from "bun:test";
import { canRun } from "./compute";
import { devices, hfRepo, models } from "./data";
import { setupModels } from "./setup";

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
