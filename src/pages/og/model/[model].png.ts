import type { APIRoute } from "astro";
import { renderOg, modelCard, imageModelCard, audioModelCard } from "@/lib/og";
import { allModels, getAnyModel } from "@/lib/data";
import { modalityNeed } from "@/lib/compute-mm";

export function getStaticPaths() {
  return allModels.map((m) => ({ params: { model: m.id } }));
}

const paramLabel = (b: number) => (b < 1 ? `${Math.round(b * 1000)}M` : `${b}B`);

export const GET: APIRoute = async ({ params }) => {
  const m = getAnyModel(params.model!);
  if (!m) return new Response("Not found", { status: 404 });

  let markup: string;
  if (m.modality === "image" && m.image) {
    const need = modalityNeed(m)!;
    markup = imageModelCard({
      name: m.name,
      kind: `Image model (${m.image.arch.toUpperCase()})`,
      params: `${m.params_b}B`,
      vram: `~${need.neededGb} GB`,
      resolution: m.image.native_resolution,
    });
  } else if (m.modality === "video" && m.video) {
    const need = modalityNeed(m)!;
    markup = imageModelCard({
      name: m.name,
      kind: `Video model (${m.video.arch.toUpperCase()})`,
      params: paramLabel(m.params_b),
      vram: `~${need.neededGb} GB`,
      resolution: m.video.default_resolution,
    });
  } else if (m.modality === "audio" && m.audio) {
    const need = modalityNeed(m)!;
    markup = audioModelCard({
      name: m.name,
      task: m.audio.task,
      params: paramLabel(m.params_b),
      mem: `~${need.neededGb} GB`,
    });
  } else {
    markup = modelCard({
      name: m.name,
      params: m.is_moe ? `${m.params_b}B MoE` : `${m.params_b}B`,
      q4: m.q4_k_m_gb ? `${m.q4_k_m_gb} GB` : `${m.params_b}B`,
      context: `${m.default_context_k}k`,
    });
  }
  const png = await renderOg(markup);
  return new Response(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" },
  });
};
