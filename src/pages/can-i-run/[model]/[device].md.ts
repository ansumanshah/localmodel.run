import type { APIRoute } from "astro";
import { getAnyModel, getDevice, modalityPairs } from "@/lib/data";
import { pairMarkdown, md } from "@/lib/md";

export function getStaticPaths() {
  return modalityPairs().map(({ model, device }) => ({
    params: { model: model.id, device: device.id },
  }));
}

export const GET: APIRoute = ({ params }) => {
  const model = getAnyModel(params.model!);
  const device = getDevice(params.device!);
  if (!model || !device) return new Response("Not found", { status: 404 });
  return md(pairMarkdown(model, device));
};
