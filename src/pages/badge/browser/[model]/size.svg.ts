import type { APIRoute } from "astro";
import { browserModels } from "@/lib/data";
import { badgeSvg, browserBadgeContent } from "@/lib/badge";

// One badge per browser (ONNX / Transformers.js) model: the measured WebGPU
// headline download size. Lives at /badge/browser/<model>/size.svg, one
// segment deeper than the GGUF pair badge at /badge/[model]/[device].svg, on
// purpose: a 4-segment path can never match a 3-segment route pattern, so the
// two routes cannot collide or shadow one another regardless of any model id.
export function getStaticPaths() {
  return browserModels.map((m) => ({ params: { model: m.id } }));
}

export const GET: APIRoute = ({ params }) => {
  const m = browserModels.find((x) => x.id === params.model);
  if (!m) return new Response("Not found", { status: 404 });

  const { value, color } = browserBadgeContent(m);
  return new Response(badgeSvg("in browser", value, color), {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      // Long edge cache; deploy-purge busts it (same as /og and the GGUF badge).
      "Cache-Control": "public, max-age=86400",
    },
  });
};
