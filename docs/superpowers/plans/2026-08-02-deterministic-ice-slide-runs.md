# Deterministic Ice Slide Runs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic RNG and board-transform foundations, materialize the fixed Ice Slide Campaign as a versioned run, and refactor `IceSlideGame` to consume explicit run definitions without changing current Campaign behavior.

**Architecture:** Deterministic randomness lives in a dependency-free shared module. Ice Slide transforms, canonicalization, signatures, run validation, and Campaign materialization remain pure and separate from gameplay. `IceSlideGame` owns a defensive active-run snapshot and uses final stage rows only; `init.ts` continues to call the no-argument Campaign path.

**Tech Stack:** TypeScript 6, Vitest 3, Astro 5, Bun 1.3.1, PixiJS 8.

## Global Constraints

- Follow the approved design in `docs/superpowers/specs/2026-08-02-deterministic-ice-slide-runs-design.md`.
- Keep this implementation as four logical commits in the order defined by the tasks below.
- `IceSlideGame.start()` with no argument must preserve the current eight-stage Campaign.
- Do not modify `src/lib/challenges.ts`; the platform Daily Challenge rotation must remain byte-for-byte behavior-compatible.
- Do not modify `src/lib/games/ice-slide/levels.ts`, `scoring.ts`, `init.ts`, or `renderer.ts`.
- Do not modify `src/lib/games/shared/types.ts` or `src/lib/achievements.ts`; HPA-487 owns generated-run error-boundary and achievement-mode gates.
- Do not add production dependencies.
- RNG, transforms, signatures, run validation, and Campaign materialization must have no DOM, Pixi, database, network, storage, or current-date dependency.
- No new generator code may call `Math.random()`.
- `ICE_SLIDE_RUN_SCHEMA_VERSION` is `1`.
- Use a Campaign-specific generator constant: `ICE_SLIDE_CAMPAIGN_GENERATOR_VERSION = 1`.
- `ICE_SLIDE_RULESET_VERSION` is `1`.
- `CAMPAIGN_RUN_KEY` is derived from those constants and initially equals `ice-slide:campaign:g1:r1`.
- Public RNG seed keys and fork labels reject the reserved U+001F separator.
- `nextInt()` accepts integer bounds from `1` through `2^31 - 1` and must not bitwise-coerce its rejection limit.
- `shuffle()` uses descending Fisher–Yates with one `nextInt(index + 1)` draw per iteration.
- Board transforms support rectangular inputs; quarter turns and diagonal reflections swap dimensions.
- Canonical board equality uses the complete serialized rows, never a compact hash alone.
- Stage signature format is `is1-<8 lowercase hex digits>` and uses the exact preimage from the design.
- Structural run validation is not solver validation; HPA-486 owns solvability and quality checks.
- HPA-485 initializes and preserves `starsEarned`, `falls`, and `resets` as zero; HPA-487 owns their runtime semantics.
- Current Campaign game data remains transient because unscoped score submissions do not persist `gameDataJson`.
- Historical contextual game-data readers must tolerate the new fields being absent.
- Every task follows red-green TDD and ends with a focused commit.

---

## File Map

### Create

- `src/lib/games/shared/seeded-rng.ts` — stable FNV-1a hashing, Mulberry32 stream, bounded selection, pick, shuffle, and labeled forks.
- `src/lib/games/shared/seeded-rng.test.ts` — locked vectors and public-contract tests.
- `src/lib/games/ice-slide/transforms.ts` — eight transforms, coordinate transforms, canonical serialization/hash, and symmetry deduplication.
- `src/lib/games/ice-slide/transforms.test.ts` — rectangular geometry, inverse, serialization, and dedup tests.
- `src/lib/games/ice-slide/run.ts` — versions, run-key rules, signatures, structural validation/cloning, and Campaign materialization.
- `src/lib/games/ice-slide/run.test.ts` — Campaign compatibility, golden signatures, run-key relationships, validation, and cloning.
- `src/lib/games/ice-slide/test-fixtures.ts` — test-only explicit run/stage builders.

### Modify

- `src/lib/games/ice-slide/types.ts` — additive mode/run/stage/objective/transform/state/game-data contracts.
- `src/lib/games/ice-slide/physics.ts` — parse a minimal grid-source shape with string or numeric IDs.
- `src/lib/games/ice-slide/physics.test.ts` — stage-shaped parse coverage while preserving existing parser/solver assertions.
- `src/lib/games/ice-slide/game.ts` — active materialized run, default Campaign adapter, defensive start, metadata-preserving stage loading.
- `src/lib/games/ice-slide/game.test.ts` — default/explicit starts, idle metadata, mutation isolation, and invalid-run behavior.
- `src/lib/games/ice-slide/game.win.test.ts` — remove `./levels` mock; use explicit one-stage run.
- `src/lib/games/ice-slide/game.hazard.test.ts` — remove `./levels` mock; use explicit hazard run.
- `src/lib/games/ice-slide/game.crystal-farm.test.ts` — remove `./levels` mock; use explicit crystal fixture.
- `src/lib/games/ice-slide/game.crystal-hazard-farm.test.ts` — remove `./levels` mock; use explicit fixture.
- `src/lib/games/ice-slide/renderer.test.ts` — add required Campaign metadata to the typed `makeState()` fixture.

### Explicitly Unchanged

- `src/lib/challenges.ts`
- `src/lib/games/ice-slide/levels.ts`
- `src/lib/games/ice-slide/scoring.ts`
- `src/lib/games/ice-slide/init.ts`
- `src/lib/games/ice-slide/renderer.ts`
- `src/lib/games/shared/types.ts`
- `src/lib/achievements.ts`
- database, API, score-context, and score-submission modules

---

### Task 1: Add the deterministic shared RNG

**Files:**
- Create: `src/lib/games/shared/seeded-rng.ts`
- Create: `src/lib/games/shared/seeded-rng.test.ts`

**Interfaces:**
- Consumes: no project modules.
- Produces:

```ts
export interface SeededRng {
    nextUint32(): number
    nextFloat(): number
    nextInt(maxExclusive: number): number
    pick<T>(items: readonly T[]): T
    shuffle<T>(items: readonly T[]): T[]
    fork(label: string): SeededRng
}

export function hashString32(value: string): number
export function hashString32Hex(value: string): string
export function createSeededRng(seedKey: string): SeededRng
```

- [ ] **Step 1: Write the hash and Mulberry32 golden-vector tests**

Create `src/lib/games/shared/seeded-rng.test.ts` with these first tests:

```ts
import { describe, expect, it } from 'vitest'
import {
    createSeededRng,
    hashString32,
    hashString32Hex,
} from './seeded-rng'

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
        ]).toEqual([
            1843037723,
            574486829,
            1018436590,
            1120027984,
            770965377,
        ])
    })
})
```

- [ ] **Step 2: Run the focused test and confirm module resolution fails**

Run:

```bash
bunx vitest run src/lib/games/shared/seeded-rng.test.ts
```

Expected: FAIL because `./seeded-rng` does not exist.

- [ ] **Step 3: Implement FNV-1a and the exact Mulberry32 stream**

Create `src/lib/games/shared/seeded-rng.ts` with these foundations:

