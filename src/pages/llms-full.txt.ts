import type { APIRoute } from "astro";
import { models, imageModels, videoModels, audioModels, devices, meta } from "@/lib/data";
import { estimateMemory } from "@/lib/compute";
import { modalityNeed } from "@/lib/compute-mm";

// llms-full.txt, fuller, self-contained facts so an answer engine can cite
// specific numbers without crawling every page.
export const GET: APIRoute = ({ site }) => {
  const origin = (site ?? new URL("https://localmodel.run")).origin;
  const out: string[] = [];

  out.push("# localmodel.run, full dataset");
  out.push(
    `Validated ${meta.updated}. Memory = weights + KV cache + ~0.8GB overhead. Estimates only.`,
  );
  out.push("");

  out.push("## Models (memory at Q4_K_M, 4k context)");
  for (const m of models) {
    const e = estimateMemory(m, "q4_k_m");
    out.push(
      `### ${m.name} (${origin}/model/${m.id})\n` +
        `- Params: ${m.params_b}B${m.is_moe ? ` (MoE, ${m.active_params_b}B active per token)` : ""}\n` +
        `- Q4_K_M on disk: ${m.q4_k_m_gb ?? "n/a"} GB; Q8_0: ${m.q8_0_gb ?? "n/a"} GB\n` +
        `- Est. memory to run (Q4_K_M, 4k ctx): ~${e.totalGb} GB\n` +
        `- Context: ${m.default_context_k}k; Ollama: ${m.ollama_tag ?? "n/a"}; Released: ${m.release ?? "n/a"}\n` +
        `- Sources: ${m.sources.join(", ")}`,
    );
  }
  out.push("");

  for (const [title, list] of [
    ["Image generation models (peak VRAM consumed)", imageModels],
    ["Video generation models (peak VRAM consumed)", videoModels],
    ["Audio & voice models (peak memory consumed)", audioModels],
  ] as const) {
    if (!list.length) continue;
    out.push(`## ${title}`);
    for (const m of list) {
      const need = modalityNeed(m);
      const p = m.params_b < 1 ? `${Math.round(m.params_b * 1000)}M` : `${m.params_b}B`;
      const memWord = m.modality === "audio" ? "memory" : "VRAM";
      out.push(
        `### ${m.name} (${origin}/model/${m.id})\n` +
          `- Params: ${p}${m.is_moe ? ` (MoE, ${m.active_params_b}B active)` : ""}\n` +
          `- Peak ${memWord}: ~${need?.neededGb} GB at ${need?.quantLabel}${need?.noOffloadGb ? `; ~${need.noOffloadGb} GB all-resident` : ""}${need?.offloadFloorGb != null ? `; ~${need.offloadFloorGb} GB with aggressive offload` : ""}\n` +
          `- License: ${m.license}${m.commercial_use ? ` (commercial use: ${m.commercial_use})` : ""}; Released: ${m.release ?? "n/a"}\n` +
          `- Sources: ${m.sources.join(", ")}`,
      );
    }
    out.push("");
  }

  out.push("## Devices (usable memory for model weights)");
  for (const d of devices) {
    out.push(
      `### ${d.name} (${origin}/best-llm-for/${d.id})\n` +
        `- Memory: ${d.memory_gb} GB ${d.memory_type}; usable for weights: ~${d.usable_memory_gb ?? "?"} GB\n` +
        `- Best runtime: ${d.best_runtime ?? "n/a"}\n` +
        `- Notes: ${d.notes}\n` +
        `- Sources: ${d.sources.join(", ")}`,
    );
  }

  return new Response(out.join("\n\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
