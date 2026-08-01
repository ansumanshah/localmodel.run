import type { APIRoute } from "astro";
import {
  getAnyModel,
  getTool,
  devicePlatform,
  allModels,
  devices,
  modelModality,
  meta,
} from "@/lib/data";
import { usableGb } from "@/lib/compute";
import { canRunModality, modalitySpec } from "@/lib/compute-mm";
import { json } from "@/lib/api";

// Consolidated 2026-08: one file per model (was one per model x device pair,
// ~6,021 files against the CF Pages 20k-file ceiling). Every device's verdict
// is included, keyed by device id -- the same field names and numbers the old
// per-pair endpoint returned, just re-grouped instead of recomputed. Old
// per-pair URLs 301 to here (see public/_redirects).
export function getStaticPaths() {
  return allModels.map((model) => ({ params: { model: model.id } }));
}

export const GET: APIRoute = ({ params }) => {
  const model = getAnyModel(params.model!);
  if (!model) return new Response("Not found", { status: 404 });

  const modality = modelModality(model);
  const isText = modality === "text";

  const deviceEntries: Record<string, unknown> = {};
  for (const device of devices) {
    const result = canRunModality(model, device);
    const platform = devicePlatform(device);
    const tool = getTool(platform);
    const canOllama =
      isText &&
      (platform === "mac" || platform === "windows" || platform === "linux") &&
      model.ollama_tag;

    deviceEntries[device.id] = {
      device: {
        id: device.id,
        name: device.name,
        memory_gb: device.memory_gb,
        memory_type: device.memory_type,
        usable_gb: usableGb(device),
      },
      result: {
        verdict: result.verdict, // yes | tight | no
        recommended_quant: isText ? result.quant : (result.quantLabel ?? null),
        needed_gb: isText ? (result.estimate?.totalGb ?? null) : (result.neededGb ?? null),
        headroom_gb: result.headroomGb,
        offload_floor_gb: result.offloadFloorGb ?? null,
        no_runtime: result.noRuntime ?? false,
        speed: result.speed,
        reason: result.reason,
      },
      platform,
      best_tool: isText ? (tool?.beginner.name ?? null) : (modalitySpec(model)?.tools[0] ?? null),
      command: result.verdict !== "no" && canOllama ? `ollama run ${model.ollama_tag}` : null,
    };
  }

  return json({
    updated: meta.updated,
    model: {
      id: model.id,
      name: model.name,
      modality,
      params_b: model.params_b,
      is_moe: model.is_moe,
      active_params_b: model.active_params_b,
      q4_k_m_gb: model.q4_k_m_gb,
    },
    devices: deviceEntries,
    sources: model.sources,
    note: "Estimate. See /methodology.",
  });
};
