import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { models } from "@/lib/data";

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
    .map((m) => ({
      title: `${m.name}, can you run it locally?`,
      description: `${m.params_b}B${m.is_moe ? ` MoE` : ""}, ${m.q4_k_m_gb ?? "?"} GB at Q4_K_M. Check which devices can run ${m.name}.`,
      link: `/model/${m.id}`,
      pubDate: parseRelease(m.release),
    }));

  return rss({
    title: "localmodel.run, models",
    description: "Newly tracked local LLMs and their hardware requirements.",
    site,
    items,
  });
}
