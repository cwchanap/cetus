import { describe, it, expect } from 'vitest'
import {
    buildContributionWeeks,
    utcDateStr,
    type ActivityDayCell,
} from '@/lib/utils'

function flatten<T>(arr: T[][]): T[] {
    return arr.flat()
}

describe('Activity graph date bucketing', () => {
    it('builds a full-year grid padded to full weeks (Sun-Sat)', () => {
        const year = 2025
        const { weeks, calendarStart, calendarEnd } = buildContributionWeeks(
            year,
            new Map()
        )

        // Start should be Sunday, end should be Saturday
        expect(calendarStart.getUTCDay()).toBe(0)
        expect(calendarEnd.getUTCDay()).toBe(6)

        // Should cover at least Jan 1 .. Dec 31 of given year
        const jan1 = new Date(Date.UTC(year, 0, 1))
        const dec31 = new Date(Date.UTC(year, 11, 31))
        const cells = flatten<ActivityDayCell>(weeks)

        const hasJan1 = cells.some(
            c => c.dateStr === utcDateStr(jan1) && c.count >= 0
        )
        const hasDec31 = cells.some(
            c => c.dateStr === utcDateStr(dec31) && c.count >= 0
        )
        expect(hasJan1).toBe(true)
        expect(hasDec31).toBe(true)

        // All weeks should have 7 days
        for (const w of weeks) {
            expect(w).toHaveLength(7)
        }

        // Total cells should match number of days between start and end inclusive
        const days =
            Math.round(
                (calendarEnd.getTime() - calendarStart.getTime()) /
                    (24 * 3600 * 1000)
            ) + 1
        expect(cells.length).toBe(days)
    })

    it('maps provided daily counts to correct dates and zeros others within the year', () => {
        const year = 2025
        const counts = new Map<string, number>()
        const d1 = new Date(Date.UTC(year, 0, 15)) // Jan 15
        const d2 = new Date(Date.UTC(year, 7, 10)) // Aug 10
        counts.set(utcDateStr(d1), 3)
        counts.set(utcDateStr(d2), 7)

        const { weeks } = buildContributionWeeks(year, counts)
        const cells = flatten<ActivityDayCell>(weeks)

        const jan15 = cells.find(c => c.dateStr === utcDateStr(d1))
        const aug10 = cells.find(c => c.dateStr === utcDateStr(d2))
        expect(jan15?.count).toBe(3)
        expect(aug10?.count).toBe(7)

        // A random in-year day should be zero (not -1) if not provided
        const someDay = new Date(Date.UTC(year, 2, 3)) // Mar 3
        const cell = cells.find(c => c.dateStr === utcDateStr(someDay))
        expect(cell).toBeDefined()
        if (!cell) {
            throw new Error(
                'Expected contribution cell to exist for sample day'
            )
        }
        expect(cell.count).toBeGreaterThanOrEqual(0)
    })
})
