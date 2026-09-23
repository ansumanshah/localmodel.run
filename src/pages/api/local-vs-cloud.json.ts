import type { APIRoute } from "astro";
import benchmark from "@/data/arena-snapshot.json";
import { json } from "@/lib/api";
import { buildCloudComparison } from "@/lib/cloud-comparison";

/** The selected, scored rows and dated vendor tariffs used by the page. */
export const GET: APIRoute = () => json({ models: buildCloudComparison().rows, benchmark });
