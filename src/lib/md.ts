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
  const need = r.estimate?.totalGb ?? 0;
  // Crawlable cross-links: the same model on other devices, other models on this device.
  const otherDevices = [...devices]
    .filter((d) => d.id !== device.id && canRun(model, d).verdict !== "no")
    .sort((a, b) => a.memory_gb - b.memory_gb)
    .slice(0, 6);
  const otherModels = [...models]
    .filter((m) => m.id !== model.id && canRun(m, device).verdict !== "no")
    .sort((a, b) => b.params_b - a.params_b)
    .slice(0, 6);

  return [
    `# Can I run ${model.name} on ${device.name}?`,
    ``,
    `> **${verdict}.** ${r.reason}`,
    ``,
    `Last validated: ${meta.updated}.`,
    ``,
    `## Memory math`,
    `- ${model.name}: ${model.params_b}B${model.is_moe ? ` (MoE, ${model.active_params_b}B active)` : ""}; Q4_K_M weighs ${model.q4_k_m_gb ?? "?"} GB on disk.`,
    `- At Q4_K_M with a 4k context it needs ~${need} GB (weights + KV cache + ~0.8 GB runtime overhead, ±15% with context length).`,
    `- ${device.name}: ${device.memory_gb} GB ${device.memory_type}, ~${usable} GB usable for model weights.`,
    `- Headroom: ~${r.headroomGb} GB${r.upgradeQuant ? `; it also fits ${QUANT_LABEL[r.upgradeQuant]} for higher quality.` : "."}`,
    ``,
    `## How to run`,
    `Recommended quant: ${r.quant ? QUANT_LABEL[r.quant] : "n/a"}. Best tool on ${platformLabel(platform)}: ${tool?.beginner.name ?? "Ollama"}.`,
    canOllama ? "" : null,
    canOllama ? "```sh\nollama run " + model.ollama_tag + "\n```" : null,
    otherDevices.length ? `` : null,
    otherDevices.length ? `## Run ${model.name} on other devices` : null,
    ...otherDevices.map((d) => `- [${d.name}](https://localmodel.run/can-i-run/${model.id}/${d.id})`),
    otherModels.length ? `` : null,
    otherModels.length ? `## Other models that run on ${device.name}` : null,
    ...otherModels.map((m) => `- [${m.name} (${m.params_b}B)](https://localmodel.run/can-i-run/${m.id}/${device.id})`),
    ``,
    `Estimate, not a guarantee. Sources: ${model.sources.join(", ")}.`,
    `More: https://localmodel.run/can-i-run/${model.id}/${device.id}`,
  ]
    .filter((l) => l !== null)
    .join("\n");
}

// Evenly-spaced sample (always includes the first and last element).
function pickSpread<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr;
  const out: T[] = [];
  for (let i = 0; i < n; i++) out.push(arr[Math.round((i * (arr.length - 1)) / (n - 1))]);
  return out;
}

export function modelMarkdown(model: ModelRow): string {
  if (modelModality(model) !== "text") return nonTextModelMarkdown(model);
  const q4 = estimateMemory(model, "q4_k_m");
  const q8 = estimateMemory(model, "q8_0");
  const fp16 = estimateMemory(model, "fp16");
  const byMem = [...devices].sort((a, b) => a.memory_gb - b.memory_gb);
  const runnable = byMem.filter((d) => canRun(model, d).verdict !== "no");
  const minDevice = runnable[0];
  const sample = pickSpread(byMem, 8).map((d) => ({ d, r: canRun(model, d) }));
  const paramLabel =
    model.params_b < 1 ? `${Math.round(model.params_b * 1000)}M` : `${model.params_b}B`;

  return [
    `# ${model.name}: RAM and VRAM requirements`,
    ``,
    `> ${model.name} is a ${paramLabel} ${model.family} model${model.is_moe ? ` (Mixture-of-Experts, ${model.active_params_b}B active per token)` : ""}. At Q4_K_M it needs about **${q4.totalGb} GB** to run and fits **${runnable.length} of ${devices.length}** tracked devices. Minimum to run: ${minDevice ? minDevice.name : "high-memory hardware"}.`,
    ``,
    `Last validated: ${meta.updated}. Sources: Ollama, HuggingFace GGUF repos, vendor specs.`,
    ``,
    `## Memory by quantization`,
    `| Quant | On disk | To run (4k context) |`,
    `| --- | --- | --- |`,
    `| Q4_K_M | ${model.q4_k_m_gb ?? q4.weightsGb} GB | ~${q4.totalGb} GB |`,
    model.q8_0_gb ? `| Q8_0 | ${model.q8_0_gb} GB | ~${q8.totalGb} GB |` : null,
    model.fp16_gb ? `| FP16 | ${model.fp16_gb} GB | ~${fp16.totalGb} GB |` : null,
    ``,
    `Memory = weights + KV cache + ~0.8 GB runtime overhead, and varies ±15% with context length.`,
    ``,
    `## Will it run on my device?`,
    ...sample.map(
      (x) =>
        `- **${x.d.name}** (${x.d.memory_gb} GB): ${verdictLabel(x.r.verdict)}${x.r.upgradeQuant ? ` — room for ${QUANT_LABEL[x.r.upgradeQuant]}` : ""}`,
    ),
    ``,
    `Full table of all ${devices.length} devices: https://localmodel.run/model/${model.id}`,
    ``,
    `## How to run`,
    model.ollama_tag
      ? "Quickest path: `ollama run " +
        model.ollama_tag +
        "`. On Mac, LM Studio (ships MLX) is fastest; on Linux, Ollama for chat or vLLM to serve; on Windows, LM Studio or Ollama."
      : "Use LM Studio (Mac/Windows) or Ollama / vLLM (Linux).",
    ``,
    `## Details`,
    `- Parameters: ${paramLabel}${model.is_moe ? ` (MoE, ${model.active_params_b}B active per token)` : ""}`,
    `- Default context: ${model.default_context_k}k tokens`,
    model.license
      ? `- License: ${model.license}${model.commercial_use ? ` (commercial use: ${model.commercial_use})` : ""}`
      : null,
    model.release ? `- Released: ${model.release}` : null,
    model.hf_downloads
      ? `- HuggingFace: ${model.hf_downloads.toLocaleString("en-US")} downloads/mo, ${model.hf_likes ?? 0} likes`
      : null,
    ``,
    `## FAQ`,
    `### How much VRAM or RAM does ${model.name} need?`,
    `About ${q4.totalGb} GB at Q4_K_M (weights ${model.q4_k_m_gb ?? q4.weightsGb} GB + KV cache + overhead) at a 4k context.${model.q8_0_gb ? ` Budget ~${q8.totalGb} GB for Q8_0.` : ""}`,
    `### Can ${model.name} run on a laptop?`,
    model.params_b <= 8
      ? `Yes. ${model.name} fits on a 16 GB laptop or Mac at Q4_K_M, and runs on Apple Silicon or a 12 GB+ GPU comfortably.`
      : `${model.name} is large; you need a high-memory Mac or a 24 GB+ GPU at Q4_K_M.`,
    ...(model.commercial_use != null
      ? [
          `### Can I use ${model.name} commercially?`,
          model.commercial_use === "yes"
            ? `Yes, ${model.license} permits commercial use.`
            : model.commercial_use === "conditional"
              ? `Conditionally: ${model.license_note ?? `the ${model.license} license applies`}.`
              : `No: ${model.license_note ?? `the ${model.license} license is non-commercial`}.`,
        ]
      : []),
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
