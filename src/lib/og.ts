import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { Resvg } from '@resvg/resvg-js'
import satori from 'satori'
import { html } from 'satori-html'

// Dynamic OG/social-card generation: Satori (HTML -> SVG) -> resvg (SVG -> PNG).
// Runs at build time (static endpoints), so the output is plain PNG files.
// Fonts are read from the source tree relative to the build cwd (project root),
// which survives Astro's prerender bundling (import.meta.url does not).

// Public Sans (the site body face) for the social cards too, read from the
// @fontsource package at build time. Satori needs static .woff (not woff2).
const fontsDir = join(process.cwd(), 'node_modules', '@fontsource', 'public-sans', 'files')
const fontRegular = readFileSync(join(fontsDir, 'public-sans-latin-400-normal.woff'))
const fontBold = readFileSync(join(fontsDir, 'public-sans-latin-700-normal.woff'))

// Build-time PNG cache. The markup string fully determines a card's pixels, so
// hash(markup + dims + font bytes) is a COMPLETE key: a hit is always correct,
// and a font/template/data change changes the markup or fontKey and misses. The
// 168 satori+resvg renders are ~73% of the build, so a warm local rebuild drops
// from ~25s to a few seconds. CI/CF start with an empty cache (fresh workspace),
// so they always regenerate. The dir lives under node_modules (gitignored); any
// cache I/O error falls through to a normal render, so it can never break a build.
const OG_CACHE_DIR = join(process.cwd(), 'node_modules', '.cache', 'og')
const fontKey = createHash('sha1').update(fontRegular).update(fontBold).digest('hex').slice(0, 8)
let ogCacheReady = false

// The Calibrated Instrument on gunmetal: matte bench-plate cards, needle accent.
const C = {
  bg: '#15171a',
  bg2: '#1c1f24',
  card: '#1c1f24',
  text: '#edeff2',
  muted: '#9ba0a8',
  brand: '#85ace2',
  green: '#8fbf88',
  amber: '#d9a94f',
  red: '#e08579',
  border: '#2c2f34',
}

export async function renderOg(markup: string, width = 1200, height = 630): Promise<Uint8Array> {
  const key = createHash('sha1').update(`${fontKey}|${width}x${height}|${markup}`).digest('hex')
  const cachePath = join(OG_CACHE_DIR, `${key}.png`)
  try {
    if (existsSync(cachePath)) return readFileSync(cachePath)
  } catch {
    /* unreadable cache entry: fall through and re-render */
  }

  const vnode = html(markup)
  const svg = await satori(vnode as Parameters<typeof satori>[0], {
    width,
    height,
    fonts: [
      { name: 'Geist', data: fontRegular, weight: 400, style: 'normal' },
      { name: 'Geist', data: fontBold, weight: 700, style: 'normal' },
      // Kept under the historical family name so every card template's
      // font-family:Geist declaration resolves without a sweep of edits.
    ],
  })
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render().asPng()

  try {
    if (!ogCacheReady) {
      mkdirSync(OG_CACHE_DIR, { recursive: true })
      ogCacheReady = true
    }
    writeFileSync(cachePath, png)
  } catch {
    /* read-only fs or quota: caching is best-effort, never fatal */
  }
  return png
}

const shell = (inner: string) => `
<div style="display:flex;flex-direction:column;width:1200px;height:630px;padding:64px;background:${C.bg};font-family:Geist;color:${C.text}">
  <div style="display:flex;align-items:center;gap:14px">
    <div style="display:flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:4px;border:1px solid ${C.border};background:${C.bg2}"><svg width="30" height="30" viewBox="0 0 24 24" fill="none"><path d="M3 19 A 9 9 0 0 1 21 19" stroke="${C.text}" stroke-width="2.2" stroke-linecap="round"/><line x1="12" y1="19" x2="14.5" y2="11.4" stroke="#7fa8e0" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="19" r="1.9" fill="#7fa8e0"/></svg></div>
    <div style="display:flex;font-size:28px;font-weight:700">localmodel<span style="color:${C.muted}">.run</span></div>
  </div>
  ${inner}
</div>`

export function homeCard(): string {
  return shell(`
  <div style="display:flex;flex-direction:column;margin-top:auto">
    <div style="display:flex;font-size:74px;font-weight:700;line-height:1.05">Can I run this AI</div>
    <div style="display:flex;font-size:74px;font-weight:700;line-height:1.05">model <span style="color:${C.brand};margin-left:18px">locally?</span></div>
    <div style="display:flex;font-size:30px;color:${C.muted};margin-top:24px">Mac · Windows · Linux · iOS · Android, which model, which tool.</div>
  </div>`)
}

export function modelCard(opts: { name: string; params: string; q4: string; context: string }): string {
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
  </div>`)
}

export function imageModelCard(opts: {
  name: string
  kind: string // "Image model (DiT)"
  params: string
  vram: string
  resolution: string
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
  </div>`)
}

export function audioModelCard(opts: {
  name: string
  task: string // "Speech to text"
  params: string
  mem: string
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
  </div>`)
}

const GRADE_COLOR: Record<string, string> = {
  S: C.green,
  A: C.green,
  B: '#86efac',
  C: C.amber,
  D: '#fdba74',
  F: C.red,
}

export function rigCard(opts: {
  device: string
  grade: string
  pct: number
  runnable: number
  total: number
  biggest: string
}): string {
  const col = GRADE_COLOR[opts.grade] ?? C.muted
  return shell(`
  <div style="display:flex;align-items:center;margin-top:auto;gap:48px">
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;width:240px;height:240px;border-radius:8px;background:${C.card};border:3px solid ${col}">
      <div style="display:flex;font-size:30px;color:${C.muted}">Rig Score</div>
      <div style="display:flex;font-size:150px;font-weight:700;line-height:1;color:${col}">${opts.grade}</div>
    </div>
    <div style="display:flex;flex-direction:column">
      <div style="display:flex;font-size:30px;color:${C.muted}">My rig</div>
      <div style="display:flex;font-size:56px;font-weight:700;line-height:1.1;max-width:680px">${opts.device}</div>
      <div style="display:flex;font-size:34px;margin-top:24px">Runs <span style="color:${C.brand};font-weight:700;margin:0 10px">${opts.runnable} of ${opts.total}</span> models (${opts.pct}%)</div>
      <div style="display:flex;font-size:28px;color:${C.muted};margin-top:10px">Biggest it can run: ${opts.biggest}</div>
    </div>
  </div>`)
}

function pill(text: string): string {
  return `<div style="display:flex;align-items:center;padding:10px 20px;border-radius:4px;background:${C.card};border:1px solid ${C.border};font-size:26px;color:${C.text}">${text}</div>`
}
