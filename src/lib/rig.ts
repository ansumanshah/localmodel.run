import type { DeviceRow, ModelRow } from "@/data/types";
import { canRun } from "@/lib/compute";
// Rig score covers TEXT models only (image/video/audio have no meaningful
// "fraction you can run" score yet), so it intentionally uses `models`, not the
// multi-modal `allModels` union.
import { models } from "@/lib/data";

export type Grade = "S" | "A" | "B" | "C" | "D" | "F";

// Grade -> brand color, shared by the rig pages. OG cards keep their own hex
// copy (Satori has no CSS variables); keep the two in sync with global.css.
export const GRADE_COLOR: Record<Grade, string> = {
  S: "var(--color-verdict-yes)",
  A: "var(--color-verdict-yes)",
  B: "#86efac",
  C: "var(--color-verdict-tight)",
  D: "#fdba74",
  F: "var(--color-verdict-no)",
};

export interface RigScore {
  runnable: number;
  total: number;
  pct: number;
  biggest: ModelRow | null;
  grade: Grade;
}

/**
 * A shareable "Rig Score" for a device: what fraction of tracked models it can
 * run, and the largest one. Grade is derived from coverage + biggest model so
 * it needs no benchmark data (defensible, computed from canRun).
 */
export function rigScore(device: DeviceRow, modelSet: ModelRow[] = models): RigScore {
  const runnableModels = modelSet.filter((m) => canRun(m, device).verdict !== "no");
  const biggest = [...runnableModels].sort((a, b) => b.params_b - a.params_b)[0] ?? null;
  const pct = Math.round((runnableModels.length / modelSet.length) * 100);
  const max = biggest?.params_b ?? 0;

  let grade: Grade;
  if (max >= 70 && pct >= 70) grade = "S";
  else if (max >= 30) grade = "A";
  else if (max >= 13) grade = "B";
  else if (max >= 8) grade = "C";
  else if (max >= 3) grade = "D";
  else grade = "F";

  return { runnable: runnableModels.length, total: modelSet.length, pct, biggest, grade };
}

export const GRADE_BLURB: Record<Grade, string> = {
  S: "Elite, runs the biggest open models, including 70B.",
  A: "Excellent, runs up to ~32B comfortably.",
  B: "Strong, runs mid-size models up to ~14B.",
  C: "Capable, 7-8B models run well.",
  D: "Entry, small 1-4B models only.",
  F: "Tight, stick to the smallest models.",
};
