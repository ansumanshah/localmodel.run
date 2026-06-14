import type { DeviceRow, ModelRow } from "@/data/types";
import { canRun, estimateMemory, usableGb, QUANT_LABEL, verdictLabel } from "@/lib/compute";
import { canRunModality, modalityNeed, modalitySpec } from "@/lib/compute-mm";
import {
  devices,
  models,
  getTool,
  devicePlatform,
  platformLabel,
  modelModality,
  meta,
} from "@/lib/data";

// Clean Markdown renderings of the key pages, for AI agents that prefer
// markdown over HTML (agent-ready "content negotiation"). Linked via
// <link rel="alternate" type="text/markdown"> on each page.

export function pairMarkdown(model: ModelRow, device: DeviceRow): string {
  if (modelModality(model) !== "text") return nonTextPairMarkdown(model, device);
  const r = canRun(model, device);
  const usable = usableGb(device);
  const platform = devicePlatform(device);
  const tool = getTool(platform);
  const canOllama =
    (platform === "mac" || platform === "windows" || platform === "linux") && model.ollama_tag;
  const verdict = verdictLabel(r.verdict);

  return [
    `# Can I run ${model.name} on ${device.name}?`,
    ``,
    `Updated: ${meta.updated}`,
    ``,
    `**${verdict}.** ${r.reason}`,
    ``,
    `- Model: ${model.params_b}B${model.is_moe ? ` (MoE, ${model.active_params_b}B active)` : ""}, Q4_K_M ${model.q4_k_m_gb ?? "?"} GB`,
    `- Device: ${device.memory_gb} GB ${device.memory_type}, ~${usable} GB usable for weights`,
    `- Needs ~${r.estimate?.totalGb} GB at Q4_K_M; recommended quant: ${r.quant ? QUANT_LABEL[r.quant] : "n/a"}`,
    `- Best tool on ${platformLabel(platform)}: ${tool?.beginner.name ?? "Ollama"}`,
    canOllama ? `- Command: \`ollama run ${model.ollama_tag}\`` : null,
    ``,
    `Estimate. Method: ${"weights + KV cache + ~0.8GB overhead"}. Sources: ${model.sources.join(", ")}.`,
    ``,
    `More: https://localmodel.run/can-i-run/${model.id}/${device.id}`,
  ]
    .filter((l) => l !== null)
    .join("\n");
}

export function modelMarkdown(model: ModelRow): string {
  if (modelModality(model) !== "text") return nonTextModelMarkdown(model);
  const q4 = estimateMemory(model, "q4_k_m");
  const runnable = devices.filter((d) => canRun(model, d).verdict !== "no");
  return [
    `# ${model.name} requirements`,
    ``,
    `Updated: ${meta.updated}`,
    ``,
    `${model.family} family, ${model.params_b}B params${model.is_moe ? ` (MoE, ${model.active_params_b}B active)` : ""}${model.release ? `, released ${model.release}` : ""}.`,
    ``,
    `- Q4_K_M: ${model.q4_k_m_gb ?? q4.weightsGb} GB on disk; ~${q4.totalGb} GB to run at 4k context`,
    model.q8_0_gb ? `- Q8_0: ${model.q8_0_gb} GB` : null,
    `- Context: ${model.default_context_k}k`,
    model.ollama_tag ? `- Run: \`ollama run ${model.ollama_tag}\`` : null,
    `- Runs on ${runnable.length} of ${devices.length} tracked devices`,
    ``,
    `Sources: ${model.sources.join(", ")}`,
    `More: https://localmodel.run/model/${model.id}`,
  ]
    .filter((l) => l !== null)
    .join("\n");
}

// Modality-aware label helpers for image / video / audio markdown.
function kindLabel(model: ModelRow): string {
  if (model.audio) return model.audio.task;
  const spec = modalitySpec(model);
  const arch = spec && "arch" in spec ? `${spec.arch.toUpperCase()} ` : "";
  return `${arch}${model.modality} model`;
}
function specResolution(model: ModelRow): string | null {
  const spec = modalitySpec(model);
  if (!spec) return null;
  if ("native_resolution" in spec) return spec.native_resolution;
  if ("default_resolution" in spec) return spec.default_resolution;
  return null;
}
function specTools(model: ModelRow): string {
  return (modalitySpec(model)?.tools ?? []).join(", ");
}
function paramText(model: ModelRow): string {
  return model.params_b < 1 ? `${Math.round(model.params_b * 1000)}M` : `${model.params_b}B`;
}

