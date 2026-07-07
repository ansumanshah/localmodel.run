import type { APIRoute } from "astro";
import { models, devices } from "@/lib/data";
import { canRun } from "@/lib/compute";
import { badgeSvg, badgeContent } from "@/lib/badge";

// One badge per text model x device. Multi-modal models use a different verdict
// engine (compute-mm) and are intentionally excluded from the badge for now.
export function getStaticPaths() {
  return models.flatMap((m) => devices.map((d) => ({ params: { model: m.id, device: d.id } })));
}

export const GET: APIRoute = ({ params }) => {
  const m = models.find((x) => x.id === params.model);
  const d = devices.find((x) => x.id === params.device);
  if (!m || !d) return new Response("Not found", { status: 404 });

  const { value, color } = badgeContent(canRun(m, d));
  return new Response(badgeSvg(d.name, value, color), {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      // Long edge cache; deploy-purge busts it (same as /og).
      "Cache-Control": "public, max-age=86400",
    },
  });
};
