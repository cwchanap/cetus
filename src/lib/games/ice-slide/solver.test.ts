import { describe, expect, it } from 'vitest'
import { solveIceSlideBoard } from './solver'
import { ICE_SLIDE_LEVELS } from './levels'

const FRAGILE_MASK_BOARD = [
    '#######',
    '#F....#',
    '#.F.G.#',
    '##..F.#',
    '#.....#',
    '#S.##F#',
    '#######',
]

const EIGHT_FRAGILE_BOARD = [
    '#########',
    '#F...#.##',
    '#..F....#',
    '#...S...#',
    '#..FF..F#',
    '#.G##..##',
    '#F....F.#',
    '##.F....#',
    '#########',
]

describe('ice-slide solver', () => {
    it('solves a one-move board with the exact minimum', () => {
        const result = solveIceSlideBoard(
            { id: 'one-move', rows: ['#####', '#S.G#', '#####'] },
            { maxStates: 32 }
        )
        expect(result.solvable).toBe(true)
        expect(result.minMoves).toBe(1)
        expect(result.truncated).toBe(false)
        expect(result.reachableStopCount).toBe(2)
        expect(result.reachableCrystalIds).toEqual([])
        expect(result.reachedGoalWithAllCrystals).toBe(false)
    })

    it('accounts for snow stops in the minimum', () => {
        const result = solveIceSlideBoard(
            {
                id: 'snow-par',
                rows: ['######', '#S.NG#', '######'],
            },
            { maxStates: 32 }
        )

        expect(result.solvable).toBe(true)
        expect(result.truncated).toBe(false)
        expect(result.minMoves).toBe(2)
    })

    it('matches the current par for campaign level 2', () => {
        const level = ICE_SLIDE_LEVELS[1]
        const result = solveIceSlideBoard(level, { maxStates: 64 })
        expect(result.solvable).toBe(true)
        expect(result.minMoves).toBe(level.parMoves)
        expect(result.truncated).toBe(false)
    })

    it('revisits a coordinate after crystal collection as a new state', () => {
        const result = solveIceSlideBoard(
            {
                id: 'mask-state',
                rows: [
                    '######',
                    '#S.C.#',
                    '#..#.#',
                    '#....#',
                    '#.G..#',
                    '######',
                ],
            },
            { maxStates: 64 }
        )
        expect(result.solvable).toBe(true)
        expect(result.minMoves).toBe(2)
        expect(result.exploredStates).toBeGreaterThan(result.reachableStopCount)
        expect(result.truncated).toBe(false)
    })

    it('reports reachable crystal ids in row-major order', () => {
        const result = solveIceSlideBoard(
            {
                id: 'crystal-ids',
                rows: ['#######', '#S.C.C#', '#.....#', '#..G..#', '#######'],
            },
            { maxStates: 64 }
        )
        expect(result.solvable).toBe(true)
        expect(result.reachableCrystalIds).toEqual(['1,3', '1,5'])
    })

    it('excludes an isolated crystal from reachable ids', () => {
        const result = solveIceSlideBoard(
            {
                id: 'isolated-crystal',
                rows: ['######', '#S..G#', '#..C.#', '#....#', '######'],
            },
            { maxStates: 64 }
        )
        expect(result.solvable).toBe(true)
        expect(result.minMoves).toBe(1)
        expect(result.reachableCrystalIds).toEqual([])
    })

    it('reflects an actual full-crystal goal state', () => {
        const allCollected = solveIceSlideBoard(
            {
                id: 'all-crystals',
                rows: ['#######', '#S.C.C#', '#.....#', '#..G..#', '#######'],
            },
            { maxStates: 64 }
        )
        expect(allCollected.reachedGoalWithAllCrystals).toBe(true)

        const neverCollected = solveIceSlideBoard(
            {
                id: 'partial-crystals',
                rows: ['######', '#S..G#', '#..C.#', '#....#', '######'],
            },
            { maxStates: 64 }
        )
        expect(neverCollected.reachedGoalWithAllCrystals).toBe(false)
    })

    it('keeps explored states ahead of stops when masks distinguish them', () => {
        const result = solveIceSlideBoard(
            {
                id: 'stop-state',
                rows: [
                    '#######',
                    '#S..C.#',
                    '#.....#',
                    '#....G#',
                    '#.....#',
                    '#######',
                ],
            },
            { maxStates: 64 }
        )
        expect(result.exploredStates).toBeGreaterThanOrEqual(
            result.reachableStopCount
        )
        expect(result.exploredStates).toBeGreaterThan(result.reachableStopCount)
        expect(result.truncated).toBe(false)
    })

    it('is deterministic and leaves caller rows unchanged', () => {
        const rows = [
            '######',
            '#S.C.#',
            '#..#.#',
            '#....#',
            '#.G..#',
            '######',
        ]
        const source = { id: 'immutable', rows }
        const first = solveIceSlideBoard(source, { maxStates: 64 })
        const second = solveIceSlideBoard(source, { maxStates: 64 })
        expect(second).toEqual(first)
        expect(rows).toEqual([
            '######',
            '#S.C.#',
            '#..#.#',
            '#....#',
            '#.G..#',
            '######',
        ])
    })

    it('rejects malformed boards', () => {
        const board = (rows: string[]) => ({ id: 'invalid', rows })
        expect(() => solveIceSlideBoard(board([]), { maxStates: 8 })).toThrow(
            /no rows/
        )
        expect(() =>
            solveIceSlideBoard(board(['###', '##']), { maxStates: 8 })
        ).toThrow(/length/)
        expect(() =>
            solveIceSlideBoard(board(['###', '#X#', '###']), { maxStates: 8 })
        ).toThrow(/unknown glyph/)
        expect(() =>
            solveIceSlideBoard(board(['', '']), { maxStates: 8 })
        ).toThrow(/zero columns/)
        expect(() =>
            solveIceSlideBoard(board(['####', '#.G#', '####']), {
                maxStates: 8,
            })
        ).toThrow(/missing a start/)
        expect(() =>
            solveIceSlideBoard(board(['#####', '#S.S#', '#.G.#', '#####']), {
                maxStates: 8,
            })
        ).toThrow(/multiple start/)
        expect(() =>
            solveIceSlideBoard(board(['####', '#S.#', '####']), {
                maxStates: 8,
            })
        ).toThrow(/missing a goal/)
        expect(() =>
            solveIceSlideBoard(
                board(['######', '#S..G#', '#..G.#', '######']),
                {
                    maxStates: 8,
                }
            )
        ).toThrow(/multiple goal/)
        expect(() =>
            solveIceSlideBoard(
                board(['S' + 'C'.repeat(31), 'G' + '.'.repeat(31)]),
                { maxStates: 8 }
            )
        ).toThrow(/more than 30 crystals/)
    })

    it('rejects invalid maxStates caps', () => {
        const source = { id: 'cap', rows: ['#####', '#S.G#', '#####'] }
        for (const maxStates of [0, -1, 2.5, 2 ** 53]) {
            expect(() => solveIceSlideBoard(source, { maxStates })).toThrow(
                /maxStates/
            )
        }
    })

    it('truncates when the state cap is hit by a goal state on a one-move board', () => {
        // Positive control: with a generous cap the board is solvable in 1 move.
        const baseline = solveIceSlideBoard(
            { id: 'one-move-baseline', rows: ['#####', '#S.G#', '#####'] },
            { maxStates: 32 }
        )
        expect(baseline.solvable).toBe(true)
        expect(baseline.minMoves).toBe(1)

        const result = solveIceSlideBoard(
            { id: 'one-move-cap', rows: ['#####', '#S.G#', '#####'] },
            { maxStates: 1 }
        )
        expect(result.truncated).toBe(true)
        expect(result.solvable).toBe(false)
        expect(result.minMoves).toBeNull()
        expect(result.exploredStates).toBe(1)
    })

    it('truncates at the state cap without preserving a partial par', () => {
        const result = solveIceSlideBoard(
            {
                id: 'truncate',
                rows: [
                    '######',
                    '#S.C.#',
                    '#..#.#',
                    '#....#',
                    '#.G..#',
                    '######',
                ],
            },
            { maxStates: 5 }
        )
        expect(result.truncated).toBe(true)
        expect(result.solvable).toBe(false)
        expect(result.minMoves).toBeNull()
        expect(result.exploredStates).toBeLessThanOrEqual(5)
    })

    it('clears reachedGoalWithAllCrystals when truncating after a full-crystal goal', () => {
        // Positive control: with a generous cap the board reaches the goal
        // with all crystals collected.
        const baseline = solveIceSlideBoard(
            {
                id: 'crystal-baseline',
                rows: ['#######', '#S.C.C#', '#.....#', '#..G..#', '#######'],
            },
            { maxStates: 64 }
        )
        expect(baseline.reachedGoalWithAllCrystals).toBe(true)

        // The full-crystal goal is admitted as the 7th state, then the next
        // transition hits the cap. The flag must be suppressed to avoid
        // contradicting `truncated: true` / `solvable: false`.
        const result = solveIceSlideBoard(
            {
                id: 'crystal-truncate',
                rows: ['#######', '#S.C.C#', '#.....#', '#..G..#', '#######'],
            },
            { maxStates: 7 }
        )
        expect(result.truncated).toBe(true)
        expect(result.solvable).toBe(false)
        expect(result.minMoves).toBeNull()
        expect(result.reachedGoalWithAllCrystals).toBe(false)
        expect(result.exploredStates).toBe(7)
    })

    it('distinguishes the same stop under different collapsed-fragile histories', () => {
        const result = solveIceSlideBoard(
            { id: 'fragile-mask-state', rows: FRAGILE_MASK_BOARD },
            { maxStates: 10_000 }
        )

        expect(result.solvable).toBe(true)
        expect(result.truncated).toBe(false)
        expect(result.minMoves).toBe(6)
        expect(result.exploredStates).toBeGreaterThan(result.reachableStopCount)
    })

    it.each([
        ['four fragile', FRAGILE_MASK_BOARD, 6],
        ['eight fragile', EIGHT_FRAGILE_BOARD, 6],
    ])(
        'keeps %s within the existing solver budget',
        (_name: string, rows: string[], minMoves: number) => {
            const result = solveIceSlideBoard(
                { id: `budget:${_name}`, rows },
                { maxStates: 10_000 }
            )

            expect(result.solvable).toBe(true)
            expect(result.truncated).toBe(false)
            expect(result.minMoves).toBe(minMoves)
            expect(result.exploredStates).toBeLessThan(10_000)
        }
    )

    it('does not impose a 30-fragile representation limit', () => {
        const rows = [
            '#########',
            '#S.....G#',
            '#########',
            '#FFFFFFF#',
            '#FFFFFFF#',
            '#FFFFFFF#',
            '#FFFFFFF#',
            '#FFF....#',
            '#########',
        ]

        const result = solveIceSlideBoard(
            { id: 'many-fragile', rows },
            { maxStates: 32 }
        )
        expect(result.solvable).toBe(true)
        expect(result.minMoves).toBe(1)
        expect(result.truncated).toBe(false)
    })
})