```ts
const FORK_SEPARATOR = '\u001f'
const UINT32_RANGE = 0x1_0000_0000
const MAX_INT_BOUND = 0x7fffffff

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

function createSeededRngFromPath(seedPath: string): SeededRng {
    let state = hashString32(seedPath)

    const nextUint32 = (): number => {
        state = (state + 0x6d2b79f5) >>> 0
        let value = state
        value = Math.imul(value ^ (value >>> 15), value | 1)
        value ^=
            value + Math.imul(value ^ (value >>> 7), value | 61)
        return (value ^ (value >>> 14)) >>> 0
    }

    // Remaining methods are added in the next steps.
    throw new Error('SeededRng methods not implemented')
}

export function createSeededRng(seedKey: string): SeededRng {
    assertSeedSegment(seedKey, 'seedKey')
    return createSeededRngFromPath(seedKey)
}
```

Replace the temporary throw while completing Steps 5–9; do not commit an intermediate broken implementation.

- [ ] **Step 4: Add bounded-selection tests with independent fresh streams**

Append:

```ts
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
```

- [ ] **Step 5: Implement `nextFloat()` and the exact rejection-sampled `nextInt()`**

Inside `createSeededRngFromPath`:

```ts
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

    const limit =
        Math.floor(UINT32_RANGE / maxExclusive) * maxExclusive
    let value: number
    do {
        value = nextUint32()
    } while (value >= limit)

    return value % maxExclusive
}
```

Do not apply `>>> 0`, `| 0`, or any other bitwise operation to `UINT32_RANGE`, `maxExclusive`, or `limit`.

- [ ] **Step 6: Add `pick()` and shuffle contract tests**

Append:

```ts
describe('seeded RNG collection helpers', () => {
    it('pick consumes one bounded draw', () => {
        expect(
            createSeededRng('ice-slide:test').pick([
                'A',
                'B',
                'C',
                'D',
                'E',
            ])
        ).toBe('D')
    })

    it('pick rejects an empty collection', () => {
        expect(() =>
            createSeededRng('ice-slide:test').pick([])
        ).toThrow(RangeError)
    })

    it('pick still consumes a draw for one item', () => {
        const rng = createSeededRng('ice-slide:test')
        expect(rng.pick(['only'])).toBe('only')
        expect(rng.nextUint32()).toBe(574486829)
    })

    it('uses descending Fisher-Yates without mutating input', () => {
        const input = ['A', 'B', 'C', 'D', 'E'] as const
        const shuffled =
            createSeededRng('ice-slide:test').shuffle(input)

        expect(shuffled).toEqual(['C', 'A', 'E', 'B', 'D'])
        expect(input).toEqual(['A', 'B', 'C', 'D', 'E'])
    })
})
```

The one-item assertion proves `pick(['only'])` consumed the first RNG output through `nextInt(1)`; the next raw output must therefore be the second locked stream value.

- [ ] **Step 7: Implement `pick()` and descending Fisher–Yates `shuffle()`**

```ts
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
```

- [ ] **Step 8: Add labeled-fork and input-validation tests**

Append:

```ts
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
            createSeededRng('ice-slide:test')
                .fork('stage:2')
                .nextUint32()
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
        expect(() =>
            createSeededRng('ice-slide:test').fork(label)
        ).toThrow(RangeError)
    })
})
```

- [ ] **Step 9: Implement forks and return the complete API**

Inside `createSeededRngFromPath`:

```ts
const fork = (label: string): SeededRng => {
    assertSeedSegment(label, 'label')
    return createSeededRngFromPath(
        `${seedPath}${FORK_SEPARATOR}${label}`
    )
}

return {
    nextUint32,
    nextFloat,
    nextInt,
    pick,
    shuffle,
    fork,
}
```

- [ ] **Step 10: Prove no public path calls `Math.random()`**

Append:

```ts
import { afterEach, vi } from 'vitest'

afterEach(() => {
    vi.restoreAllMocks()
})

it('never calls Math.random', () => {
    const randomSpy = vi
        .spyOn(Math, 'random')
        .mockImplementation(() => {
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
```

- [ ] **Step 11: Run the focused suite**

Run:

```bash
bunx vitest run src/lib/games/shared/seeded-rng.test.ts
```

Expected: PASS with all hash, stream, bound, pick, shuffle, fork, validation, and `Math.random()` tests green.

- [ ] **Step 12: Commit the shared RNG**

```bash
git add \
  src/lib/games/shared/seeded-rng.ts \
  src/lib/games/shared/seeded-rng.test.ts
git commit -m "feat(games): add deterministic seeded rng"
```

---

### Task 2: Add board transforms and canonical variants

**Files:**
- Modify: `src/lib/games/ice-slide/types.ts`
- Create: `src/lib/games/ice-slide/transforms.ts`
- Create: `src/lib/games/ice-slide/transforms.test.ts`

**Interfaces:**
- Consumes:
  - `hashString32Hex(value: string): string` from Task 1.
  - existing `GridPosition` from `types.ts`.
- Produces:

```ts
export type BoardTransform =
    | 'identity'
    | 'rotate_90'
    | 'rotate_180'
    | 'rotate_270'
    | 'reflect_horizontal'
    | 'reflect_vertical'
    | 'reflect_main_diagonal'
    | 'reflect_anti_diagonal'

export const BOARD_TRANSFORMS: readonly BoardTransform[]

export interface TransformedBoardVariant {
    transform: BoardTransform
    rows: string[]
    canonicalKey: string
    hash: string
}

export function transformRows(
    rows: readonly string[],
    transform: BoardTransform
): string[]

export function transformPosition(
    position: GridPosition,
    inputRows: number,
    inputCols: number,
    transform: BoardTransform
): GridPosition

export function inverseBoardTransform(
    transform: BoardTransform
): BoardTransform

export function serializeBoardRows(rows: readonly string[]): string
export function hashBoardRows(rows: readonly string[]): string
export function getUniqueBoardTransforms(
    rows: readonly string[]
): TransformedBoardVariant[]
```

- [ ] **Step 1: Add the additive transform and future run-domain types**

In `types.ts`, add:

```ts
export type IceSlideMode = 'campaign' | 'daily' | 'expedition'
export type IceSlideDifficulty =
    | 'tutorial'
    | 'easy'
    | 'medium'
    | 'hard'

export type IceSlideObjectiveId =
    | 'collect_all_crystals'
    | 'no_falls'
    | 'no_reset'

export type BoardTransform =
    | 'identity'
    | 'rotate_90'
    | 'rotate_180'
    | 'rotate_270'
    | 'reflect_horizontal'
    | 'reflect_vertical'
    | 'reflect_main_diagonal'
    | 'reflect_anti_diagonal'
```

Do not add implementation logic to `types.ts`.

- [ ] **Step 2: Write all eight rectangular row-transform tests**

Create `transforms.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
    BOARD_TRANSFORMS,
    transformRows,
} from './transforms'

describe('Ice Slide board transforms', () => {
    const rows = ['ABC', 'DEF'] as const

    it.each([
        ['identity', ['ABC', 'DEF']],
        ['rotate_90', ['DA', 'EB', 'FC']],
        ['rotate_180', ['FED', 'CBA']],
        ['rotate_270', ['CF', 'BE', 'AD']],
        ['reflect_horizontal', ['DEF', 'ABC']],
        ['reflect_vertical', ['CBA', 'FED']],
        ['reflect_main_diagonal', ['AD', 'BE', 'CF']],
        ['reflect_anti_diagonal', ['FC', 'EB', 'DA']],
    ] as const)('applies %s', (transform, expected) => {
        expect(transformRows(rows, transform)).toEqual(expected)
    })

    it('locks transform enumeration order', () => {
        expect(BOARD_TRANSFORMS).toEqual([
            'identity',
            'rotate_90',
            'rotate_180',
            'rotate_270',
            'reflect_horizontal',
            'reflect_vertical',
            'reflect_main_diagonal',
            'reflect_anti_diagonal',
        ])
    })
})
```

