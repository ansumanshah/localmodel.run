import type { APIRoute } from "astro";
import { allModels, browserModels, devices, meta } from "@/lib/data";
import { json } from "@/lib/api";

// OpenAPI 3.1 description of the existing read-only data API. Lets API directories
// (APIs.guru, PublicAPIs.dev, RapidAPI) list us and lets agents/codegen consume the
// endpoints. Generated from the live data so counts + the example stay current.
export const GET: APIRoute = ({ site }) => {
  const origin = (site ?? new URL("https://localmodel.run")).origin;
  const exampleModel = allModels[0]?.id ?? "llama-3.1-8b";

  return json({
    openapi: "3.1.0",
    info: {
      title: "localmodel.run data API",
      version: "1.0.0",
      description:
        "Check whether a device can run a local AI model (text, image, video, audio) and how much memory it needs. Free, no auth, CORS-open. Memory figures are sourced estimates (see /methodology).",
      license: { name: "CC BY 4.0", url: `${origin}/methodology` },
      contact: { url: `${origin}/developers` },
    },
    servers: [{ url: origin }],
    paths: {
      "/api/index.json": {
        get: {
          operationId: "getCatalog",
          summary: "API catalog and discovery entry point",
          responses: {
            "200": { description: "Catalog of endpoints, counts, and discovery files" },
          },
        },
      },
      "/api/models.json": {
        get: {
          operationId: "listModels",
          summary: `List all ${allModels.length} tracked models with sizes and metadata`,
          responses: { "200": { description: "Array of model objects" } },
        },
      },
      "/api/devices.json": {
        get: {
          operationId: "listDevices",
          summary: `List all ${devices.length} tracked devices with memory specs`,
          responses: { "200": { description: "Array of device objects" } },
        },
      },
      "/api/browser-models.json": {
        get: {
          operationId: "listBrowserModels",
          summary: `List all ${browserModels.length} in-browser (WebGPU/WASM) models with per-variant measured download bytes`,
          description:
            "Raw contents of src/data/browser-models.json (no wrapper). Stable machine-readable source for in-browser model size/variant data.",
          responses: { "200": { description: "Array of browser model objects" } },
        },
      },
      "/api/can-i-run/{model}.json": {
        get: {
          operationId: "canRun",
          summary: "Verdict: can every tracked device run this model, and at what memory",
          description:
            "Consolidated 2026-08: per-device JSON moved into the per-model file (one file per model instead of one per model x device pair). Old per-pair URLs (/api/can-i-run/{model}/{device}.json) 301 here.",
          parameters: [
            {
              name: "model",
              in: "path",
              required: true,
              description: "Model id (see /api/models.json)",
              schema: { type: "string", example: exampleModel },
            },
          ],
          responses: {
            "200": {
              description:
                "Run verdicts for every tracked device, keyed by device id, with memory math and the recommended tool/command",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/RunVerdictSet" } },
              },
            },
            "404": { description: "Unknown model id" },
          },
        },
      },
    },
    components: {
      schemas: {
        RunVerdictSet: {
          type: "object",
          properties: {
            updated: { type: "string", description: "ISO date the data was last validated" },
            model: {
              type: "object",
              properties: {
                id: { type: "string" },
                name: { type: "string" },
                modality: { type: "string", enum: ["text", "image", "video", "audio"] },
                params_b: { type: "number" },
                is_moe: { type: "boolean" },
                active_params_b: { type: ["number", "null"] },
                q4_k_m_gb: { type: ["number", "null"] },
              },
            },
            devices: {
              type: "object",
              description: `Keyed by device id (see /api/devices.json), one entry per tracked device (${devices.length} currently)`,
              additionalProperties: {
                type: "object",
                properties: {
                  device: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      name: { type: "string" },
                      memory_gb: { type: "number" },
                      memory_type: { type: "string", enum: ["unified", "vram", "ram"] },
                      usable_gb: { type: "number" },
                    },
                  },
                  result: {
                    type: "object",
                    properties: {
                      verdict: { type: "string", enum: ["yes", "tight", "no"] },
                      recommended_quant: { type: ["string", "null"] },
                      needed_gb: { type: ["number", "null"] },
                      headroom_gb: { type: "number" },
                      speed: { type: "string", enum: ["fast", "ok", "slow", "none"] },
                      reason: { type: "string" },
                    },
                  },
                  best_tool: { type: ["string", "null"] },
                  platform: { type: "string", enum: ["mac", "windows", "linux", "ios", "android"] },
                  command: {
                    type: ["string", "null"],
                    description: "Ready-to-run command when it fits",
                  },
                },
              },
            },
            sources: { type: "array", items: { type: "string" } },
          },
        },
      },
    },
    "x-updated": meta.updated,
  });
};
