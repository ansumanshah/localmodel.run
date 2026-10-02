import type { DeviceRow, ModelRow } from "@/data/types";
import { canRun, type RunResult } from "@/lib/compute";
import { hfRepo, models } from "@/lib/data";
import { useCasesFor } from "@/lib/usecases";

export type SetupTask = "chat" | "coding" | "reasoning";

export type SetupModel = { model: ModelRow; result: RunResult };

/** A small, fit-first starter list. Ordering is recorded Ollama pulls, not quality. */
export function setupModels(
  device: DeviceRow,
  task: SetupTask,
  contextK: number,
  catalog: ModelRow[] = models,
): SetupModel[] {
  if (!Number.isInteger(contextK) || contextK <= 0) {
    throw new RangeError("contextK must be a positive integer");
  }

  return catalog
    .filter((model) => {
      if ((model.modality ?? "text") !== "text") return false;
      if (model.subtype === "embedding" || model.subtype === "vlm") return false;
      if (!Number.isFinite(model.q4_k_m_gb) || (model.q4_k_m_gb ?? 0) <= 0) return false;
      if (!hfRepo(model) || contextK > (model.default_context_k ?? 0)) return false;

      const tags = useCasesFor(model);
      if (task === "chat") return !tags.includes("coding") && !tags.includes("reasoning");
      return tags.includes(task);
    })
    .map((model) => ({ model, result: canRun(model, device, contextK) }))
    .filter(({ result }) => result.verdict === "yes")
    .sort((a, b) =>
      Number((b.model.pulls ?? 0) > 0) - Number((a.model.pulls ?? 0) > 0)
      || (b.model.pulls ?? 0) - (a.model.pulls ?? 0)
      || b.model.q4_k_m_gb! - a.model.q4_k_m_gb!
      || a.model.id.localeCompare(b.model.id),
    )
    .slice(0, 3);
}
