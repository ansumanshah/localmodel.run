import { describe, expect, test } from 'bun:test'

import { badgeContent, badgeSvg, BADGE_COLOR } from './badge'
import type { RunResult } from './compute'

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
