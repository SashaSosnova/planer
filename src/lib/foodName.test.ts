import { describe, expect, it } from 'vitest'
import { capitalizeFoodName, sameFoodLabel } from './foodName'

describe('foodName', () => {
  it('capitalizes first letter', () => {
    expect(capitalizeFoodName('креветки отварные')).toBe('Креветки отварные')
    expect(capitalizeFoodName('  коул слоу ')).toBe('Коул слоу')
  })

  it('treats case-only differences as the same label', () => {
    expect(sameFoodLabel('креветки отварные', 'Креветки отварные')).toBe(true)
    expect(sameFoodLabel('креветки', 'кальмары')).toBe(false)
  })
})
