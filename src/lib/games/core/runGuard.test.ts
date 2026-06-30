import { describe, it, expect } from 'vitest'
import { createRunGuard } from './runGuard'

describe('createRunGuard', () => {
    it('next() returns an incrementing run id starting at 1', () => {
        const g = createRunGuard()
        expect(g.next()).toBe(1)
        expect(g.next()).toBe(2)
    })

    it('isStale() is false for the current run and true after next()', () => {
        const g = createRunGuard()
        const run = g.next()
        expect(g.isStale(run)).toBe(false)
        g.next()
        expect(g.isStale(run)).toBe(true)
    })

    it('current() reflects the latest run id', () => {
        const g = createRunGuard()
        expect(g.current()).toBe(0)
        g.next()
        expect(g.current()).toBe(1)
    })

    it('independent guards do not share state', () => {
        const a = createRunGuard()
        const b = createRunGuard()
        a.next()
        expect(a.current()).toBe(1)
        b.next()
        b.next()
        expect(b.current()).toBe(2)
        expect(a.current()).toBe(1)
    })
})
