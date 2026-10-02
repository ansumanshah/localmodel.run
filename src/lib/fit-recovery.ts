import type { DeviceRow, ModelRow } from "@/data/types";
import { canRun } from "@/lib/compute";
import { useCasesFor } from "@/lib/usecases";

/** Recovery options use the same fit engine and context as the calculator. */
export function fitRecovery(model: ModelRow, device: DeviceRow, contextK: number, catalog: ModelRow[]) {
  if (canRun(model, device, contextK).verdict === "yes") {
    return { shorterContextK: undefined, alternatives: [] };
  }
  const shorterContextK = [32, 16, 8, 4, 2, 1].find(
    (k) => k < contextK && k <= (model.default_context_k ?? 128) && canRun(model, device, k).verdict === "yes",
  );
  const tasks = useCasesFor(model);
  const alternatives = catalog
    .filter((m) => m.id !== model.id && (m.modality ?? "text") === "text"
      && (m.subtype ?? null) === (model.subtype ?? null)
      && tasks.every((task) => useCasesFor(m).includes(task))
      && m.q4_k_m_gb != null && m.q4_k_m_gb > 0
      && contextK <= (m.default_context_k ?? 128))
    .map((m) => ({ model: m, result: canRun(m, device, contextK) }))
    .filter(({ result }) => result.verdict === "yes")
    .sort((a, b) => Number(b.model.family === model.family) - Number(a.model.family === model.family)
      || b.result.estimate!.totalGb - a.result.estimate!.totalGb
      || a.model.id.localeCompare(b.model.id))
    .slice(0, 3);
  return { shorterContextK, alternatives };
}
