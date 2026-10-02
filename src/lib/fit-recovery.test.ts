import { expect, test } from "bun:test";
import { fitRecovery } from "./fit-recovery";
import { canRun } from "./compute";
import { models, devices } from "./data";

const model = models.find((m) => m.id === "llama-3.1-8b")!;
const device = devices.find((d) => d.id === "apple-m4-16gb")!;

test("recovery keeps context and task compatibility, and only offers comfortable measured fits", () => {
  expect(fitRecovery(model, device, 4, models)).toEqual({ shorterContextK: undefined, alternatives: [] });
  const recovery = fitRecovery(model, device, 64, models);
  expect(recovery.shorterContextK).toBeDefined();
  expect(canRun(model, device, recovery.shorterContextK).verdict).toBe("yes");
  expect(recovery.alternatives.length).toBeGreaterThan(0);
  for (const option of recovery.alternatives) {
    expect(option.model.id).not.toBe(model.id);
    expect(option.model.default_context_k ?? 128).toBeGreaterThanOrEqual(64);
    expect(option.model.q4_k_m_gb).toBeGreaterThan(0);
    expect(canRun(option.model, device, 64).verdict).toBe("yes");
  }

  const large = { ...model, id: "large-coder", subtype: "coder" as const, q4_k_m_gb: 100 };
  const candidate = { ...model, id: "small-coder", subtype: "coder" as const };
  const pool = [
    large,
    { ...candidate, id: "unknown-size", q4_k_m_gb: null },
    { ...candidate, id: "short-context", default_context_k: 1 },
    { ...candidate, id: "image", modality: "image" as const },
    { ...candidate, id: "embedding", subtype: "embedding" as const },
    { ...candidate, id: "tight", q4_k_m_gb: device.usable_memory_gb! - 2 },
    model,
    candidate,
  ];
  expect(fitRecovery(large, device, 4, pool).alternatives.map((r) => r.model.id)).toEqual([candidate.id]);
  expect(fitRecovery(large, device, 1, []).shorterContextK).toBeUndefined();
  expect(fitRecovery(large, { ...device, usable_memory_gb: 0.1 }, 4, pool).alternatives).toEqual([]);

  const otherFamily = { ...candidate, id: "other-family", family: "Other", q4_k_m_gb: candidate.q4_k_m_gb! + 1 };
  expect(fitRecovery(large, device, 4, [otherFamily, candidate]).alternatives[0].model.id).toBe(candidate.id);
});
