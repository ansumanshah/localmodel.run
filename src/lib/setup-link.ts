import { allModels, devices, models } from "@/lib/data";
import type { SetupTask } from "@/lib/setup";
import { useCasesFor } from "@/lib/usecases";

type SetupInput = { deviceId?: string; modelId?: string; contextK?: number; task?: SetupTask };

export function setupHref(input: SetupInput): string {
  const params = new URLSearchParams();
  if (input.deviceId) params.set("device", input.deviceId);
  if (input.modelId) params.set("model", input.modelId);
  if (input.contextK !== undefined) params.set("context", String(input.contextK));
  if (input.task) params.set("task", input.task);
  return `/start${params.size ? `#${params}` : ""}`;
}

/** The fragment stays in the browser, outside page requests and referrers. */
export function parseSetupHash(hash: string): SetupInput & { error?: string } {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const input: SetupInput & { error?: string } = {};
  const errors: string[] = [];
  const device = params.get("device");
  const model = params.get("model");
  const context = params.get("context");
  const task = params.get("task");
  if (device !== null) {
    if (devices.some((row) => row.id === device)) input.deviceId = device;
    else errors.push("The linked device is not in the catalog.");
  }
  const requested = allModels.find((row) => row.id === model);
  if (model !== null) {
    if (requested) input.modelId = requested.id;
    else errors.push("The linked model is not in the catalog.");
  }
  if (context !== null) {
    const maxContext = Math.max(...models.map((row) => row.default_context_k ?? 0));
    if (/^[1-9]\d*$/.test(context) && Number.isSafeInteger(Number(context)) && Number(context) <= maxContext) input.contextK = Number(context);
    else errors.push("The linked context is not supported. Choose a context below.");
  }
  if (task !== null) {
    if (task === "chat" || task === "coding" || task === "reasoning") input.task = task;
    else errors.push("The linked task is not supported.");
  } else if (requested) {
    const tags = useCasesFor(requested);
    input.task = tags.includes("coding") ? "coding" : tags.includes("reasoning") ? "reasoning" : "chat";
  }
  if (errors.length) input.error = errors.join(" ");
  return input;
}
