import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { models, devices } from "@/lib/data";
import { canRun, estimateMemory } from "@/lib/compute";

function parseRelease(rel: string | null): Date {
  if (!rel) return new Date("2026-06-14T00:00:00Z");
  const s = /^\d{4}-\d{2}$/.test(rel) ? `${rel}-01` : rel; // YYYY-MM -> YYYY-MM-01
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? new Date("2026-06-14T00:00:00Z") : d;
}

export function GET(context: APIContext) {
  const site = context.site ?? new URL("https://localmodel.run");
  const items = [...models]
    .sort((a, b) => (b.release ?? "").localeCompare(a.release ?? ""))
    .slice(0, 30)
    .map((m) => {
      const q4 = estimateMemory(m, "q4_k_m");
      const runs = devices.filter((d) => canRun(m, d).verdict !== "no").length;
      return {
        title: `${m.name}: ~${q4.totalGb} GB to run locally`,
        // Lead with the number + the device count: the lede newsletters/AI summarisers absorb.
        description: `${m.name} (${m.params_b}B${m.is_moe ? " MoE" : ""}) needs ~${q4.totalGb} GB at Q4_K_M and runs on ${runs} of ${devices.length} tracked devices.`,
        link: `/model/${m.id}`,
        pubDate: parseRelease(m.release),
        content: `<p><strong>${m.name}</strong> (${m.params_b}B${m.is_moe ? ` MoE, ${m.active_params_b}B active` : ""}) needs about <strong>${q4.totalGb} GB</strong> at Q4_K_M and runs on <strong>${runs} of ${devices.length}</strong> tracked devices.</p><p><a href="https://localmodel.run/model/${m.id}">Full memory breakdown and per-device verdicts &rarr;</a></p>`,
      };
    });

  return rss({
    title: "localmodel.run, models",
    description: "Newly tracked local LLMs and their hardware requirements.",
    site,
    items,
  });
}
