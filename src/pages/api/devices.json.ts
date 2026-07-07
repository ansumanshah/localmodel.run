import type { APIRoute } from "astro";
import { devices, meta } from "@/lib/data";
import { json } from "@/lib/api";

export const GET: APIRoute = () => json({ updated: meta.updated, count: devices.length, devices });
