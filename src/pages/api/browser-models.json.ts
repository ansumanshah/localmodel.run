import type { APIRoute } from "astro";
import { browserModels } from "@/lib/data";
import { json } from "@/lib/api";

// Serves src/data/browser-models.json verbatim (raw array, no wrapper). This URL is the
// refresh() endpoint consumed by browserfit and other clients that snapshot the file's own
// shape directly, so it must match src/data/browser-models.json byte-for-shape.
export const GET: APIRoute = () => json(browserModels);
