import type { APIRoute } from "astro";
import { BUILD_VERSION, BUILD_COMMIT, BUILD_TIME } from "@/lib/build-info";
import { allModels, devices, meta } from "@/lib/data";

// Machine-readable build identity. `no-store` so it always reflects the live
// deploy: `curl https://localmodel.run/version.json` confirms which commit is up.
export const GET: APIRoute = () =>
  new Response(
    JSON.stringify(
      {
        version: BUILD_VERSION,
        commit: BUILD_COMMIT,
        builtAt: BUILD_TIME,
        dataValidated: meta.updated,
        models: allModels.length,
        devices: devices.length,
      },
      null,
      2,
    ),
    {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
