import type { APIRoute } from "astro";
import { hostedModels } from "@/lib/hosted-models";
import { json } from "@/lib/api";

export const GET: APIRoute = () => json(hostedModels);
