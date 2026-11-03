import { describe, expect, it } from 'vitest'
import { dayKey, endOfStudyDay, startOfStudyDay } from '../src'

const at = (y: number, m: number, d: number, h: number) => new Date(y, m - 1, d, h).getTime()

describe('study day', () => {
  it('rolls over at 4am local time', () => {
    expect(startOfStudyDay(at(2026, 3, 10, 10))).toBe(at(2026, 3, 10, 4))
    expect(startOfStudyDay(at(2026, 3, 10, 2))).toBe(at(2026, 3, 9, 4))
    expect(endOfStudyDay(at(2026, 3, 10, 10))).toBe(at(2026, 3, 11, 4))
    expect(dayKey(at(2026, 3, 10, 3))).toBe('2026-03-09')
    expect(dayKey(at(2026, 12, 31, 23))).toBe('2026-12-31')
    expect(startOfStudyDay()).toBeLessThanOrEqual(Date.now())
  })
})
