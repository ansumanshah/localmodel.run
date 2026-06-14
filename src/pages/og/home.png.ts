import type { APIRoute } from "astro";
import { renderOg, homeCard } from "@/lib/og";

export const GET: APIRoute = async () => {
  const png = await renderOg(homeCard());
  return new Response(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" },
  });
};
