import { test, expect, describe } from "bun:test";
import type { DeviceRow, ModelRow } from "@/data/types";
import {
  BPW,
  canRun,
  estimateMemory,
  kvCacheGb,
  quantLadderSizes,
  round1,
  usableGb,
  weightsGb,
} from "@/lib/compute";
import { rigScore } from "@/lib/rig";

// The memory math IS the product. These pin the formulas + sourced constants so
// a tuning change (BPW / KV / overhead) can't silently flip verdicts unnoticed.

const model = (over: Partial<ModelRow> = {}): ModelRow =>
  ({
    id: "t",
    name: "T",
    family: "T",
    params_b: 8,
    is_moe: false,
    active_params_b: null,
    q4_k_m_gb: null,
    q8_0_gb: null,
    fp16_gb: null,
    min_ram_q4_gb: null,
    default_context_k: 4,
    ollama_tag: "t",
    release: null,
    sources: [],
    notes: "",
    pulls: null,
    pulls_text: null,
    ...over,
  }) as ModelRow;

const device = (over: Partial<DeviceRow> = {}): DeviceRow =>
  ({
    id: "t",
    name: "T",
    category: "mac",
    memory_gb: 16,
    memory_type: "unified",
    usable_memory_gb: null,
    best_runtime: null,
    sources: [],
    notes: "",
    ...over,
  }) as DeviceRow;

describe("sourced constants (regression lock)", () => {
  test("BPW matches the llama.cpp quantize table", () => {
    expect(BPW.q4_k_m).toBe(4.89);
    expect(BPW.q8_0).toBe(8.5);
    expect(BPW.fp16).toBe(16);
  });
  test("round1 rounds to one decimal", () => {
    expect(round1(4.567)).toBe(4.6);
    expect(round1(1.83375)).toBe(1.8);
  });
});

describe("weightsGb", () => {
  test("derives from params x BPW when no measured size", () => {
    expect(weightsGb(model({ params_b: 8 }), "q4_k_m")).toBe(4.9); // 8*4.89/8
    expect(weightsGb(model({ params_b: 70 }), "q4_k_m")).toBe(42.8);
  });
  test("prefers the measured on-disk size", () => {
    expect(weightsGb(model({ params_b: 8, q4_k_m_gb: 5.2 }), "q4_k_m")).toBe(5.2);
  });
  test("MoE weights scale with TOTAL params, not active", () => {
    const moe = model({ params_b: 30, is_moe: true, active_params_b: 3 });
    expect(weightsGb(moe, "q4_k_m")).toBe(round1((30 * 4.89) / 8));
  });
});

describe("kvCacheGb", () => {
  test("is sublinear in size and grows with context", () => {
    const m = model({ params_b: 8 });
    expect(kvCacheGb(m, 4)).toBe(0.7);
    expect(kvCacheGb(m, 8)).toBeGreaterThan(kvCacheGb(m, 4));
    // 70B should NOT be ~9x the 8B KV (GQA): well under linear scaling.
    expect(kvCacheGb(model({ params_b: 70 }), 4)).toBeLessThan(kvCacheGb(m, 4) * 9);
  });
});

describe("estimateMemory", () => {
  test("total = weights + kv + overhead (8B Q4 @ 4k = 6.4 GB)", () => {
    const e = estimateMemory(model({ params_b: 8 }), "q4_k_m", 4);
    expect(e.weightsGb).toBe(4.9);
    expect(e.totalGb).toBe(6.4);
  });
});

describe("usableGb", () => {
  test("uses the explicit usable_memory_gb when set", () => {
    expect(usableGb(device({ usable_memory_gb: 10.6 }))).toBe(10.6);
  });
  test("VRAM fallback leaves ~1 GB for the driver", () => {
    expect(usableGb(device({ memory_type: "vram", memory_gb: 24, usable_memory_gb: null }))).toBe(23);
  });
  test("Mac unified fallback is ~70%", () => {
    expect(usableGb(device({ memory_gb: 16, usable_memory_gb: null }))).toBe(11.2);
  });
});

describe("canRun verdicts", () => {
  test("70B does not fit a 16 GB Mac", () => {
    expect(canRun(model({ params_b: 70 }), device({ memory_gb: 16, usable_memory_gb: 10.6 })).verdict).toBe("no");
  });
  test("8B fits a 16 GB Mac comfortably", () => {
    const r = canRun(model({ params_b: 8 }), device({ memory_gb: 16, usable_memory_gb: 10.6 }));
    expect(r.verdict).toBe("yes");
    expect(r.estimate?.totalGb).toBe(6.4);
  });
  test("a near-edge fit reads as tight, not yes", () => {
    // 8B needs 6.4; give it ~7 usable -> headroom 0.6 < max(1, 10%) -> tight.
    expect(canRun(model({ params_b: 8 }), device({ memory_gb: 8, usable_memory_gb: 7 })).verdict).toBe("tight");
  });
  test("plenty of memory surfaces an upgrade quant", () => {
    const r = canRun(model({ params_b: 8 }), device({ memory_gb: 64, usable_memory_gb: 50 }));
    expect(r.verdict).toBe("yes");
    expect(r.upgradeQuant).toBe("fp16");
  });
});

describe("quantLadderSizes", () => {
  test("returns all 7 quants and flags measured vs derived", () => {
    const ladder = quantLadderSizes(model({ params_b: 8, q4_k_m_gb: 4.9 }));
    expect(ladder.length).toBe(7);
    expect(ladder.find((q) => q.label === "Q4_K_M")?.measured).toBe(true);
    expect(ladder.find((q) => q.label === "Q2_K")?.measured).toBe(false);
  });
});

describe("rigScore grades", () => {
  const set = [model({ id: "s", params_b: 3 }), model({ id: "m", params_b: 8 }), model({ id: "l", params_b: 70 })];
  test("S: runs a 70B and >=70% of models", () => {
    const s = rigScore(device({ memory_gb: 64, usable_memory_gb: 50 }), set);
    expect(s.grade).toBe("S");
    expect(s.pct).toBe(100);
    expect(s.biggest?.params_b).toBe(70);
  });
  test("C: tops out around 8B", () => {
    const s = rigScore(device({ memory_gb: 8, usable_memory_gb: 7 }), set);
    expect(s.grade).toBe("C");
    expect(s.runnable).toBe(2);
    expect(s.pct).toBe(67);
  });
  test("F: runs nothing meaningful", () => {
    const s = rigScore(device({ memory_gb: 2, usable_memory_gb: 1.2 }), set);
    expect(s.grade).toBe("F");
  });
});
