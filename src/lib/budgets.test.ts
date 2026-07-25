import { test, expect, describe } from "bun:test";
import { devices } from "@/lib/data";
import { BUDGETS, interpretationsFor, mostGenerousFor } from "@/lib/budgets";

// The RAM-budget anchoring is the one source of truth behind every budget-based
// surface (best-llm-for-ram pages, family hardware-gating). These pin its
// invariants against the REAL sourced device data so a cron refresh can't
// silently strand a budget page or reorder its interpretations.

const DESKTOP_CATS = new Set(["mac", "nvidia", "amd", "intel", "laptop"]);
const TYPE_ORDER = ["unified", "vram", "ram"] as const;

describe("interpretationsFor", () => {
  test("every budget resolves to at least one real desktop device", () => {
    for (const size of BUDGETS) {
      expect(interpretationsFor(size).length).toBeGreaterThan(0);
    }
  });

  test("each returned device sits at the exact budget size and is a desktop category", () => {
    for (const size of BUDGETS) {
      for (const { device } of interpretationsFor(size)) {
        expect(device.memory_gb).toBe(size);
        expect(DESKTOP_CATS.has(device.category)).toBe(true);
      }
    }
  });

  test("at most one interpretation per memory type", () => {
    for (const size of BUDGETS) {
      const types = interpretationsFor(size).map((i) => i.type);
      expect(new Set(types).size).toBe(types.length);
    }
  });

  test("interpretations follow the fixed unified -> vram -> ram order", () => {
    for (const size of BUDGETS) {
      const types = interpretationsFor(size).map((i) => i.type);
      const ranks = types.map((t) => TYPE_ORDER.indexOf(t));
      expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    }
  });

  test("the device chosen per type is the highest-usable candidate at that size", () => {
    for (const size of BUDGETS) {
      for (const { type, device, usable } of interpretationsFor(size)) {
        const maxUsable = Math.max(
          ...devices
            .filter(
              (d) => d.memory_gb === size && DESKTOP_CATS.has(d.category) && d.memory_type === type,
            )
            .map((d) => d.usable_memory_gb ?? 0),
        );
        expect(usable).toBe(maxUsable);
        expect(device.usable_memory_gb ?? 0).toBe(maxUsable);
      }
    }
  });

  test("high-memory tiers (48/64/128/256) render a single unified interpretation", () => {
    for (const size of [48, 64, 128, 256]) {
      const interps = interpretationsFor(size);
      expect(interps.every((i) => i.type === "unified")).toBe(true);
    }
  });

  test("selection is deterministic across calls", () => {
    for (const size of BUDGETS) {
      const first = interpretationsFor(size).map((i) => i.device.id);
      const second = interpretationsFor(size).map((i) => i.device.id);
      expect(first).toEqual(second);
    }
  });

  test("an empty size resolves to no interpretations", () => {
    expect(interpretationsFor(9999)).toEqual([]);
  });
});

describe("mostGenerousFor", () => {
  test("returns the interpretation with the most usable memory at each budget", () => {
    for (const size of BUDGETS) {
      const interps = interpretationsFor(size);
      const best = mostGenerousFor(size);
      const peak = Math.max(...interps.map((i) => i.usable));
      expect(best?.usable).toBe(peak);
      expect(interps.map((i) => i.device.id)).toContain(best!.device.id);
    }
  });

  test("returns undefined for a size with no devices", () => {
    expect(mostGenerousFor(9999)).toBeUndefined();
  });
});
