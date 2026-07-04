import { describe, expect, test } from 'bun:test'

import { buildGamePool } from './game'

describe('buildGamePool', () => {
  const pool = buildGamePool()

  test('pool is big enough for years of daily sets and capped for page weight', () => {
    expect(pool.length).toBeGreaterThanOrEqual(150)
    expect(pool.length).toBeLessThanOrEqual(300)
  })

  test('deterministic for a given catalog', () => {
    expect(buildGamePool()).toEqual(pool)
  })

  test('every tier is represented so daily sets can mix difficulty', () => {
    for (const t of ['e', 'm', 'h'] as const) {
      expect(pool.filter((r) => r.t === t).length).toBeGreaterThanOrEqual(20)
    }
  })

  test('both answers are well represented', () => {
    const yes = pool.filter((r) => r.r === 1).length
    expect(yes).toBeGreaterThanOrEqual(pool.length * 0.25)
    expect(pool.length - yes).toBeGreaterThanOrEqual(pool.length * 0.25)
  })

  test('rounds carry real, consistent engine numbers', () => {
    for (const r of pool) {
      expect(r.g).toBeGreaterThan(0)
      expect(r.u).toBeGreaterThan(0)
      expect(r.mem).toBeGreaterThan(0)
      // the answer must match the numbers shown on reveal
      expect(r.r).toBe(r.g <= r.u ? 1 : 0)
      expect(r.v === 'no' ? 0 : 1).toBe(r.r)
      expect(r.url.startsWith('/can-i-run/')).toBe(true)
    }
  })

  test('no duplicate pairs', () => {
    const keys = new Set(pool.map((r) => r.url))
    expect(keys.size).toBe(pool.length)
  })

  test('no blowout trivia (ratio bounded)', () => {
    for (const r of pool) {
      const ratio = r.g / r.u
      expect(ratio).toBeGreaterThanOrEqual(0.02)
      expect(ratio).toBeLessThanOrEqual(20)
    }
  })

  test('copy rules: no em-dashes in any generated text', () => {
    for (const r of pool) {
      expect(`${r.m}${r.d}${r.n ?? ''}`).not.toContain('—')
    }
  })
})
