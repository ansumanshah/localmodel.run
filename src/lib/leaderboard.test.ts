import { test, expect, describe } from "bun:test";
import { models, devices } from "@/lib/data";
import { canRun, estimateMemory } from "@/lib/compute";
import {
  BOARDS,
  BOARD_ORDER,
  benchmarkedModels,
  lightestFit,
  rankedFor,
  scoreOf,
} from "@/lib/leaderboard";

// The leaderboard is a ranking of third-party benchmark numbers plus the local-fit
// hook that no other board has. These pin both halves against the REAL sourced
// data, so a weekly data refresh cannot silently reorder a board, publish an
// out-of-range score, or point a row at hardware that does not actually fit.

const PERCENT_FIELDS = new Set(["aider_polyglot_pct", "bfcl_v3_acc"]);

describe("rankedFor", () => {
  test("every board has at least one verified model", () => {
    for (const key of BOARD_ORDER) {
      expect(rankedFor(key).length).toBeGreaterThan(0);
    }
  });

  test("scores descend and ranks are sequential from 1", () => {
    for (const key of BOARD_ORDER) {
      const ranked = rankedFor(key);
      expect(ranked.map((r) => r.rank)).toEqual(ranked.map((_, i) => i + 1));
      for (let i = 1; i < ranked.length; i++) {
        expect(ranked[i - 1].score).toBeGreaterThanOrEqual(ranked[i].score);
      }
    }
  });

  test("each row's score is the model's own value for that board's field", () => {
    for (const key of BOARD_ORDER) {
      for (const { model, score } of rankedFor(key)) {
        expect(score).toBe(scoreOf(model, key)!);
      }
    }
  });

  test("percent boards stay within 0-100 and Elo stays positive", () => {
    for (const key of BOARD_ORDER) {
      const { field } = BOARDS[key];
      for (const { score } of rankedFor(key)) {
        expect(Number.isFinite(score)).toBe(true);
        if (PERCENT_FIELDS.has(field)) {
          expect(score).toBeGreaterThanOrEqual(0);
          expect(score).toBeLessThanOrEqual(100);
        } else {
          expect(score).toBeGreaterThan(0);
        }
      }
    }
  });

  test("coverage is partial by design and never lists a model twice", () => {
    for (const key of BOARD_ORDER) {
      const ranked = rankedFor(key);
      const ids = ranked.map((r) => r.model.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ranked.length).toBeLessThanOrEqual(models.length);
    }
  });

  test("board slugs and fields are unique across boards", () => {
    const slugs = BOARD_ORDER.map((k) => BOARDS[k].slug);
    const fields = BOARD_ORDER.map((k) => BOARDS[k].field);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(new Set(fields).size).toBe(fields.length);
  });

  test("an empty set ranks to nothing", () => {
    for (const key of BOARD_ORDER) {
      expect(rankedFor(key, [])).toEqual([]);
    }
  });
});

describe("benchmarkedModels", () => {
  test("is exactly the union of the three boards", () => {
    const union = new Set(BOARD_ORDER.flatMap((k) => rankedFor(k).map((r) => r.model.id)));
    const listed = benchmarkedModels().map((m) => m.id);
    expect(new Set(listed)).toEqual(union);
    expect(listed.length).toBe(union.size);
  });

  test("every listed model carries at least one sourced score", () => {
    for (const m of benchmarkedModels()) {
      expect(BOARD_ORDER.some((k) => scoreOf(m, k) != null)).toBe(true);
    }
  });
});

describe("lightestFit", () => {
  test("the needed figure matches the Q4_K_M engine estimate", () => {
    for (const m of benchmarkedModels()) {
      expect(lightestFit(m).neededGb).toBe(estimateMemory(m, "q4_k_m").totalGb);
    }
  });

  test("the chosen device actually runs the model", () => {
    for (const m of benchmarkedModels()) {
      const { device } = lightestFit(m);
      if (device) expect(canRun(m, device).verdict).not.toBe("no");
    }
  });

  test("no runnable device has less usable memory than the chosen one", () => {
    for (const m of benchmarkedModels()) {
      const { device } = lightestFit(m);
      if (!device) continue;
      const chosen = canRun(m, device).usableGb;
      for (const d of devices) {
        const fit = canRun(m, d);
        if (fit.verdict !== "no") expect(fit.usableGb).toBeGreaterThanOrEqual(chosen);
      }
    }
  });

  test("a null device means no tracked hardware runs it", () => {
    for (const m of benchmarkedModels()) {
      if (lightestFit(m).device) continue;
      expect(devices.every((d) => canRun(m, d).verdict === "no")).toBe(true);
    }
  });
});
