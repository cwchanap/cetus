import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

// --- Activity Graph Utilities ---

export type ActivityDayCell = {
    date: Date
    dateStr: string
    count: number // -1 for padding days outside the target year
    month: number // 0..11
}

export function utcDateStr(d: Date): string {
    const y = d.getUTCFullYear()
    const m = String(d.getUTCMonth() + 1).padStart(2, '0')
    const day = String(d.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
}

/**
 * Build weeks grid (Sun-Sat) covering the whole year, padded to full weeks.
 * dailyCounts map keys must be in UTC 'YYYY-MM-DD'.
 */
export function buildContributionWeeks(
    year: number,
    dailyCounts: Map<string, number>
): { weeks: ActivityDayCell[][]; calendarStart: Date; calendarEnd: Date } {
    const firstDay = new Date(Date.UTC(year, 0, 1))
    const lastDay = new Date(Date.UTC(year + 1, 0, 0)) // Dec 31

    // Start from Sunday on or before Jan 1
    const calendarStart = new Date(firstDay)
    calendarStart.setUTCDate(firstDay.getUTCDate() - firstDay.getUTCDay())

    // End on Saturday on or after Dec 31
    const calendarEnd = new Date(lastDay)
    calendarEnd.setUTCDate(lastDay.getUTCDate() + (6 - lastDay.getUTCDay()))

    const weeks: ActivityDayCell[][] = []
    const d = new Date(calendarStart)
    while (d <= calendarEnd) {
        const week: ActivityDayCell[] = []
        for (let i = 0; i < 7; i++) {
            const inYear = d >= firstDay && d <= lastDay
            const dateStr = utcDateStr(d)
            const count = inYear ? (dailyCounts.get(dateStr) ?? 0) : -1
            week.push({
                date: new Date(d),
                dateStr,
                count,
                month: d.getUTCMonth(),
            })
            d.setUTCDate(d.getUTCDate() + 1)
        }
        weeks.push(week)
    }

    return { weeks, calendarStart, calendarEnd }
}
