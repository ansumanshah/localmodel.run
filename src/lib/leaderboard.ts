import type { DeviceRow, ModelRow } from "@/data/types";
import { models, devices } from "@/lib/data";
import { canRun, estimateMemory } from "@/lib/compute";

// The leaderboard axes. Each is a SOURCED third-party benchmark with partial
// coverage (only models we verified against the canonical board appear). The
// differentiator vs every other leaderboard: each ranked model links straight to
// "can you actually run it", with the lightest device that fits.

export type BoardKey = "coding" | "tool-use" | "chat";

export interface Board {
  key: BoardKey;
  slug: string;
  label: string; // nav / tab label
  h1: string;
  metric: string; // what the number is
  unit: string; // "%" | " Elo"
  blurb: string;
  longBlurb: string;
  source: string; // canonical leaderboard URL to cite
  sourceLabel: string;
  field: "aider_polyglot_pct" | "bfcl_v3_acc" | "arena_elo";
}

export const BOARDS: Record<BoardKey, Board> = {
  coding: {
    key: "coding",
    slug: "coding",
    label: "Coding",
    h1: "Local LLM coding leaderboard",
    metric: "Aider polyglot",
    unit: "%",
    blurb: "Percent of 225 Exercism exercises solved across six languages.",
    longBlurb:
      "The Aider polyglot benchmark runs models through 225 Exercism exercises in C++, Go, Java, JavaScript, Python and Rust, scoring the share solved in Aider's test setup. This board ranks the tracked models with recorded scores; it does not measure every coding workflow.",
    source: "https://aider.chat/docs/leaderboards/",
    sourceLabel: "aider.chat/docs/leaderboards",
    field: "aider_polyglot_pct",
  },
  "tool-use": {
    key: "tool-use",
    slug: "tool-use",
    label: "Tool use",
    h1: "Local LLM tool-use leaderboard",
    metric: "BFCL",
    unit: "%",
    blurb: "Recorded overall accuracy on the Berkeley Function-Calling Leaderboard.",
    longBlurb:
      "The Berkeley Function-Calling Leaderboard (BFCL) tests tool selection and arguments. Our catalog stores Overall Acc, taking the native function-calling (FC) result where available. The exact source snapshot and benchmark version need re-verification; do not compare these legacy scores with the current source board or use them to establish complete agent performance.",
    source: "https://gorilla.cs.berkeley.edu/leaderboard.html",
    sourceLabel: "gorilla.cs.berkeley.edu/leaderboard",
    field: "bfcl_v3_acc", // Legacy field name; not proof of the source snapshot's version.
  },
  chat: {
    key: "chat",
    slug: "chat",
    label: "Chat (Elo)",
    h1: "Local LLM chat leaderboard",
    metric: "LMArena",
    unit: " Elo",
    blurb: "Human-preference Elo from LMArena's blind head-to-head votes.",
    longBlurb:
      "LMArena uses blind, head-to-head human votes to measure chat preferences. This board shows the scores recorded for tracked models. Ratings depend on the evaluated model pool and snapshot, so they are not a fixed measure of capability.",
    source: "https://lmarena.ai/leaderboard",
    sourceLabel: "lmarena.ai/leaderboard",
    field: "arena_elo",
  },
};

export const BOARD_ORDER: BoardKey[] = ["coding", "tool-use", "chat"];

export interface RankedModel {
  rank: number;
  model: ModelRow;
  score: number;
}

/** Models on a board, ranked by score (higher is better), partial coverage. */
export function rankedFor(key: BoardKey, set: ModelRow[] = models): RankedModel[] {
  const f = BOARDS[key].field;
  return set
    .filter((m) => typeof m[f] === "number")
    .map((m) => ({ model: m, score: m[f] as number }))
    .sort((a, b) => b.score - a.score)
    .map((r, i) => ({ rank: i + 1, ...r }));
}

export const scoreOf = (m: ModelRow, key: BoardKey): number | null => {
  const v = m[BOARDS[key].field];
  return typeof v === "number" ? v : null;
};

/** Any model that carries at least one sourced benchmark (for the hub table). */
export function benchmarkedModels(set: ModelRow[] = models): ModelRow[] {
  return set.filter((m) => BOARD_ORDER.some((k) => scoreOf(m, k) != null));
}

export interface Fit {
  device: DeviceRow | null; // lightest device that runs it
  neededGb: number; // Q4_K_M total
}

/**
 * The local-fit hook that makes this leaderboard different: the lightest (by
 * usable memory) tracked device that runs the model at Q4_K_M, plus what it needs.
 */
export function lightestFit(model: ModelRow): Fit {
  const runnable = devices
    .filter((d) => canRun(model, d).verdict !== "no")
    .sort((a, b) => canRun(model, a).usableGb - canRun(model, b).usableGb);
  return { device: runnable[0] ?? null, neededGb: estimateMemory(model, "q4_k_m").totalGb };
}
