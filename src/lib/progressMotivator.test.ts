import { describe, expect, it } from 'vitest'
import { buildProgressMotivator } from './progressMotivator'

describe('buildProgressMotivator', () => {
  it('returns null without weights', () => {
    expect(buildProgressMotivator({ weights: [] })).toBeNull()
  })

  it('celebrates first weigh-in', () => {
    const m = buildProgressMotivator({
      weights: [{ id: '1', date: '2026-07-30', kg: 70, createdAt: 1 }],
      today: '2026-07-30',
    })
    expect(m?.text).toMatch(/Точка отсчёта/)
  })

  it('treats sharp overnight jump as water, not fat', () => {
    const m = buildProgressMotivator({
      weights: [
        { id: '1', date: '2026-07-28', kg: 68, createdAt: 1 },
        { id: '2', date: '2026-07-29', kg: 67.8, createdAt: 2 },
        { id: '3', date: '2026-07-30', kg: 69.0, createdAt: 3 },
      ],
      today: '2026-07-30',
    })
    expect(m?.tone).toBe('soft')
    expect(m?.text).toMatch(/не жир|вода|тренд/i)
    expect(m?.deltaLabel).toMatch(/\+1,2/)
  })

  it('encourages on a clear drop with overall progress', () => {
    const m = buildProgressMotivator({
      weights: [
        { id: '1', date: '2026-07-01', kg: 72, createdAt: 1 },
        { id: '2', date: '2026-07-29', kg: 70.2, createdAt: 2 },
        { id: '3', date: '2026-07-30', kg: 69.7, createdAt: 3 },
      ],
      today: '2026-07-30',
    })
    expect(m?.tone).toBe('down')
    expect(m?.text).toMatch(/Минус|вниз|двигаетесь/i)
  })

  it('keeps overall progress in mind on a mild up day', () => {
    const m = buildProgressMotivator({
      weights: [
        { id: '1', date: '2026-07-01', kg: 72, createdAt: 1 },
        { id: '2', date: '2026-07-29', kg: 70.0, createdAt: 2 },
        { id: '3', date: '2026-07-30', kg: 70.3, createdAt: 3 },
      ],
      today: '2026-07-30',
    })
    expect(m?.text).toMatch(/общий путь|не отменяет/i)
  })
})
