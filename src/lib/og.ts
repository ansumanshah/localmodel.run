import satori from "satori";
import { html } from "satori-html";
import { Resvg } from "@resvg/resvg-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Dynamic OG/social-card generation: Satori (HTML -> SVG) -> resvg (SVG -> PNG).
// Runs at build time (static endpoints), so the output is plain PNG files.
// Fonts are read from the source tree relative to the build cwd (project root),
// which survives Astro's prerender bundling (import.meta.url does not).

// Geist (the site font) for the social cards too, read from the @fontsource
// package at build time. Satori needs static .woff (not the variable woff2).
const fontsDir = join(process.cwd(), "node_modules", "@fontsource", "geist-sans", "files");
const fontRegular = readFileSync(join(fontsDir, "geist-sans-latin-400-normal.woff"));
const fontBold = readFileSync(join(fontsDir, "geist-sans-latin-700-normal.woff"));

const C = {
  bg: "#16161e",
  bg2: "#1b1b25",
  card: "#201f2b",
  text: "#f4f4f5",
  muted: "#a1a1aa",
  brand: "#7d6bf3",
  green: "#34d399",
  amber: "#fbbf24",
  red: "#f87171",
  border: "#2a2935",
};

export async function renderOg(markup: string, width = 1200, height = 630): Promise<Uint8Array> {
  const vnode = html(markup);
  const svg = await satori(vnode as Parameters<typeof satori>[0], {
    width,
    height,
    fonts: [
      { name: "Geist", data: fontRegular, weight: 400, style: "normal" },
      { name: "Geist", data: fontBold, weight: 700, style: "normal" },
    ],
  });
  return new Resvg(svg, { fitTo: { mode: "width", value: width } }).render().asPng();
}

const shell = (inner: string) => `
<div style="display:flex;flex-direction:column;width:1200px;height:630px;padding:64px;background:${C.bg};background-image:radial-gradient(60% 60% at 50% 0%, #231d54 0%, ${C.bg} 60%);font-family:Geist;color:${C.text}">
  <div style="display:flex;align-items:center;gap:14px">
    <div style="display:flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:12px;background:${C.brand}"><svg width="28" height="28" viewBox="0 0 24 24" fill="none"><rect x="3" y="7" width="15.5" height="10" rx="3" fill="none" stroke="#fff" stroke-width="2"/><rect x="5" y="9" width="9" height="6" rx="1.4" fill="#16e07f"/><rect x="20" y="10.2" width="1.8" height="3.6" rx="0.9" fill="#fff"/><path d="M12.2 6.6 8.2 12.8 11 12.8 10 17.4 14.6 11 11.8 11Z" fill="${C.bg}"/></svg></div>
    <div style="display:flex;font-size:28px;font-weight:700">localmodel<span style="color:${C.muted}">.run</span></div>
  </div>
  ${inner}
</div>`;

export function homeCard(): string {
  return shell(`
  <div style="display:flex;flex-direction:column;margin-top:auto">
    <div style="display:flex;font-size:74px;font-weight:700;line-height:1.05">Can I run this AI</div>
    <div style="display:flex;font-size:74px;font-weight:700;line-height:1.05">model <span style="color:${C.brand};margin-left:18px">locally?</span></div>
    <div style="display:flex;font-size:30px;color:${C.muted};margin-top:24px">Mac · Windows · Linux · iOS · Android, which model, which tool.</div>
  </div>`);
}

export function modelCard(opts: {
  name: string;
  params: string;
  q4: string;
  context: string;
}): string {
  return shell(`
  <div style="display:flex;flex-direction:column;margin-top:auto">
    <div style="display:flex;font-size:26px;color:${C.muted}">Can I run</div>
    <div style="display:flex;font-size:72px;font-weight:700;line-height:1.05">${opts.name}</div>
    <div style="display:flex;font-size:30px;color:${C.muted};margin-top:8px">locally?</div>
    <div style="display:flex;gap:14px;margin-top:32px">
      ${pill(`${opts.params} params`)}
      ${pill(`${opts.q4} at Q4_K_M`)}
      ${pill(`${opts.context} context`)}
    </div>
  </div>`);
}

export function imageModelCard(opts: {
  name: string;
  kind: string; // "Image model (DiT)"
  params: string;
  vram: string;
  resolution: string;
}): string {
  return shell(`
  <div style="display:flex;flex-direction:column;margin-top:auto">
    <div style="display:flex;font-size:26px;color:${C.muted}">Can I run</div>
    <div style="display:flex;font-size:72px;font-weight:700;line-height:1.05">${opts.name}</div>
    <div style="display:flex;font-size:30px;color:${C.muted};margin-top:8px">locally?</div>
    <div style="display:flex;gap:14px;margin-top:32px">
      ${pill(opts.kind)}
      ${pill(`${opts.params} params`)}
      ${pill(`${opts.vram} VRAM`)}
      ${pill(opts.resolution)}
    </div>
  </div>`);
}

export function audioModelCard(opts: {
  name: string;
  task: string; // "Speech to text"
  params: string;
  mem: string;
}): string {
  return shell(`
  <div style="display:flex;flex-direction:column;margin-top:auto">
    <div style="display:flex;font-size:26px;color:${C.muted}">Can I run</div>
    <div style="display:flex;font-size:72px;font-weight:700;line-height:1.05">${opts.name}</div>
    <div style="display:flex;font-size:30px;color:${C.muted};margin-top:8px">locally?</div>
    <div style="display:flex;gap:14px;margin-top:32px">
      ${pill(opts.task)}
      ${pill(`${opts.params} params`)}
      ${pill(`${opts.mem} memory`)}
    </div>
  </div>`);
}

const GRADE_COLOR: Record<string, string> = {
  S: C.green,
  A: C.green,
  B: "#86efac",
  C: C.amber,
  D: "#fdba74",
  F: C.red,
};

export function rigCard(opts: {
  device: string;
  grade: string;
  pct: number;
  runnable: number;
  total: number;
  biggest: string;
}): string {
  const col = GRADE_COLOR[opts.grade] ?? C.muted;
  return shell(`
  <div style="display:flex;align-items:center;margin-top:auto;gap:48px">
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;width:240px;height:240px;border-radius:32px;background:${C.card};border:3px solid ${col}">
      <div style="display:flex;font-size:30px;color:${C.muted}">Rig Score</div>
      <div style="display:flex;font-size:150px;font-weight:700;line-height:1;color:${col}">${opts.grade}</div>
    </div>
    <div style="display:flex;flex-direction:column">
      <div style="display:flex;font-size:30px;color:${C.muted}">My rig</div>
      <div style="display:flex;font-size:56px;font-weight:700;line-height:1.1;max-width:680px">${opts.device}</div>
      <div style="display:flex;font-size:34px;margin-top:24px">Runs <span style="color:${C.brand};font-weight:700;margin:0 10px">${opts.runnable} of ${opts.total}</span> models (${opts.pct}%)</div>
      <div style="display:flex;font-size:28px;color:${C.muted};margin-top:10px">Biggest it can run: ${opts.biggest}</div>
    </div>
  </div>`);
}

function pill(text: string): string {
  return `<div style="display:flex;align-items:center;padding:10px 20px;border-radius:999px;background:${C.card};border:1px solid ${C.border};font-size:26px;color:${C.text}">${text}</div>`;
}