- [ ] **Step 3: Run the focused test and verify it fails**

```bash
bunx vitest run src/lib/games/ice-slide/transforms.test.ts
```

Expected: FAIL because `transforms.ts` does not exist.

- [ ] **Step 4: Implement shared row validation and coordinate mapping**

Create `transforms.ts` with:

```ts
import { hashString32Hex } from '../shared/seeded-rng'
import type { BoardTransform, GridPosition } from './types'

export const BOARD_TRANSFORMS: readonly BoardTransform[] = [
    'identity',
    'rotate_90',
    'rotate_180',
    'rotate_270',
    'reflect_horizontal',
    'reflect_vertical',
    'reflect_main_diagonal',
    'reflect_anti_diagonal',
]

function validateRows(rows: readonly string[]): {
    rowCount: number
    columnCount: number
} {
    if (rows.length === 0) {
        throw new RangeError('board rows must not be empty')
    }
    const columnCount = rows[0].length
    if (columnCount === 0) {
        throw new RangeError('board rows must not have zero columns')
    }
    for (const row of rows) {
        if (row.length !== columnCount) {
            throw new RangeError('board rows must be rectangular')
        }
    }
    return { rowCount: rows.length, columnCount }
}

export function transformPosition(
    position: GridPosition,
    inputRows: number,
    inputCols: number,
    transform: BoardTransform
): GridPosition {
    if (
        !Number.isInteger(inputRows) ||
        !Number.isInteger(inputCols) ||
        inputRows < 1 ||
        inputCols < 1 ||
        position.row < 0 ||
        position.row >= inputRows ||
        position.col < 0 ||
        position.col >= inputCols
    ) {
        throw new RangeError('position is outside the input board')
    }

    const { row, col } = position
    switch (transform) {
        case 'identity':
            return { row, col }
        case 'rotate_90':
            return { row: col, col: inputRows - 1 - row }
        case 'rotate_180':
            return {
                row: inputRows - 1 - row,
                col: inputCols - 1 - col,
            }
        case 'rotate_270':
            return { row: inputCols - 1 - col, col: row }
        case 'reflect_horizontal':
            return { row: inputRows - 1 - row, col }
        case 'reflect_vertical':
            return { row, col: inputCols - 1 - col }
        case 'reflect_main_diagonal':
            return { row: col, col: row }
        case 'reflect_anti_diagonal':
            return {
                row: inputCols - 1 - col,
                col: inputRows - 1 - row,
            }
    }
}
```

- [ ] **Step 5: Implement `transformRows()` through the same coordinate mapping**

```ts
function outputDimensions(
    inputRows: number,
    inputCols: number,
    transform: BoardTransform
): { rows: number; cols: number } {
    switch (transform) {
        case 'rotate_90':
        case 'rotate_270':
        case 'reflect_main_diagonal':
        case 'reflect_anti_diagonal':
            return { rows: inputCols, cols: inputRows }
        default:
            return { rows: inputRows, cols: inputCols }
    }
}

export function transformRows(
    rows: readonly string[],
    transform: BoardTransform
): string[] {
    const { rowCount, columnCount } = validateRows(rows)
    const dimensions = outputDimensions(
        rowCount,
        columnCount,
        transform
    )
    const output = Array.from(
        { length: dimensions.rows },
        () => Array<string>(dimensions.cols)
    )

    for (let row = 0; row < rowCount; row++) {
        for (let col = 0; col < columnCount; col++) {
            const target = transformPosition(
                { row, col },
                rowCount,
                columnCount,
                transform
            )
            output[target.row][target.col] = rows[row][col]
        }
    }

    return output.map(row => row.join(''))
}
```

- [ ] **Step 6: Add coordinate/glyph and inverse round-trip tests**

Append:

```ts
import {
    inverseBoardTransform,
    transformPosition,
} from './transforms'

it.each(BOARD_TRANSFORMS)(
    'keeps transformed coordinates aligned for %s',
    transform => {
        const source = ['ABC', 'DEF']
        const transformed = transformRows(source, transform)

        for (let row = 0; row < source.length; row++) {
            for (let col = 0; col < source[0].length; col++) {
                const target = transformPosition(
                    { row, col },
                    2,
                    3,
                    transform
                )
                expect(transformed[target.row][target.col]).toBe(
                    source[row][col]
                )
            }
        }
    }
)

it.each(BOARD_TRANSFORMS)(
    'round-trips rows through inverse %s',
    transform => {
        const source = ['ABC', 'DEF']
        const transformed = transformRows(source, transform)
        expect(
            transformRows(
                transformed,
                inverseBoardTransform(transform)
            )
        ).toEqual(source)
    }
)
```

- [ ] **Step 7: Implement inverse lookup**

```ts
export function inverseBoardTransform(
    transform: BoardTransform
): BoardTransform {
    switch (transform) {
        case 'rotate_90':
            return 'rotate_270'
        case 'rotate_270':
            return 'rotate_90'
        default:
            return transform
    }
}
```

- [ ] **Step 8: Add malformed canonicalization and hash tests**

Append:

```ts
import {
    hashBoardRows,
    serializeBoardRows,
} from './transforms'

it('serializes dimensions and row boundaries exactly', () => {
    expect(serializeBoardRows(['AB', 'CD'])).toBe(
        '2x2\u001fAB\u001eCD'
    )
    expect(hashBoardRows(['AB', 'CD'])).toMatch(/^[0-9a-f]{8}$/)
})

it.each([
    [] as string[],
    [''] as string[],
    ['ABC', 'DE'] as string[],
])('rejects malformed canonical rows %j', rows => {
    expect(() => serializeBoardRows(rows)).toThrow(RangeError)
    expect(() => hashBoardRows(rows)).toThrow(RangeError)
})
```

- [ ] **Step 9: Implement canonical serialization and compact hashing**

```ts
export function serializeBoardRows(
    rows: readonly string[]
): string {
    const { rowCount, columnCount } = validateRows(rows)
    return `${rowCount}x${columnCount}\u001f${rows.join('\u001e')}`
}

export function hashBoardRows(rows: readonly string[]): string {
    return hashString32Hex(serializeBoardRows(rows))
}
```

- [ ] **Step 10: Add stable symmetry-dedup tests**

Append:

```ts
import { getUniqueBoardTransforms } from './transforms'

it('deduplicates by complete canonical serialization', () => {
    const variants = getUniqueBoardTransforms([
        'AAA',
        'ABA',
        'AAA',
    ])
    expect(variants).toHaveLength(1)
    expect(variants[0].transform).toBe('identity')
})

it('retains all variants for an asymmetric rectangle', () => {
    const variants = getUniqueBoardTransforms(['ABC', 'DEF'])
    expect(variants).toHaveLength(8)
    expect(variants.map(variant => variant.transform)).toEqual(
        BOARD_TRANSFORMS
    )
    expect(
        new Set(variants.map(variant => variant.canonicalKey)).size
    ).toBe(8)
})
```

