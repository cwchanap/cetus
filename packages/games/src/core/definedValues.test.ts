import { describe, expect, it } from 'vitest'
import { definedValues } from './definedValues'

describe('definedValues', () => {
    it('drops keys explicitly set to undefined so defaults survive a spread', () => {
        const defaults = { duration: 60, label: 'x' }
        const merged = {
            ...defaults,
            ...definedValues({ duration: undefined, label: undefined }),
        }

        expect(merged).toEqual({ duration: 60, label: 'x' })
        expect('duration' in merged).toBe(true)
    })

    it('keeps defined values including falsy ones and null', () => {
        expect(
            definedValues({ a: 0, b: false, c: null, d: '', e: undefined })
        ).toEqual({ a: 0, b: false, c: null, d: '' })
    })

    it('does not mutate the input object', () => {
        const input = { keep: 1, drop: undefined }
        definedValues(input)

        expect(input).toEqual({ keep: 1, drop: undefined })
    })
})
