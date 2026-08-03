const FORK_SEPARATOR = '\u001f'
const UINT32_RANGE = 0x1_0000_0000
const MAX_INT_BOUND = 0x7fffffff

export interface SeededRng {
    nextUint32(): number
    nextFloat(): number
    nextInt(maxExclusive: number): number
    pick<T>(items: readonly T[]): T
    shuffle<T>(items: readonly T[]): T[]
    fork(label: string): SeededRng
}

// FNV-1a 32-bit hash. 0x811c9dc5 is the FNV-1a offset basis and 0x01000193 is
// the FNV prime; the unsigned shift normalizes the result to [0, 2^32). This
// deterministic hash is the contract used by hashString32Hex.
export function hashString32(value: string): number {
    let hash = 0x811c9dc5
    for (let index = 0; index < value.length; index++) {
        hash ^= value.charCodeAt(index)
        hash = Math.imul(hash, 0x01000193)
    }
    return hash >>> 0
}

export function hashString32Hex(value: string): string {
    return hashString32(value).toString(16).padStart(8, '0')
}

function assertSeedSegment(value: string, field: string): void {
    if (value.length === 0 || value.includes(FORK_SEPARATOR)) {
        throw new RangeError(
            `${field} must be non-empty and must not contain U+001F`
        )
    }
}

// Mulberry32 PRNG. The state transition adds the constant 0x6d2b79f5 before
// the bit-mixing steps; the unsigned shift keeps state in [0, 2^32).
function createSeededRngFromPath(seedPath: string): SeededRng {
    let state = hashString32(seedPath)

    const nextUint32 = (): number => {
        state = (state + 0x6d2b79f5) >>> 0
        let value = state
        value = Math.imul(value ^ (value >>> 15), value | 1)
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
        return (value ^ (value >>> 14)) >>> 0
    }

    const nextFloat = (): number => nextUint32() / UINT32_RANGE

    const nextInt = (maxExclusive: number): number => {
        if (
            !Number.isInteger(maxExclusive) ||
            maxExclusive < 1 ||
            maxExclusive > MAX_INT_BOUND
        ) {
            throw new RangeError(
                'maxExclusive must be an integer from 1 through 2147483647'
            )
        }

        // Rejection sampling to remove modulo bias: `limit` is the largest
        // multiple of maxExclusive not exceeding 2^32, so any draw >= limit
        // is discarded and redrawn rather than reduced via the modulo.
        const limit = Math.floor(UINT32_RANGE / maxExclusive) * maxExclusive
        let value: number
        do {
            value = nextUint32()
        } while (value >= limit)

        return value % maxExclusive
    }

    const pick = <T>(items: readonly T[]): T => {
        if (items.length === 0) {
            throw new RangeError('pick requires at least one item')
        }
        return items[nextInt(items.length)]
    }

    const shuffle = <T>(items: readonly T[]): T[] => {
        const result = [...items]
        for (let index = result.length - 1; index > 0; index--) {
            const swapIndex = nextInt(index + 1)
            ;[result[index], result[swapIndex]] = [
                result[swapIndex],
                result[index],
            ]
        }
        return result
    }

    const fork = (label: string): SeededRng => {
        assertSeedSegment(label, 'label')
        return createSeededRngFromPath(`${seedPath}${FORK_SEPARATOR}${label}`)
    }

    return {
        nextUint32,
        nextFloat,
        nextInt,
        pick,
        shuffle,
        fork,
    }
}

export function createSeededRng(seedKey: string): SeededRng {
    assertSeedSegment(seedKey, 'seedKey')
    return createSeededRngFromPath(seedKey)
}
