import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadCareChecks, toggleCareCheck } from './careChecks'

const KEY = 'planer-care-checks-v1'
const store = new Map<string, string>()

describe('careChecks', () => {
  beforeEach(() => {
    store.clear()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v)
      },
      removeItem: (k: string) => {
        store.delete(k)
      },
      clear: () => {
        store.clear()
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('toggles morning and evening steps per date', () => {
    const date = '2026-07-30'
    expect(loadCareChecks(date)).toEqual({ morning: [], evening: [] })

    let next = toggleCareCheck('morning', 'm1', date)
    expect(next.morning).toEqual(['m1'])
    expect(next.evening).toEqual([])

    next = toggleCareCheck('evening', 'e-ha', date)
    expect(next.morning).toEqual(['m1'])
    expect(next.evening).toEqual(['e-ha'])

    next = toggleCareCheck('morning', 'm1', date)
    expect(next.morning).toEqual([])
    expect(loadCareChecks(date).evening).toEqual(['e-ha'])
    expect(store.get(KEY)).toContain('e-ha')
  })
})