function nonTextPairMarkdown(model: ModelRow, device: DeviceRow): string {
  const r = canRunModality(model, device);
  const need = modalityNeed(model)!;
  const usable = usableGb(device);
  const memWord = model.modality === "audio" ? "memory" : "VRAM";
  const verdict = verdictLabel(r.verdict);
  return [
    `# Can I run ${model.name} on ${device.name}?`,
    ``,
    `Updated: ${meta.updated}`,
    ``,
    `**${verdict}.** ${r.reason}`,
    ``,
    `- Model: ${paramText(model)} ${kindLabel(model)}, peak ~${need.neededGb} GB ${memWord} at ${need.quantLabel}`,
    `- Device: ${device.memory_gb} GB ${device.memory_type}, ~${usable} GB usable`,
    need.noOffloadGb ? `- All components resident (no offload): ~${need.noOffloadGb} GB` : null,
    need.offloadFloorGb != null ? `- Offload floor (slow): ~${need.offloadFloorGb} GB` : null,
    `- Tools: ${specTools(model)}`,
    `- License: ${model.license}${model.commercial_use ? ` (commercial use: ${model.commercial_use})` : ""}`,
    ``,
    `Sources: ${model.sources.join(", ")}.`,
    ``,
    `More: https://localmodel.run/can-i-run/${model.id}/${device.id}`,
  ]
    .filter((l) => l !== null)
    .join("\n");
}

function nonTextModelMarkdown(model: ModelRow): string {
  const need = modalityNeed(model)!;
  const runnable = devices.filter((d) => canRunModality(model, d).verdict !== "no");
  const memWord = model.modality === "audio" ? "memory" : "VRAM";
  const res = specResolution(model);
  return [
    `# ${model.name} requirements`,
    ``,
    `Updated: ${meta.updated}`,
    ``,
    `${paramText(model)} ${kindLabel(model)}${model.release ? `, released ${model.release}` : ""}.`,
    ``,
    `- Peak ${memWord}: ~${need.neededGb} GB at ${need.quantLabel}${need.noOffloadGb ? ` (~${need.noOffloadGb} GB all-resident)` : ""}`,
    need.offloadFloorGb != null ? `- Offload floor: ~${need.offloadFloorGb} GB, much slower` : null,
    res ? `- Resolution: ${res}` : null,
    `- Tools: ${specTools(model)}`,
    `- License: ${model.license}${model.commercial_use ? ` (commercial use: ${model.commercial_use})` : ""}`,
    `- Runs on ${runnable.length} of ${devices.length} tracked devices`,
    ``,
    `Sources: ${model.sources.join(", ")}`,
    `More: https://localmodel.run/model/${model.id}`,
  ]
    .filter((l) => l !== null)
    .join("\n");
}

export function deviceMarkdown(device: DeviceRow): string {
  const usable = usableGb(device);
  const ranked = [...models]
    .map((m) => ({ m, r: canRun(m, device) }))
    .filter((x) => x.r.verdict !== "no")
    .sort((a, b) => b.m.params_b - a.m.params_b);
  return [
    `# Best local LLMs for ${device.name}`,
    ``,
    `Updated: ${meta.updated}`,
    ``,
    `${device.name}: ${device.memory_gb} GB ${device.memory_type}, ~${usable} GB usable. Runs ${ranked.length} of ${models.length} tracked models.`,
    ``,
    ...ranked
      .slice(0, 12)
      .map(
        (x) => `- ${x.m.name} (${x.m.params_b}B): ${x.r.verdict === "tight" ? "tight" : "runs"}`,
      ),
    ``,
    `More: https://localmodel.run/best-llm-for/${device.id}`,
  ].join("\n");
}

export function md(body: string): Response {
  return new Response(body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
