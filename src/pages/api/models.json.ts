import type { APIRoute } from "astro";
import { models, imageModels, videoModels, audioModels, allModels, meta } from "@/lib/data";
import { json } from "@/lib/api";

export const GET: APIRoute = () =>
  json({
    updated: meta.updated,
    count: allModels.length,
    counts: {
      text: models.length,
      image: imageModels.length,
      video: videoModels.length,
      audio: audioModels.length,
    },
    models: allModels,
  });
