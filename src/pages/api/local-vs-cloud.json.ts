import type { APIRoute } from "astro";
import models from "@/data/cloud-comparison-models.json";
import benchmark from "@/data/arena-snapshot.json";
import { json } from "@/lib/api";

/** The exact selected source rows and dated vendor tariffs used by the page. */
export const GET: APIRoute = () => json({ models, benchmark });
