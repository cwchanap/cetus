import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSeededRng, hashString32, hashString32Hex } from './seeded-rng'

describe('seeded RNG hashing and stream', () => {
    it('locks the FNV-1a seed hash', () => {
        expect(hashString32('ice-slide:test')).toBe(2769670846)
        expect(hashString32Hex('ice-slide:test')).toBe('a515d2be')
    })

    it('maps the seed hash directly into the Mulberry32 state', () => {
        const rng = createSeededRng('ice-slide:test')
        expect([
            rng.nextUint32(),
            rng.nextUint32(),
            rng.nextUint32(),
            rng.nextUint32(),
            rng.nextUint32(),
        ]).toEqual([1843037723, 574486829, 1018436590, 1120027984, 770965377])
    })
})

describe('seeded RNG bounded selection', () => {
    it('returns zero for a unit bound from a fresh stream', () => {
        expect(createSeededRng('ice-slide:test').nextInt(1)).toBe(0)
    })

    it('locks five nextInt(7) draws from a separate fresh stream', () => {
        const rng = createSeededRng('ice-slide:test')
        expect([
            rng.nextInt(7),
            rng.nextInt(7),
            rng.nextInt(7),
            rng.nextInt(7),
            rng.nextInt(7),
        ]).toEqual([2, 0, 3, 5, 0])
    })

    it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 0x80000000])(
        'rejects invalid maxExclusive %s',
        maxExclusive => {
            expect(() =>
                createSeededRng('ice-slide:test').nextInt(maxExclusive)
            ).toThrow(RangeError)
        }
    )

    it('accepts the signed 32-bit upper bound', () => {
        const value = createSeededRng('ice-slide:test').nextInt(0x7fffffff)
        expect(value).toBeGreaterThanOrEqual(0)
        expect(value).toBeLessThan(0x7fffffff)
    })
})

describe('seeded RNG collection helpers', () => {
    it('pick consumes one bounded draw', () => {
        expect(
            createSeededRng('ice-slide:test').pick(['A', 'B', 'C', 'D', 'E'])
        ).toBe('D')
    })

    it('pick rejects an empty collection', () => {
        expect(() => createSeededRng('ice-slide:test').pick([])).toThrow(
            RangeError
        )
    })

    it('pick still consumes a draw for one item', () => {
        const rng = createSeededRng('ice-slide:test')
        expect(rng.pick(['only'])).toBe('only')
        expect(rng.nextUint32()).toBe(574486829)
    })

    it('uses descending Fisher-Yates without mutating input', () => {
        const input = ['A', 'B', 'C', 'D', 'E'] as const
        const shuffled = createSeededRng('ice-slide:test').shuffle(input)

        expect(shuffled).toEqual(['C', 'A', 'E', 'B', 'D'])
        expect(input).toEqual(['A', 'B', 'C', 'D', 'E'])
    })
})

describe('seeded RNG labeled forks', () => {
    it('derives forks from immutable paths, not draw position', () => {
        const parent = createSeededRng('ice-slide:test')
        const before = parent.fork('stage:1')
        parent.nextUint32()
        parent.nextUint32()
        const after = parent.fork('stage:1')

        expect(before.nextUint32()).toBe(694760629)
        expect(after.nextUint32()).toBe(694760629)
        expect(
            createSeededRng('ice-slide:test').fork('stage:2').nextUint32()
        ).toBe(2216382472)
    })

    it('keeps nested fork paths and instances independent', () => {
        const parent = createSeededRng('ice-slide:test')
        const first = parent.fork('stage').fork('objective')
        const second = parent.fork('stage').fork('objective')

        expect(first.nextUint32()).toBe(second.nextUint32())
        first.nextUint32()
        expect(first.nextUint32()).not.toBe(second.nextUint32())
    })

    it.each(['', 'a\u001fb'])('rejects invalid seed key %j', seed => {
        expect(() => createSeededRng(seed)).toThrow(RangeError)
    })

    it.each(['', 'a\u001fb'])('rejects invalid fork label %j', label => {
        expect(() => createSeededRng('ice-slide:test').fork(label)).toThrow(
            RangeError
        )
    })
})

afterEach(() => {
    vi.restoreAllMocks()
})

it('never calls Math.random', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockImplementation(() => {
        throw new Error('Math.random must not be called')
    })

    const rng = createSeededRng('ice-slide:test')
    rng.nextUint32()
    rng.nextFloat()
    rng.nextInt(7)
    rng.pick(['A', 'B'])
    rng.shuffle(['A', 'B', 'C'])
    rng.fork('stage').nextUint32()

    expect(randomSpy).not.toHaveBeenCalled()
})
