import { describe, it, expect } from 'vitest'
import { cn } from '@/lib/utils'

describe('cn', () => {
    it('merges class names', () => {
        expect(cn('foo', 'bar')).toBe('foo bar')
    })

    it('handles conditional classes', () => {
        const shouldSkipClass = false
        expect(cn('base', shouldSkipClass && 'skip', 'end')).toBe('base end')
    })
})
