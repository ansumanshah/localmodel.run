import type { APIRoute } from "astro";
import { allModels, getAnyModel } from "@/lib/data";
import { modelMarkdown, md } from "@/lib/md";

export function getStaticPaths() {
  return allModels.map((m) => ({ params: { model: m.id } }));
}

export const GET: APIRoute = ({ params }) => {
  const model = getAnyModel(params.model!);
  if (!model) return new Response("Not found", { status: 404 });
  return md(modelMarkdown(model));
};
