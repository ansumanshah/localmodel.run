import type { APIRoute } from "astro";
import { devices, getDevice } from "@/lib/data";
import { deviceMarkdown, md } from "@/lib/md";

export function getStaticPaths() {
  return devices.map((d) => ({ params: { device: d.id } }));
}

export const GET: APIRoute = ({ params }) => {
  const device = getDevice(params.device!);
  if (!device) return new Response("Not found", { status: 404 });
  return md(deviceMarkdown(device));
};
