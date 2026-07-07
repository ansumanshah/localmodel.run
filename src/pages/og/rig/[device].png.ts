import type { APIRoute } from "astro";
import { renderOg, rigCard } from "@/lib/og";
import { devices, getDevice } from "@/lib/data";
import { rigScore } from "@/lib/rig";

export function getStaticPaths() {
  return devices.map((d) => ({ params: { device: d.id } }));
}

export const GET: APIRoute = async ({ params }) => {
  const d = getDevice(params.device!);
  if (!d) return new Response("Not found", { status: 404 });
  const score = rigScore(d);
  const png = await renderOg(
    rigCard({
      device: d.name,
      grade: score.grade,
      pct: score.pct,
      runnable: score.runnable,
      total: score.total,
      biggest: score.biggest?.name ?? "-",
    }),
  );
  return new Response(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" },
  });
};