- [ ] **Step 11: Implement unique transform generation**

```ts
export interface TransformedBoardVariant {
    transform: BoardTransform
    rows: string[]
    canonicalKey: string
    hash: string
}

export function getUniqueBoardTransforms(
    rows: readonly string[]
): TransformedBoardVariant[] {
    validateRows(rows)
    const seen = new Set<string>()
    const variants: TransformedBoardVariant[] = []

    for (const transform of BOARD_TRANSFORMS) {
        const transformed = transformRows(rows, transform)
        const canonicalKey = serializeBoardRows(transformed)
        if (seen.has(canonicalKey)) {
            continue
        }
        seen.add(canonicalKey)
        variants.push({
            transform,
            rows: transformed,
            canonicalKey,
            hash: hashString32Hex(canonicalKey),
        })
    }

    return variants
}
```

- [ ] **Step 12: Run transform tests and typecheck the touched modules**

```bash
bunx vitest run src/lib/games/ice-slide/transforms.test.ts
bun run typecheck
```

Expected: both commands succeed.

- [ ] **Step 13: Commit transforms and additive types**

```bash
git add \
  src/lib/games/ice-slide/types.ts \
  src/lib/games/ice-slide/transforms.ts \
  src/lib/games/ice-slide/transforms.test.ts
git commit -m "feat(ice-slide): add board transforms and canonical variants"
```

---

### Task 3: Materialize versioned Campaign runs

**Files:**
- Modify: `src/lib/games/ice-slide/types.ts`
- Create: `src/lib/games/ice-slide/run.ts`
- Create: `src/lib/games/ice-slide/run.test.ts`
- Modify: `src/lib/games/ice-slide/physics.ts`
- Modify: `src/lib/games/ice-slide/physics.test.ts`

**Interfaces:**
- Consumes:
  - `hashString32Hex()` from Task 1.
  - `serializeBoardRows()` from Task 2.
  - `ICE_SLIDE_LEVELS` from unchanged `levels.ts`.
  - `GLYPH_TO_CELL` from `types.ts`.
- Produces:

```ts
export const ICE_SLIDE_RUN_SCHEMA_VERSION: 1
export const ICE_SLIDE_CAMPAIGN_GENERATOR_VERSION: number
export const ICE_SLIDE_RULESET_VERSION: number
export const CAMPAIGN_RUN_KEY: string

export function createIceSlideStageSignature(input: {
    rows: readonly string[]
    parMoves: number
    objectiveIds: readonly IceSlideObjectiveId[]
    scoreMultiplierBps: number
}): string

export function assertValidIceSlideRunDefinition(
    run: IceSlideRunDefinition
): void

export function cloneIceSlideRunDefinition(
    run: IceSlideRunDefinition
): IceSlideRunDefinition

export function createCampaignRunDefinition(): IceSlideRunDefinition
```

- [ ] **Step 1: Add the complete run, stage, state, and game-data contracts**

In `types.ts`, add:

```ts
export interface IceSlideRunDefinition {
    schemaVersion: 1
    generatorVersion: number
    rulesetVersion: number
    mode: IceSlideMode
    runKey: string
    seed: string | null
    stages: IceSlideStageDefinition[]
}

export interface IceSlideStageDefinition {
    id: string
    name: string
    templateId: string
    difficulty: IceSlideDifficulty
    rows: string[]
    parMoves: number
    transform: BoardTransform
    mutationIds: string[]
    objectiveIds: IceSlideObjectiveId[]
    scoreMultiplierBps: number
    signature: string
}
```

Extend `IceSlideState` and `IceSlideGameData` with these required fields:

```ts
mode: IceSlideMode
runKey: string
runSchemaVersion: 1
generatorVersion: number
rulesetVersion: number
stagesTotal: number
starsEarned: number
falls: number
resets: number
stageSignatures: string[]
```

Do not remove or rename any existing field.

- [ ] **Step 2: Write version, key, and First Frost golden tests**

Create `run.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ICE_SLIDE_LEVELS } from './levels'
import {
    CAMPAIGN_RUN_KEY,
    ICE_SLIDE_CAMPAIGN_GENERATOR_VERSION,
    ICE_SLIDE_RULESET_VERSION,
    ICE_SLIDE_RUN_SCHEMA_VERSION,
    createCampaignRunDefinition,
    createIceSlideStageSignature,
} from './run'

describe('Ice Slide run versions and signatures', () => {
    it('derives the Campaign key from mode-specific versions', () => {
        expect(ICE_SLIDE_RUN_SCHEMA_VERSION).toBe(1)
        expect(ICE_SLIDE_CAMPAIGN_GENERATOR_VERSION).toBe(1)
        expect(ICE_SLIDE_RULESET_VERSION).toBe(1)
        expect(CAMPAIGN_RUN_KEY).toBe(
            'ice-slide:campaign:g1:r1'
        )
    })

    it('locks the First Frost signature preimage', () => {
        expect(
            createIceSlideStageSignature({
                rows: ICE_SLIDE_LEVELS[0].rows,
                parMoves: 1,
                objectiveIds: [],
                scoreMultiplierBps: 10000,
            })
        ).toBe('is1-a387e186')
    })
})
```

- [ ] **Step 3: Run the focused test and verify it fails**

```bash
bunx vitest run src/lib/games/ice-slide/run.test.ts
```

Expected: FAIL because `run.ts` does not exist.

- [ ] **Step 4: Implement version constants and exact signature generation**

Create `run.ts`:

```ts
import { hashString32Hex } from '../shared/seeded-rng'
import { serializeBoardRows } from './transforms'
import type {
    IceSlideObjectiveId,
    IceSlideRunDefinition,
} from './types'

export const ICE_SLIDE_RUN_SCHEMA_VERSION = 1 as const
export const ICE_SLIDE_CAMPAIGN_GENERATOR_VERSION = 1
export const ICE_SLIDE_RULESET_VERSION = 1

export const CAMPAIGN_RUN_KEY =
    `ice-slide:campaign:` +
    `g${ICE_SLIDE_CAMPAIGN_GENERATOR_VERSION}:` +
    `r${ICE_SLIDE_RULESET_VERSION}`

export function createIceSlideStageSignature(input: {
    rows: readonly string[]
    parMoves: number
    objectiveIds: readonly IceSlideObjectiveId[]
    scoreMultiplierBps: number
}): string {
    const sortedObjectiveIds = [...input.objectiveIds].sort()
    const payload = [
        'ice-slide-stage:v1',
        `rows=${serializeBoardRows(input.rows)}`,
        `parMoves=${input.parMoves}`,
        `objectiveIds=${sortedObjectiveIds.join(',')}`,
        `scoreMultiplierBps=${input.scoreMultiplierBps}`,
    ].join('\u001d')

    return `is1-${hashString32Hex(payload)}`
}
```

- [ ] **Step 5: Add exact Campaign materialization tests**

Append:

```ts
describe('Campaign run materialization', () => {
    it('materializes exactly the authored eight levels', () => {
        const run = createCampaignRunDefinition()

        expect(run).toMatchObject({
            schemaVersion: 1,
            generatorVersion: 1,
            rulesetVersion: 1,
            mode: 'campaign',
            runKey: 'ice-slide:campaign:g1:r1',
            seed: null,
        })
        expect(run.stages).toHaveLength(8)

        for (let index = 0; index < ICE_SLIDE_LEVELS.length; index++) {
            const level = ICE_SLIDE_LEVELS[index]
            const stage = run.stages[index]

            expect(stage.id).toBe(`campaign:${level.id}`)
            expect(stage.templateId).toBe(`campaign:${level.id}`)
            expect(stage.name).toBe(level.name)
            expect(stage.rows).toEqual(level.rows)
            expect(stage.rows).not.toBe(level.rows)
            expect(stage.parMoves).toBe(level.parMoves)
            expect(stage.transform).toBe('identity')
            expect(stage.mutationIds).toEqual([])
            expect(stage.objectiveIds).toEqual([])
            expect(stage.scoreMultiplierBps).toBe(10000)
            expect(stage.signature).toMatch(/^is1-[0-9a-f]{8}$/)
        }
    })

    it('returns fresh snapshots on every call', () => {
        const first = createCampaignRunDefinition()
        const second = createCampaignRunDefinition()

        first.stages[0].rows[0] = 'xxxxx'
        first.stages[0].objectiveIds.push('no_reset')

        expect(second.stages[0].rows[0]).toBe('#####')
        expect(second.stages[0].objectiveIds).toEqual([])
    })
})
```

- [ ] **Step 6: Implement Campaign difficulty mapping and adapter**

```ts
import { ICE_SLIDE_LEVELS } from './levels'
import type {
    IceSlideDifficulty,
    IceSlideRunDefinition,
} from './types'

const CAMPAIGN_DIFFICULTIES: readonly IceSlideDifficulty[] = [
    'tutorial',
    'easy',
    'easy',
    'medium',
    'medium',
    'medium',
    'hard',
    'hard',
]

export function createCampaignRunDefinition(): IceSlideRunDefinition {
    return {
        schemaVersion: ICE_SLIDE_RUN_SCHEMA_VERSION,
        generatorVersion:
            ICE_SLIDE_CAMPAIGN_GENERATOR_VERSION,
        rulesetVersion: ICE_SLIDE_RULESET_VERSION,
        mode: 'campaign',
        runKey: CAMPAIGN_RUN_KEY,
        seed: null,
        stages: ICE_SLIDE_LEVELS.map((level, index) => {
            const rows = [...level.rows]
            const stage = {
                id: `campaign:${level.id}`,
                name: level.name,
                templateId: `campaign:${level.id}`,
                difficulty: CAMPAIGN_DIFFICULTIES[index],
                rows,
                parMoves: level.parMoves,
                transform: 'identity' as const,
                mutationIds: [],
                objectiveIds: [],
                scoreMultiplierBps: 10000,
                signature: '',
            }
            stage.signature = createIceSlideStageSignature(stage)
            return stage
        }),
    }
}
```

- [ ] **Step 7: Add run-key validation fixtures for all modes**

Append:

```ts
import { hashString32Hex } from '../shared/seeded-rng'
import {
    assertValidIceSlideRunDefinition,
    cloneIceSlideRunDefinition,
} from './run'

function cloneRun(
    run = createCampaignRunDefinition()
): ReturnType<typeof createCampaignRunDefinition> {
    return structuredClone(run)
}

it('accepts the Campaign run', () => {
    expect(() =>
        assertValidIceSlideRunDefinition(
            createCampaignRunDefinition()
        )
    ).not.toThrow()
})

it.each([
    ['bad key characters', run => {
        run.runKey = 'ice slide'
    }],
    ['version mismatch', run => {
        run.runKey = 'ice-slide:campaign:g2:r1'
    }],
    ['Campaign seed', run => {
        run.seed = 'not-null'
    }],
    ['too many stages', run => {
        run.stages = Array.from(
            { length: 65 },
            (_, index) => ({
                ...structuredClone(run.stages[0]),
                id: `campaign:${index + 1}`,
            })
        )
    }],
    ['multiplier below band', run => {
        run.stages[0].scoreMultiplierBps = 999
    }],
    ['multiplier above band', run => {
        run.stages[0].scoreMultiplierBps = 50001
    }],
] as const)('rejects %s', (_name, mutate) => {
    const run = cloneRun()
    mutate(run)
    expect(() =>
        assertValidIceSlideRunDefinition(run)
    ).toThrow()
})

it('validates a Daily key/date/seed relationship', () => {
    const run = cloneRun()
    run.mode = 'daily'
    run.generatorVersion = 3
    run.rulesetVersion = 2
    run.runKey = 'ice-slide:daily:2026-08-02:g3:r2'
    run.seed = 'ice-slide:daily:3:2:2026-08-02'
    expect(() =>
        assertValidIceSlideRunDefinition(run)
    ).not.toThrow()
})

it('validates an Expedition key against the seed hash', () => {
    const run = cloneRun()
    run.mode = 'expedition'
    run.generatorVersion = 4
    run.rulesetVersion = 2
    run.seed = 'ice-slide:expedition:sample-seed'
    run.runKey =
        `ice-slide:expedition:${hashString32Hex(run.seed)}:` +
        'g4:r2'

    expect(() =>
        assertValidIceSlideRunDefinition(run)
    ).not.toThrow()
})
```

- [ ] **Step 8: Implement structural run validation**

Use these constants:

```ts
import { BOARD_TRANSFORMS } from './transforms'
import { GLYPH_TO_CELL } from './types'
import type {
    BoardTransform,
    IceSlideDifficulty,
    IceSlideMode,
    IceSlideObjectiveId,
} from './types'

const RUN_KEY_PATTERN = /^[A-Za-z0-9:._-]+$/
const RUN_KEY_MAX_LENGTH = 128
const DAILY_KEY_PATTERN =
    /^ice-slide:daily:(\d{4}-\d{2}-\d{2}):g([1-9]\d*):r([1-9]\d*)$/
const EXPEDITION_KEY_PATTERN =
    /^ice-slide:expedition:([0-9a-f]{8}):g([1-9]\d*):r([1-9]\d*)$/

const MODES = new Set<IceSlideMode>([
    'campaign',
    'daily',
    'expedition',
])
const DIFFICULTIES = new Set<IceSlideDifficulty>([
    'tutorial',
    'easy',
    'medium',
    'hard',
])
const OBJECTIVES = new Set<IceSlideObjectiveId>([
    'collect_all_crystals',
    'no_falls',
    'no_reset',
])
const TRANSFORMS = new Set<BoardTransform>(BOARD_TRANSFORMS)
```

Implement focused helpers:

```ts
function assertPositiveInt(value: number, field: string): void {
    if (
        !Number.isInteger(value) ||
        value < 1 ||
        value > 0x7fffffff
    ) {
        throw new RangeError(`${field} must be a positive signed integer`)
    }
}

function assertUniqueNonEmpty(
    values: readonly string[],
    field: string
): void {
    const seen = new Set<string>()
    for (const value of values) {
        if (value.length === 0 || seen.has(value)) {
            throw new RangeError(`${field} must contain unique non-empty values`)
        }
        seen.add(value)
    }
}
```

`assertValidIceSlideRunDefinition` must check, in order:

1. schema/version/mode;
2. transport-safe run key and maximum length;
3. mode-specific key/version/seed relationship;
4. stage count `1..64`;
5. stage IDs and field enums;
6. rectangular rows and `GLYPH_TO_CELL` keys;
7. positive `parMoves`;
8. `scoreMultiplierBps` in `1000..50000`;
9. unique mutation/objective IDs and recognized objectives;
10. exact signature recomputation.

For Campaign, require exact equality with `CAMPAIGN_RUN_KEY`, versions, and null seed. For Daily, parse the date/key and require the exact design seed. For Expedition, require non-empty seed without U+001F and key hash equal to `hashString32Hex(seed)`.

- [ ] **Step 9: Add deep-cloning tests and implementation**

Test:

```ts
it('deep-clones every mutable run array', () => {
    const source = createCampaignRunDefinition()
    const clone = cloneIceSlideRunDefinition(source)

    clone.stages[0].rows[0] = 'xxxxx'
    clone.stages[0].mutationIds.push('mutation:a')
    clone.stages[0].objectiveIds.push('no_reset')
    clone.stages.push(structuredClone(clone.stages[0]))

    expect(source.stages).toHaveLength(8)
    expect(source.stages[0].rows[0]).toBe('#####')
    expect(source.stages[0].mutationIds).toEqual([])
    expect(source.stages[0].objectiveIds).toEqual([])
})
```

Implementation:

```ts
export function cloneIceSlideRunDefinition(
    run: IceSlideRunDefinition
): IceSlideRunDefinition {
    return {
        ...run,
        stages: run.stages.map(stage => ({
            ...stage,
            rows: [...stage.rows],
            mutationIds: [...stage.mutationIds],
            objectiveIds: [...stage.objectiveIds],
        })),
    }
}
```

- [ ] **Step 10: Narrow the physics parser input contract**

In `physics.ts`, replace the `IceSlideLevel` dependency with:

```ts
export interface IceSlideGridSource {
    id: string | number
    rows: readonly string[]
}

export function parseGrid(
    source: IceSlideGridSource
): CellType[][] {
    if (source.rows.length === 0) {
        throw new Error(`Level ${source.id} has no rows`)
    }
    const cols = source.rows[0].length
    return source.rows.map((row, rowIndex) => {
        if (row.length !== cols) {
            throw new Error(
                `Level ${source.id} row ${rowIndex} length ${row.length} != ${cols}`
            )
        }
        return [...row].map(glyph => {
            const cell = GLYPH_TO_CELL[glyph]
            if (!cell) {
                throw new Error(
                    `Level ${source.id} unknown glyph "${glyph}" at row ${rowIndex}`
                )
            }
            return cell
        })
    })
}
```

Keep the validation categories and message templates; string IDs are allowed to appear in interpolated messages.

- [ ] **Step 11: Add a string-ID parser test**

In `physics.test.ts`:

```ts
it('parses materialized stage rows with a string id', () => {
    const grid = parseGrid({
        id: 'campaign:1',
        rows: ['#####', '#S.G#', '#####'],
    })
    expect(grid[1][1]).toBe('start')
    expect(grid[1][3]).toBe('goal')
})
```

Keep all existing parsing, slide, authored-par, and crystal-reachability tests unchanged.

- [ ] **Step 12: Run the run and physics suites**

```bash
bunx vitest run \
  src/lib/games/ice-slide/run.test.ts \
  src/lib/games/ice-slide/physics.test.ts
bun run typecheck
```

Expected: all tests pass and TypeScript accepts the additive interfaces.

- [ ] **Step 13: Commit run materialization**

```bash
git add \
  src/lib/games/ice-slide/types.ts \
  src/lib/games/ice-slide/run.ts \
  src/lib/games/ice-slide/run.test.ts \
  src/lib/games/ice-slide/physics.ts \
  src/lib/games/ice-slide/physics.test.ts
git commit -m "feat(ice-slide): materialize versioned campaign runs"
```

---

### Task 4: Refactor `IceSlideGame` to consume explicit runs

**Files:**
- Create: `src/lib/games/ice-slide/test-fixtures.ts`
- Modify: `src/lib/games/ice-slide/game.ts`
- Modify: `src/lib/games/ice-slide/game.test.ts`
- Modify: `src/lib/games/ice-slide/game.win.test.ts`
- Modify: `src/lib/games/ice-slide/game.hazard.test.ts`
- Modify: `src/lib/games/ice-slide/game.crystal-farm.test.ts`
- Modify: `src/lib/games/ice-slide/game.crystal-hazard-farm.test.ts`
- Modify: `src/lib/games/ice-slide/renderer.test.ts`

**Interfaces:**
- Consumes:
  - `createCampaignRunDefinition()`
  - `assertValidIceSlideRunDefinition()`
  - `cloneIceSlideRunDefinition()`
  - `IceSlideRunDefinition`
- Produces:
  - `IceSlideGame.start(run?: IceSlideRunDefinition): void`
  - state/game-data getters containing complete run metadata and copied signatures.

- [ ] **Step 1: Create test-only run builders**

Create `test-fixtures.ts`:

```ts
import { hashString32Hex } from '../shared/seeded-rng'
import {
    createIceSlideStageSignature,
    ICE_SLIDE_RULESET_VERSION,
    ICE_SLIDE_RUN_SCHEMA_VERSION,
} from './run'
import type {
    IceSlideRunDefinition,
    IceSlideStageDefinition,
} from './types'

export function createTestStage(
    overrides: Partial<IceSlideStageDefinition> = {}
): IceSlideStageDefinition {
    const base: IceSlideStageDefinition = {
        id: 'test:1',
        name: 'Test Stage',
        templateId: 'test:1',
        difficulty: 'easy',
        rows: ['#####', '#S.G#', '#####'],
        parMoves: 1,
        transform: 'identity',
        mutationIds: [],
        objectiveIds: [],
        scoreMultiplierBps: 10000,
        signature: '',
    }
    const stage = {
        ...base,
        ...overrides,
        rows: [...(overrides.rows ?? base.rows)],
        mutationIds: [
            ...(overrides.mutationIds ?? base.mutationIds),
        ],
        objectiveIds: [
            ...(overrides.objectiveIds ?? base.objectiveIds),
        ],
    }
    stage.signature = createIceSlideStageSignature(stage)
    return stage
}

export function createTestRun(
    stages: IceSlideStageDefinition[] = [createTestStage()],
    overrides: Partial<IceSlideRunDefinition> = {}
): IceSlideRunDefinition {
    return {
        schemaVersion: ICE_SLIDE_RUN_SCHEMA_VERSION,
        generatorVersion: 1,
        rulesetVersion: ICE_SLIDE_RULESET_VERSION,
        mode: 'expedition',
        runKey:
            'ice-slide:expedition:' +
            hashString32Hex('test-seed') +
            ':g1:r1',
        seed: 'test-seed',
        stages: stages.map(stage => ({
            ...stage,
            rows: [...stage.rows],
            mutationIds: [...stage.mutationIds],
            objectiveIds: [...stage.objectiveIds],
        })),
        ...overrides,
    }
}
```

When applying `overrides`, recalculate or explicitly supply a matching `runKey` whenever mode/seed/version changes.

- [ ] **Step 2: Add idle-state and default-start tests first**

In `game.test.ts`, add:

