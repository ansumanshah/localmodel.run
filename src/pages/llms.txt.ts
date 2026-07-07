import type { APIRoute } from "astro";
import {
  models,
  imageModels,
  videoModels,
  audioModels,
  allModels,
  devices,
  tools,
  platformLabel,
  meta,
} from "@/lib/data";
import { modalityNeed } from "@/lib/compute-mm";

// llms.txt, a concise, LLM-friendly map of the site so answer engines can
// understand and cite it. https://llmstxt.org
export const GET: APIRoute = ({ site }) => {
  const origin = (site ?? new URL("https://localmodel.run")).origin;
  const lines: string[] = [];

  lines.push("# localmodel.run");
  lines.push("");
  lines.push(
    "> Free tool to check whether a computer or phone can run a given local AI model, and which runtime to use, across macOS, Windows, Linux, iOS and Android. Covers text LLMs plus image, video and audio generation models. Data is validated against vendor specs, Ollama and HuggingFace.",
  );
  lines.push("");
  lines.push(
    `Dataset: ${allModels.length} models (${models.length} text, ${imageModels.length} image, ${videoModels.length} video, ${audioModels.length} audio), ${devices.length} devices. Last validated ${meta.updated}. Memory figures are estimates; see ${origin}/methodology.`,
  );
  lines.push("");

  lines.push("## Text LLMs");
  for (const m of models) {
    const size = m.q4_k_m_gb ? `${m.q4_k_m_gb}GB Q4_K_M` : `${m.params_b}B`;
    lines.push(
      `- [${m.name}](${origin}/model/${m.id}): ${m.params_b}B${m.is_moe ? ` MoE (${m.active_params_b}B active)` : ""}, ${size}, ${m.default_context_k}k context.`,
    );
  }
  lines.push("");

  for (const [title, list] of [
    ["Image models", imageModels],
    ["Video models", videoModels],
    ["Audio & voice models", audioModels],
  ] as const) {
    if (!list.length) continue;
    lines.push(`## ${title}`);
    for (const m of list) {
      const need = modalityNeed(m);
      const p = m.params_b < 1 ? `${Math.round(m.params_b * 1000)}M` : `${m.params_b}B`;
      const memWord = m.modality === "audio" ? "memory" : "VRAM";
      lines.push(
        `- [${m.name}](${origin}/model/${m.id}): ${p}, ~${need?.neededGb}GB ${memWord} at ${need?.quantLabel}, license ${m.license}.`,
      );
    }
    lines.push("");
  }

  lines.push("## Devices");
  for (const d of devices) {
    lines.push(
      `- [${d.name}](${origin}/best-llm-for/${d.id}): ${d.memory_gb}GB ${d.memory_type}, ~${d.usable_memory_gb ?? "?"}GB usable for weights.`,
    );
  }
  lines.push("");

  lines.push("## Tools by platform");
  for (const t of tools) {
    lines.push(
      `- ${platformLabel(t.platform)}: beginner ${t.beginner.name}, power ${t.power.name}. ${t.gotcha}`,
    );
  }
  lines.push("");

  lines.push("## Key pages");
  lines.push(`- [How we calculate](${origin}/methodology)`);
  lines.push(`- [All models](${origin}/can-i-run)`);
  lines.push(`- [All devices](${origin}/best-llm-for)`);
  lines.push(
    `- [Tools guide](${origin}/tools): Compare local LLM runtimes (Ollama, LM Studio, llama.cpp, etc.) by platform and use-case.`,
  );
  lines.push(
    `- [Leaderboard](${origin}/leaderboard): Open text LLMs ranked by LMArena (Chatbot Arena) Elo, each linked to its hardware requirements.`,
  );
  lines.push(
    `- [Developers](${origin}/developers): API reference and JSON endpoints for programmatic access to model and device data.`,
  );

  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
