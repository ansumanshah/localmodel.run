import { describe, expect, test } from "bun:test";
import type { BrowserModelRow } from "@/data/types";
import browserModelsData from "@/data/browser-models.json";
import {
  PIPELINE_TASK_RUNNER,
  PLAYGROUND_DENY,
  PLAYGROUND_EXTRA,
  PLAYGROUND_RUN_OVERRIDES,
  playgroundTaskFor,
} from "./registry";

const catalog = browserModelsData as BrowserModelRow[];
const byId = new Map(catalog.map((m) => [m.id, m]));

// The variant a model's live run actually loads for a backend: an override
// if one names this model, otherwise the catalog's headline pick. Mirrors
// the runPick() logic in src/pages/browser/[model].astro exactly, so this
// test locks the same invariant the page relies on at build time.
function runVariant(model: BrowserModelRow, backend: "webgpu" | "wasm"): string {
  return PLAYGROUND_RUN_OVERRIDES[model.id]?.[backend] ?? model.headline[backend].variant;
}

describe("PLAYGROUND_EXTRA", () => {
  test("every id exists in the catalog", () => {
    for (const id of Object.keys(PLAYGROUND_EXTRA)) {
      expect(byId.has(id)).toBe(true);
    }
  });
});

describe("PLAYGROUND_DENY", () => {
  test("every id exists in the catalog", () => {
    for (const id of Object.keys(PLAYGROUND_DENY)) {
      expect(byId.has(id)).toBe(true);
    }
  });

  test("every reason is a non-empty, substantive sentence", () => {
    for (const [id, reason] of Object.entries(PLAYGROUND_DENY)) {
      expect(reason.length, `${id} deny reason should explain why`).toBeGreaterThan(20);
    }
  });
});

describe("PLAYGROUND_EXTRA and PLAYGROUND_DENY", () => {
  test("no id is both extra and denied", () => {
    const overlap = Object.keys(PLAYGROUND_EXTRA).filter((id) => id in PLAYGROUND_DENY);
    expect(overlap).toEqual([]);
  });
});

describe("PLAYGROUND_RUN_OVERRIDES", () => {
  test("every id exists in the catalog and resolves to an enabled task", () => {
    for (const id of Object.keys(PLAYGROUND_RUN_OVERRIDES)) {
      const model = byId.get(id);
      expect(model, `${id} should exist in the catalog`).toBeDefined();
      if (!model) continue;
      expect(playgroundTaskFor(model), `${id} should resolve to an enabled task`).not.toBeNull();
    }
  });

  test("every named override variant is a measured variant for that model", () => {
    for (const [id, override] of Object.entries(PLAYGROUND_RUN_OVERRIDES)) {
      const model = byId.get(id);
      if (!model) continue;
      for (const backend of ["webgpu", "wasm"] as const) {
        const variant = override[backend];
        if (variant == null) continue;
        expect(
          model.variants[variant],
          `${id} override names "${variant}" for ${backend}, not a measured variant`,
        ).not.toBeUndefined();
      }
    }
  });
});

describe("playgroundTaskFor", () => {
  test("denied rows resolve to null even when pipeline_task would otherwise match", () => {
    for (const id of Object.keys(PLAYGROUND_DENY)) {
      const model = byId.get(id);
      if (!model) continue;
      expect(playgroundTaskFor(model)).toBeNull();
    }
  });

  test("extra rows resolve to their named task", () => {
    for (const [id, task] of Object.entries(PLAYGROUND_EXTRA)) {
      const model = byId.get(id);
      if (!model) continue;
      expect(playgroundTaskFor(model)).toBe(task);
    }
  });

  test("a row with an unmapped pipeline_task and no override resolves to null", () => {
    expect(playgroundTaskFor({ id: "not-a-real-model", pipeline_task: "depth-estimation" })).toBeNull();
    expect(playgroundTaskFor({ id: "not-a-real-model", pipeline_task: null })).toBeNull();
  });

  test("every enabled model has a measured bytes entry for the variant its run will load", () => {
    let enabledCount = 0;
    for (const model of catalog) {
      if (!playgroundTaskFor(model)) continue;
      enabledCount += 1;
      for (const backend of ["webgpu", "wasm"] as const) {
        const variant = runVariant(model, backend);
        expect(
          model.variants[variant],
          `${model.id} (${backend}) run variant "${variant}" is not a measured entry`,
        ).not.toBeUndefined();
      }
    }
    // Sanity floor, not an exact count: catches the resolver going dark
    // (e.g. a typo'd pipeline_task key) without pinning to a number that
    // must be hand-updated every time the catalog grows.
    expect(enabledCount).toBeGreaterThan(20);
  });

  test("PIPELINE_TASK_RUNNER keys are pipeline_task values actually present in the catalog", () => {
    const presentTasks = new Set(catalog.map((m) => m.pipeline_task).filter((t): t is string => t != null));
    for (const task of Object.keys(PIPELINE_TASK_RUNNER)) {
      expect(presentTasks.has(task), `no catalog row uses pipeline_task "${task}"`).toBe(true);
    }
  });
});