```ts
import { CAMPAIGN_RUN_KEY } from './run'

it('exposes complete Campaign metadata while idle', () => {
    const game = new IceSlideGame()
    const state = game.getState()
    const data = game.getGameData()

    expect(state).toMatchObject({
        status: 'idle',
        mode: 'campaign',
        runKey: CAMPAIGN_RUN_KEY,
        runSchemaVersion: 1,
        generatorVersion: 1,
        rulesetVersion: 1,
        stagesTotal: 8,
        starsEarned: 0,
        falls: 0,
        resets: 0,
    })
    expect(state.stageSignatures).toHaveLength(8)
    expect(data).toMatchObject({
        solved: false,
        stagesTotal: 8,
        starsEarned: 0,
        falls: 0,
        resets: 0,
    })
    expect(data.stageSignatures).toEqual(state.stageSignatures)
    expect(data.stageSignatures).not.toBe(state.stageSignatures)
    game.destroy()
})

it('constructs and starts the default Campaign without throwing', () => {
    const game = new IceSlideGame()
    expect(() => game.start()).not.toThrow()
    expect(game.getState().levelName).toBe('First Frost')
    game.destroy()
})
```

- [ ] **Step 3: Refactor constructor and idle state around a default active run**

In `game.ts`:

```ts
import type {
    IceSlideRunDefinition,
    IceSlideStageDefinition,
} from './types'
import {
    assertValidIceSlideRunDefinition,
    cloneIceSlideRunDefinition,
    createCampaignRunDefinition,
} from './run'

export class IceSlideGame {
    private activeRun: IceSlideRunDefinition
    // existing fields...

    constructor(callbacks: Partial<IceSlideCallbacks> = {}) {
        this.callbacks = callbacks
        this.activeRun = createCampaignRunDefinition()
        this.state = this.createIdleState()
    }
}
```

Do not call the public structural assertion in the constructor. The checked-in Campaign is protected by adapter tests, and `new IceSlideGame()` must not introduce a new throw path.

Create a helper:

```ts
private runMetadata(): Pick<
    IceSlideState,
    | 'mode'
    | 'runKey'
    | 'runSchemaVersion'
    | 'generatorVersion'
    | 'rulesetVersion'
    | 'stagesTotal'
    | 'stageSignatures'
> {
    return {
        mode: this.activeRun.mode,
        runKey: this.activeRun.runKey,
        runSchemaVersion: this.activeRun.schemaVersion,
        generatorVersion: this.activeRun.generatorVersion,
        rulesetVersion: this.activeRun.rulesetVersion,
        stagesTotal: this.activeRun.stages.length,
        stageSignatures: this.activeRun.stages.map(
            stage => stage.signature
        ),
    }
}
```

Add `...this.runMetadata()` plus zero `starsEarned`, `falls`, and `resets` to `createIdleState()`.

- [ ] **Step 4: Add explicit-run and invalid-run tests**

```ts
import {
    createTestRun,
    createTestStage,
} from './test-fixtures'

it('plays an explicit run according to its own stage count', () => {
    const stages = [
        createTestStage({
            id: 'test:1',
            name: 'First Test',
            rows: ['#####', '#S.G#', '#####'],
        }),
        createTestStage({
            id: 'test:2',
            name: 'Second Test',
            rows: ['#####', '#S.G#', '#####'],
        }),
    ]
    const game = new IceSlideGame()
    game.start(createTestRun(stages))

    expect(game.getState().levelName).toBe('First Test')
    game.move('E')
    expect(game.getState().levelName).toBe('Second Test')
    game.move('E')
    expect(game.getState().status).toBe('won')
    expect(game.getState().levelsCleared).toBe(2)
    game.destroy()
})

it('rejects an invalid explicit run before mutating prior state', () => {
    const game = new IceSlideGame()
    const before = game.getState()
    const invalid = createTestRun()
    invalid.runKey = 'invalid key'

    expect(() => game.start(invalid)).toThrow()
    expect(game.getState()).toEqual(before)
    game.destroy()
})

it('isolates the active run from caller mutation', () => {
    const run = createTestRun()
    const game = new IceSlideGame()
    game.start(run)

    run.stages[0].rows[1] = '#...#'
    run.stages[0].name = 'Mutated'
    run.stages[0].objectiveIds.push('no_reset')

    expect(game.getState().levelName).toBe('Test Stage')
    expect(game.getState().rows).toBe(3)
    game.destroy()
})
```

- [ ] **Step 5: Change `start()` to validate only explicit runs before state mutation**

```ts
start(run?: IceSlideRunDefinition): void {
    const nextRun = run
        ? (() => {
              assertValidIceSlideRunDefinition(run)
              return cloneIceSlideRunDefinition(run)
          })()
        : createCampaignRunDefinition()

    this.stopTimer()
    this.activeRun = nextRun
    this.state = this.createIdleState()
    this.state.status = 'playing'
    this.loadLevel(0)
    this.startTimer()
    this.callbacks.onGameStart?.()
    this.callbacks.onScoreUpdate?.(this.state.score)
    this.callbacks.onTimeUpdate?.(0)
}
```

The explicit validation/clone must finish before stopping the prior timer, assigning `activeRun`, or changing `state`.

- [ ] **Step 6: Replace direct level access with the active stage**

Add:

```ts
private getStage(index: number): IceSlideStageDefinition {
    const stage = this.activeRun.stages[index]
    if (!stage) {
        throw new Error(`Ice Slide stage index out of range: ${index}`)
    }
    return stage
}
```

In `clearLevel()` and `loadLevel()`, replace `getLevel(index)` with `this.getStage(index)`. Replace the completion comparison against `ICE_SLIDE_LEVELS.length` with `this.activeRun.stages.length`.

Keep existing scoring calls unchanged:

```ts
const gained = levelScore({
    levelNumber: this.state.levelIndex + 1,
    parMoves: stage.parMoves,
    movesUsed: this.state.levelMoves,
    crystalsCollected: this.state.levelCrystalsCollected,
})
```

Do not apply `scoreMultiplierBps`.

- [ ] **Step 7: Preserve metadata and cumulative counters across every state rebuild**

Before replacing `this.state` in `loadLevel()`, preserve:

```ts
const cumulative = {
    moves: this.state.moves,
    crystalsCollected: this.state.crystalsCollected,
    score: this.state.score,
    elapsedSeconds: this.state.elapsedSeconds,
    perfectLevels: this.state.perfectLevels,
    levelsCleared: this.state.levelsCleared,
    starsEarned: this.state.starsEarned,
    falls: this.state.falls,
    resets: this.state.resets,
    status: this.state.status,
}
```

The new state object must always include:

```ts
...this.runMetadata(),
starsEarned: preserved?.starsEarned ?? 0,
falls: preserved?.falls ?? 0,
resets: preserved?.resets ?? 0,
```

`stageSignatures` must always come from the complete `activeRun`, not cleared stages.

Do not increment falls/resets in HPA-485.

- [ ] **Step 8: Extend getters with copied metadata arrays**

`getState()` must retain its existing defensive grid/player/path copies and add:

```ts
stageSignatures: [...this.state.stageSignatures],
```

`getGameData()` must return all existing fields plus:

