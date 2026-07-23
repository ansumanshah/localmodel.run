import { describe, expect, test } from 'bun:test'

import type { ModelRow } from '@/data/types'
import { models } from '@/lib/data'
import { USE_CASES, USE_CASE_META, useCasesFor, type UseCase } from '@/lib/usecases'

// useCasesFor reads only id, name, family and subtype, so a partial row is enough
// to exercise the pure classification logic without a full catalog fixture.
const mk = (id: string, subtype: ModelRow['subtype'] = null, name = '', family = ''): ModelRow =>
  ({ id, name, family, subtype }) as ModelRow

describe('useCasesFor — classification logic', () => {
  test('subtype wins: coder → coding, vlm → vision', () => {
    expect(useCasesFor(mk('x', 'coder'))).toEqual(['coding'])
    expect(useCasesFor(mk('x', 'vlm'))).toEqual(['vision'])
  })

  test('naming derives the tag when subtype is absent', () => {
    expect(useCasesFor(mk('qwen3-coder-30b'))).toContain('coding')
    expect(useCasesFor(mk('deepseek-r1'))).toContain('reasoning')
    expect(useCasesFor(mk('magistral-24b'))).toContain('reasoning')
    expect(useCasesFor(mk('qwen2.5-vl-7b'))).toContain('vision')
    expect(useCasesFor(mk('exaone-4'))).toContain('multilingual')
  })

  // The word-boundary guards are the fragile part: a naive /code/, /vl/ or /r1/
  // would false-positive on these and pollute every /best-for/ page.
  test('word-boundary guards do not false-positive on substrings', () => {
    expect(useCasesFor(mk('decode-test'))).not.toContain('coding')
    expect(useCasesFor(mk('vllm-runtime'))).not.toContain('vision')
    expect(useCasesFor(mk('star1-model'))).not.toContain('reasoning')
  })

  test('a plain chat model gets no task tag', () => {
    expect(useCasesFor(mk('llama-3.1-8b', null, 'Llama 3.1 8B', 'llama'))).toEqual([])
  })
})

describe('useCasesFor — output shape (every catalog row)', () => {
  test('only ever returns valid, de-duplicated tags in canonical order', () => {
    for (const m of models) {
      const tags = useCasesFor(m)
      expect(new Set(tags).size).toBe(tags.length) // no duplicates
      for (const t of tags) expect(USE_CASES).toContain(t)
      // canonical order matches the USE_CASES declaration order
      const ordered = USE_CASES.filter((u) => tags.includes(u))
      expect(tags).toEqual(ordered)
    }
  })
})

describe('best-for page guardrails', () => {
  const count = (uc: UseCase) => models.filter((m) => useCasesFor(m).includes(uc)).length

  // /best-for/[task] only renders a task with >= 5 tagged models. Coding and
  // reasoning are the anchor task pages; lock that a data refresh cannot silently
  // empty them below the render threshold.
  test('coding and reasoning stay above the render threshold', () => {
    expect(count('coding')).toBeGreaterThanOrEqual(5)
    expect(count('reasoning')).toBeGreaterThanOrEqual(5)
  })
})

describe('USE_CASE_META', () => {
  test('every use case has complete, slop-free copy', () => {
    expect(Object.keys(USE_CASE_META).sort()).toEqual([...USE_CASES].sort())
    for (const uc of USE_CASES) {
      const meta = USE_CASE_META[uc]
      for (const field of [meta.label, meta.title, meta.blurb, meta.opener]) {
        expect(field.length).toBeGreaterThan(0)
        expect(field).not.toContain('—') // no em-dashes in site copy
      }
    }
  })
})
