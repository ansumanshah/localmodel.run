import { describe, expect, test } from 'bun:test'

import {
  badgeContent,
  badgeSvg,
  browserBadgeContent,
  browserBadgeWeight,
  BADGE_COLOR,
  BROWSER_BADGE_HEAVY_MIN_BYTES,
  BROWSER_BADGE_SMALL_MAX_BYTES,
} from './badge'
import { browserModels, formatBytes } from './data'
import type { RunResult } from './compute'
import type { BrowserModelRow } from '@/data/types'

// The /badge/[model]/[device].svg output is embedded in third-party HuggingFace
// and GitHub READMEs. A regression here (unescaped XML, wrong verdict colour,
// clipped text) breaks every embedded badge silently, with zero signal on our
// own pages, so the SVG contract is locked below.

// Only `verdict` and `estimate.totalGb` feed the badge; the rest is filler to
// satisfy the RunResult shape.
function run(verdict: RunResult['verdict'], totalGb: number | null): RunResult {
  return {
    verdict,
    quant: null,
    estimate: totalGb == null ? null : ({ totalGb } as RunResult['estimate']),
    upgradeQuant: null,
    usableGb: 0,
    headroomGb: 0,
    speed: 'unknown' as RunResult['speed'],
    reason: '',
  }
}

// Any ampersand that is NOT the start of a valid XML entity would break the SVG.
const UNESCAPED_AMP = /&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/

describe('badgeSvg', () => {
  const svg = badgeSvg('Runs on M4', 'runs · 5.2 GB', BADGE_COLOR.yes)

  test('is a self-contained SVG document with the right dimensions', () => {
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true)
    // Two-segment flat badge is always 20px tall.
    expect(svg).toContain('height="20"')
    // Overall width is the sum of the two segment widths.
    const total = Number(svg.match(/^<svg[^>]*\swidth="(\d+)"/)![1])
    const label = Number(svg.match(/<rect width="(\d+)" height="20" fill="#3b3f4a"\/>/)![1])
    const value = Number(svg.match(/<rect x="\d+" width="(\d+)" height="20"/)![1])
    expect(total).toBe(label + value)
    expect(total).toBeGreaterThan(0)
  })

  test('carries the value colour and an accessible label', () => {
    expect(svg).toContain(`fill="${BADGE_COLOR.yes}"`)
    expect(svg).toContain('role="img"')
    expect(svg).toContain('aria-label="Runs on M4: runs · 5.2 GB"')
    expect(svg).toContain('<title>Runs on M4: runs · 5.2 GB</title>')
  })

  test('escapes XML-special characters so a name with & or < cannot break the badge', () => {
    const dirty = badgeSvg('A & B', 'needs <"x"> GB', BADGE_COLOR.no)
    expect(dirty).not.toMatch(UNESCAPED_AMP)
    expect(dirty).not.toContain('<"x">')
    expect(dirty).toContain('A &amp; B')
    expect(dirty).toContain('&lt;')
    expect(dirty).toContain('&quot;')
    // The raw, unescaped forms must never survive into the output.
    expect(dirty).not.toContain('A & B</text>')
  })

  test('a clean badge contains no stray unescaped ampersands', () => {
    expect(svg).not.toMatch(UNESCAPED_AMP)
  })

  test('wider text yields a wider badge (segments scale with content)', () => {
    const narrow = badgeSvg('x', 'y', BADGE_COLOR.yes)
    const wide = badgeSvg('a much longer label here', 'y', BADGE_COLOR.yes)
    const w = (s: string) => Number(s.match(/^<svg[^>]*\swidth="(\d+)"/)![1])
    expect(w(wide)).toBeGreaterThan(w(narrow))
  })
})