```ts
mode: this.state.mode,
runKey: this.state.runKey,
runSchemaVersion: this.state.runSchemaVersion,
generatorVersion: this.state.generatorVersion,
rulesetVersion: this.state.rulesetVersion,
stagesTotal: this.state.stagesTotal,
starsEarned: this.state.starsEarned,
falls: this.state.falls,
resets: this.state.resets,
stageSignatures: [...this.state.stageSignatures],
```

- [ ] **Step 9: Add stage-advance/reset/hazard carry tests**

In `game.test.ts` or focused branch tests, assert that these fields remain identical after:

1. normal stage advance;
2. manual `resetLevel()`;
3. hazard reload.

Use this helper:

```ts
function expectRunMetadataPreserved(
    before: ReturnType<IceSlideGame['getState']>,
    after: ReturnType<IceSlideGame['getState']>
): void {
    expect(after).toMatchObject({
        mode: before.mode,
        runKey: before.runKey,
        runSchemaVersion: before.runSchemaVersion,
        generatorVersion: before.generatorVersion,
        rulesetVersion: before.rulesetVersion,
        stagesTotal: before.stagesTotal,
        starsEarned: before.starsEarned,
        falls: before.falls,
        resets: before.resets,
    })
    expect(after.stageSignatures).toEqual(before.stageSignatures)
}
```

- [ ] **Step 10: Replace all four `vi.mock('./levels')` suites with explicit runs**

For each branch test:

- delete the top-level `vi.mock('./levels', ...)`;
- import `createTestRun` and `createTestStage`;
- pass the explicit run to `game.start(run)`.

Example for `game.win.test.ts`:

```ts
const run = createTestRun([
    createTestStage({
        name: 'Crystal Dash',
        rows: ['######', '#SC.G#', '######'],
        parMoves: 1,
    }),
])
const game = new IceSlideGame({ onCrystal, onWin, onLevelClear })
game.start(run)
```

Example for `game.hazard.test.ts`:

```ts
const run = createTestRun([
    createTestStage({
        name: 'Hazard Lane',
        rows: ['#####', '#S.H#', '#G..#', '#####'],
        parMoves: 1,
    }),
])
game.start(run)
```

Keep each suite’s existing behavioral assertions.

- [ ] **Step 11: Update the renderer test fixture**

In `renderer.test.ts`, add these defaults to `makeState()`:

```ts
mode: 'campaign',
runKey: 'ice-slide:campaign:g1:r1',
runSchemaVersion: 1,
generatorVersion: 1,
rulesetVersion: 1,
stagesTotal: 8,
starsEarned: 0,
falls: 0,
resets: 0,
stageSignatures: [],
```

This is a test-only fixture update. Do not modify `renderer.ts`.

- [ ] **Step 12: Run the complete targeted Ice Slide suite**

```bash
bunx vitest run \
  src/lib/games/shared/seeded-rng.test.ts \
  src/lib/games/ice-slide/transforms.test.ts \
  src/lib/games/ice-slide/run.test.ts \
  src/lib/games/ice-slide/physics.test.ts \
  src/lib/games/ice-slide/game.test.ts \
  src/lib/games/ice-slide/game.win.test.ts \
  src/lib/games/ice-slide/game.hazard.test.ts \
  src/lib/games/ice-slide/game.crystal-farm.test.ts \
  src/lib/games/ice-slide/game.crystal-hazard-farm.test.ts \
  src/lib/games/ice-slide/renderer.test.ts
```

Expected: PASS with no `./levels` mocks remaining in the four branch suites.

- [ ] **Step 13: Run repository-wide verification**

```bash
bun run test:run
bun run typecheck
bun run lint
bun run format:check
```

Expected:
- Vitest exits with zero failed tests.
- Astro typecheck exits successfully.
- ESLint exits with no errors.
- Prettier check reports all files formatted.

- [ ] **Step 14: Verify unchanged boundaries**

Run:

```bash
git diff --name-only origin/main...HEAD
git diff origin/main...HEAD -- \
  src/lib/challenges.ts \
  src/lib/games/ice-slide/levels.ts \
  src/lib/games/ice-slide/scoring.ts \
  src/lib/games/ice-slide/init.ts \
  src/lib/games/ice-slide/renderer.ts \
  src/lib/games/shared/types.ts \
  src/lib/achievements.ts
```

Expected:
- the first command lists only files from the plan’s New/Modified sections;
- the second command prints no diff.

Also run:

```bash
rg "vi\.mock\('./levels'" src/lib/games/ice-slide
rg "Math\.random" \
  src/lib/games/shared/seeded-rng.ts \
  src/lib/games/ice-slide/run.ts \
  src/lib/games/ice-slide/transforms.ts
```

Expected:
- no remaining `./levels` mocks in Ice Slide branch tests;
- no `Math.random` references in deterministic modules.

- [ ] **Step 15: Commit the game migration**

```bash
git add \
  src/lib/games/ice-slide/test-fixtures.ts \
  src/lib/games/ice-slide/game.ts \
  src/lib/games/ice-slide/game.test.ts \
  src/lib/games/ice-slide/game.win.test.ts \
  src/lib/games/ice-slide/game.hazard.test.ts \
  src/lib/games/ice-slide/game.crystal-farm.test.ts \
  src/lib/games/ice-slide/game.crystal-hazard-farm.test.ts \
  src/lib/games/ice-slide/renderer.test.ts
git commit -m "refactor(ice-slide): consume explicit run definitions"
```

---

## Final Review Checklist

Before marking HPA-485 implementation complete, verify each design requirement against the implementation:

- [ ] FNV-1a numeric/hex vectors match.
- [ ] `createSeededRng()` uses `hashString32(seedKey)` as initial Mulberry32 state.
- [ ] Raw stream, `nextInt`, `pick`, shuffle, and fork vectors match.
- [ ] Public seed keys and fork labels reject U+001F.
- [ ] No deterministic module calls `Math.random()`.
- [ ] All eight transforms match the rectangular fixture and coordinate table.
- [ ] Canonical serialization rejects empty, zero-column, and jagged rows.
- [ ] Symmetry dedup uses complete canonical keys.
- [ ] First Frost signature is `is1-a387e186`.
- [ ] Campaign run key is derived from Campaign-specific generator and ruleset versions.
- [ ] Run validation enforces transport-safe mode-specific key/seed/version relationships.
- [ ] Run validation limits stages to `1..64` and multiplier BPS to `1000..50000`.
- [ ] Structural validation does not perform solver-quality checks.
- [ ] `new IceSlideGame()` and default `start()` do not add a new structural-validation throw path.
- [ ] Invalid explicit starts throw before changing state or starting a timer.
- [ ] Campaign content, order, names, pars, scoring, completion, and partial-End behavior remain unchanged.
- [ ] State rebuilds preserve full-run signatures, metadata, and zero counters.
- [ ] `getState()` and `getGameData()` copy signature arrays.
- [ ] Existing achievement fields remain present.
- [ ] HPA-487 follow-up gates are documented but not implemented here.
- [ ] `init.ts`, renderer implementation, scoring, levels, platform challenges, achievements, and shared type re-export remain untouched.
- [ ] Full tests, typecheck, lint, and formatting checks pass.

## Execution Handoff

Plan implementation options:

1. **Subagent-Driven (recommended)** — use `superpowers:subagent-driven-development`, dispatch one fresh subagent per task, and review each task before moving on.
2. **Inline Execution** — use `superpowers:executing-plans`, execute the four tasks in order with checkpoints after each commit.
