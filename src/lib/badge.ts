import type { RunResult } from "@/lib/compute";
import type { BrowserModelRow } from "@/data/types";
import { formatBytes } from "@/lib/data";

/*
  Shields-style status badge as inline SVG, generated at build time from the run
  verdict. Powers /badge/[model]/[device].svg so a model author can drop one line
  into a HuggingFace / GitHub README:

    [![Runs on M4](https://localmodel.run/badge/llama-3.1-8b/apple-m4-16gb.svg)](https://localmodel.run/can-i-run/llama-3.1-8b/apple-m4-16gb)

  Each embed is a backlink from a high-authority domain. SVG only (no satori),
  ~700 bytes, zero runtime.
*/

const FONT = "Verdana,DejaVu Sans,Geneva,sans-serif";

// White-text-readable verdict colours. The site's UI tokens (oklch) are tuned
// for DARK text on light fills and don't render in SVG; a badge needs solid
// hex with enough contrast for white text, so these are darker on purpose.
export const BADGE_COLOR = { yes: "#1f9d57", tight: "#bd7d09", no: "#d23f3f" } as const;
const LABEL_BG = "#3b3f4a";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ~6.6px per char at 11px Verdana + padding; generous so text never clips.
const segWidth = (s: string) => Math.ceil(s.length * 6.6) + 14;

/** Two-segment flat badge: dark label on the left, coloured value on the right. */
export function badgeSvg(label: string, value: string, colorHex: string): string {
  const h = 20;
  const lw = segWidth(label);
  const vw = segWidth(value);
  const w = lw + vw;
  const L = esc(label);
  const V = esc(value);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" role="img" aria-label="${L}: ${V}">
<title>${L}: ${V}</title>
<clipPath id="r"><rect width="${w}" height="${h}" rx="3"/></clipPath>
<g clip-path="url(#r)">
<rect width="${lw}" height="${h}" fill="${LABEL_BG}"/>
<rect x="${lw}" width="${vw}" height="${h}" fill="${colorHex}"/>
</g>
<g fill="#fff" font-family="${FONT}" font-size="11" text-anchor="middle">
<text x="${lw / 2}" y="14">${L}</text>
<text x="${lw + vw / 2}" y="14">${V}</text>
</g>
</svg>`;
}

/** Map a RunResult to the badge's right-segment text + colour. */
export function badgeContent(r: RunResult): { value: string; color: string } {
  const gb = r.estimate?.totalGb ?? 0;
  if (r.verdict === "yes") return { value: `runs · ${gb} GB`, color: BADGE_COLOR.yes };
  if (r.verdict === "tight") return { value: `tight · ${gb} GB`, color: BADGE_COLOR.tight };
  return { value: `needs ${gb} GB`, color: BADGE_COLOR.no };
}

// Browser badge colour ladder, bucketed by the measured WebGPU headline
// download weight (bytes), reusing the yes/tight/no hexes above. Same three
// colours as the compatibility badge; the meaning here is size, not fit:
//   small  : < 150 MB    -> yes   (a download that barely registers)
//   medium : 150 MB-1 GB -> tight (a real but ordinary tab download)
//   heavy  : >= 1 GB     -> no    (matches formatBytes' own MB-to-GB cutover)
// Locked in badge.test.ts so a future catalog addition can't silently shift
// the ladder without a deliberate test update.
export const BROWSER_BADGE_SMALL_MAX_BYTES = 150 * 1024 * 1024; // 150 MB
export const BROWSER_BADGE_HEAVY_MIN_BYTES = 1024 * 1024 * 1024; // 1 GB

export type BrowserBadgeWeight = "small" | "medium" | "heavy";

export function browserBadgeWeight(bytes: number): BrowserBadgeWeight {
  if (bytes < BROWSER_BADGE_SMALL_MAX_BYTES) return "small";
  if (bytes < BROWSER_BADGE_HEAVY_MIN_BYTES) return "medium";
  return "heavy";
}

const BROWSER_BADGE_WEIGHT_COLOR: Record<BrowserBadgeWeight, string> = {
  small: BADGE_COLOR.yes,
  medium: BADGE_COLOR.tight,
  heavy: BADGE_COLOR.no,
};

/**
 * Map a browser (ONNX / Transformers.js) model row to the badge's
 * right-segment text + colour. The value is always the measured WebGPU
 * headline download, formatted with the same formatBytes() the model page
 * itself uses, so the badge and the page it links to can never disagree.
 */
export function browserBadgeContent(model: BrowserModelRow): { value: string; color: string } {
  const bytes = model.headline.webgpu.bytes;
  return {
    value: formatBytes(bytes),
    color: BROWSER_BADGE_WEIGHT_COLOR[browserBadgeWeight(bytes)],
  };
}
