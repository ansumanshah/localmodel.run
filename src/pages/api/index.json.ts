import type { APIRoute } from "astro";
import { allModels, devices, meta } from "@/lib/data";
import { json } from "@/lib/api";

// API catalog: the discovery entry point for AI agents.
export const GET: APIRoute = ({ site }) => {
  const origin = (site ?? new URL("https://localmodel.run")).origin;
  return json({
    name: "localmodel.run API",
    description:
      "Check whether a device can run a local AI model (text, image, video, audio), and which tool to use. Free, no auth.",
    version: "1",
    updated: meta.updated,
    counts: { models: allModels.length, devices: devices.length },
    endpoints: {
      models: `${origin}/api/models.json`,
      devices: `${origin}/api/devices.json`,
      can_i_run: `${origin}/api/can-i-run/{model}/{device}.json`,
      example: `${origin}/api/can-i-run/llama-3.1-8b/apple-m4-16gb.json`,
      openapi: `${origin}/api/openapi.json`,
    },
    discovery: {
      llms_txt: `${origin}/llms.txt`,
      llms_full_txt: `${origin}/llms-full.txt`,
      agent_card: `${origin}/.well-known/agent.json`,
      sitemap: `${origin}/sitemap-index.xml`,
    },
    methodology: `${origin}/methodology`,
    note: "Memory figures are estimates. See methodology.",
    license: "Data CC BY 4.0 with attribution to localmodel.run",
  });
};