describe('badgeContent', () => {
  test('each verdict maps to its own colour and phrasing', () => {
    const yes = badgeContent(run('yes', 5.2))
    expect(yes.color).toBe(BADGE_COLOR.yes)
    expect(yes.value).toContain('runs')
    expect(yes.value).toContain('5.2 GB')

    const tight = badgeContent(run('tight', 7.8))
    expect(tight.color).toBe(BADGE_COLOR.tight)
    expect(tight.value).toContain('tight')
    expect(tight.value).toContain('7.8 GB')

    const no = badgeContent(run('no', 42))
    expect(no.color).toBe(BADGE_COLOR.no)
    expect(no.value).toContain('needs')
    expect(no.value).toContain('42 GB')
  })

  test('a missing estimate degrades to 0 GB instead of NaN or a crash', () => {
    const r = badgeContent(run('no', null))
    expect(r.value).toContain('0 GB')
    expect(r.value).not.toContain('NaN')
    expect(r.color).toBe(BADGE_COLOR.no)
  })

  test('the three verdict colours are distinct valid hex', () => {
    const hexes = [BADGE_COLOR.yes, BADGE_COLOR.tight, BADGE_COLOR.no]
    for (const h of hexes) expect(h).toMatch(/^#[0-9a-f]{6}$/i)
    expect(new Set(hexes).size).toBe(3)
  })

  test('badgeContent feeds badgeSvg without producing unescaped output', () => {
    for (const v of ['yes', 'tight', 'no'] as const) {
      const { value, color } = badgeContent(run(v, 12.3))
      expect(badgeSvg('Runs on device', value, color)).not.toMatch(UNESCAPED_AMP)
    }
  })
})

// /badge/browser/<model>/size.svg: the browser-catalog badge. Only
// `headline.webgpu.bytes` feeds it; the rest is filler to satisfy the
// BrowserModelRow shape.
const MB = 1024 * 1024
function browserModel(over: Partial<BrowserModelRow> = {}): BrowserModelRow {
  return {
    id: 't',
    name: 'T',
    hf_repo: 'onnx-community/t',
    task: 'vision',
    params_m: 100,
    headline: {
      webgpu: { variant: 'fp16', bytes: 100 * MB },
      wasm: { variant: 'uint8', bytes: 50 * MB },
    },
    variants: { fp16: 100 * MB, uint8: 50 * MB },
    pipeline_task: null,
    sources: [],
    ...over,
  }
}

describe('browserBadgeContent', () => {
  test('the value is exactly formatBytes() of the WebGPU headline, never a hand-rolled string', () => {
    for (const bytes of [2_929_425, 50 * MB, 150 * MB, 1024 * MB, 4_366_542_985]) {
      const m = browserModel({ headline: { webgpu: { variant: 'q4f16', bytes }, wasm: { variant: 'q8', bytes } } })
      expect(browserBadgeContent(m).value).toBe(formatBytes(bytes))
    }
  })

  test('every real browser model in the catalog produces a badge', () => {
    expect(browserModels.length).toBeGreaterThan(0)
    for (const m of browserModels) {
      const { value, color } = browserBadgeContent(m)
      expect(value).toBe(formatBytes(m.headline.webgpu.bytes))
      expect(value.length).toBeGreaterThan(0)
      expect([BADGE_COLOR.yes, BADGE_COLOR.tight, BADGE_COLOR.no]).toContain(color)
      // Real catalog values (max measured is single-digit GB) must never clip
      // the Verdana-11px segWidth() heuristic: sanity-check the rendered SVG.
      const svg = badgeSvg('in browser', value, color)
      expect(svg).not.toMatch(UNESCAPED_AMP)
      const total = Number(svg.match(/^<svg[^>]*\swidth="(\d+)"/)![1])
      expect(total).toBeGreaterThan(0)
    }
  })

  // Threshold ladder, documented in badge.ts: small < 150 MB -> yes,
  // medium 150 MB-1 GB -> tight, heavy >= 1 GB -> no. Locked here so a future
  // edit to the ladder is a deliberate test change, not a silent drift.
  describe('browserBadgeWeight threshold ladder', () => {
    test('small: just under 150 MB', () => {
      expect(browserBadgeWeight(BROWSER_BADGE_SMALL_MAX_BYTES - 1)).toBe('small')
      expect(browserBadgeContent(browserModel({ headline: { webgpu: { variant: 'q4f16', bytes: 1 * MB }, wasm: { variant: 'q8', bytes: 1 * MB } } })).color).toBe(BADGE_COLOR.yes)
    })

    test('medium: at 150 MB up to just under 1 GB', () => {
      expect(browserBadgeWeight(BROWSER_BADGE_SMALL_MAX_BYTES)).toBe('medium')
      expect(browserBadgeWeight(BROWSER_BADGE_HEAVY_MIN_BYTES - 1)).toBe('medium')
      expect(browserBadgeContent(browserModel({ headline: { webgpu: { variant: 'fp16', bytes: 500 * MB }, wasm: { variant: 'q8', bytes: 200 * MB } } })).color).toBe(BADGE_COLOR.tight)
    })

    test('heavy: at 1 GB and above', () => {
      expect(browserBadgeWeight(BROWSER_BADGE_HEAVY_MIN_BYTES)).toBe('heavy')
      expect(browserBadgeContent(browserModel({ headline: { webgpu: { variant: 'q4f16', bytes: 3 * 1024 * MB }, wasm: { variant: 'q8', bytes: 1024 * MB } } })).color).toBe(BADGE_COLOR.no)
    })
  })

  test('escaping holds even if a model name or id carries XML-special characters', () => {
    // browserBadgeContent never reads model.name/id today, but the fixture
    // deliberately poisons them so this test still guards the contract if a
    // future edit starts interpolating the model into the label: the value
    // must still be a clean formatBytes() string and badgeSvg() must still
    // escape cleanly end to end.
    const dirty = browserModel({
      id: 't&<>"',
      name: 'A & B <script> "quoted"',
      headline: { webgpu: { variant: 'q4f16', bytes: 250 * MB }, wasm: { variant: 'q8', bytes: 100 * MB } },
    })
    const { value, color } = browserBadgeContent(dirty)
    expect(value).toBe(formatBytes(250 * MB))
    expect(value).not.toMatch(UNESCAPED_AMP)
    const svg = badgeSvg('in browser', value, color)
    expect(svg).not.toMatch(UNESCAPED_AMP)
    expect(svg).not.toContain('<script>')
  })

  test('the byte string always matches formatBytes exactly, MB and GB alike', () => {
    expect(browserBadgeContent(browserModel({ headline: { webgpu: { variant: 'fp16', bytes: Math.round(112.2 * MB) }, wasm: { variant: 'q8', bytes: 1 } } })).value).toBe('112.2 MB')
    expect(browserBadgeContent(browserModel({ headline: { webgpu: { variant: 'q4f16', bytes: Math.round(4.16 * 1024 * MB) }, wasm: { variant: 'q8', bytes: 1 } } })).value).toBe('4.16 GB')
  })
})
