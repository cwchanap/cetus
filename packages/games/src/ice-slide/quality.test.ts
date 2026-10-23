import { describe, expect, it } from 'vitest'
import { getIceSlideObjectiveFeasibility } from './objectives'
import { ICE_SLIDE_LEVELS } from './levels'
import { validateIceSlideStageQuality } from './quality'
import { serializeBoardRows } from './transforms'

const SOLVABLE = ['#####', '#S.G#', '#####']
const CRYSTAL_BOARD = ['#######', '#S.C.C#', '#.....#', '#..G..#', '#######']
const ISOLATED_CRYSTAL = ['######', '#S..G#', '#..C.#', '#....#', '######']
const HAZARD_BOARD = [
    '#######',
    '#S..H.#',
    '#..#..#',
    '#.....#',
    '#..G..#',
    '#######',
]
const MASK_STATE = ['######', '#S.C.#', '#..#.#', '#....#', '#.G..#', '######']
const WALLED_GOAL = ['######', '#S...#', '##G###', '#....#', '######']
const FRAGILE_MASK_BOARD = [
    '#######',
    '#F....#',
    '#.F.G.#',
    '##..F.#',
    '#.....#',
    '#S.##F#',
    '#######',
]

const defaultConstraints = {
    parBand: { minMoves: 1, maxMoves: 10 },
    maxStates: 64,
} as const

describe('ice-slide stage quality: constraints', () => {
    const candidate = {
        id: 'constraint-probe',
        rows: SOLVABLE,
        objectiveIds: [],
    }

    it('rejects non-positive or unsafe maxStates values', () => {
        for (const maxStates of [0, -1, 2.5, Number.MAX_SAFE_INTEGER + 1]) {
            expect(() =>
                validateIceSlideStageQuality(candidate, {
                    parBand: { minMoves: 1, maxMoves: 3 },
                    maxStates,
                })
            ).toThrow(RangeError)
        }
    })

    it('rejects non-positive or unsafe par band bounds', () => {
        for (const minMoves of [0, -1, 2.5, Number.MAX_SAFE_INTEGER + 1]) {
            expect(() =>
                validateIceSlideStageQuality(candidate, {
                    parBand: { minMoves, maxMoves: 3 },
                    maxStates: 64,
                })
            ).toThrow(RangeError)
        }
        for (const maxMoves of [0, -1, 2.5, Number.MAX_SAFE_INTEGER + 1]) {
            expect(() =>
                validateIceSlideStageQuality(candidate, {
                    parBand: { minMoves: 1, maxMoves },
                    maxStates: 64,
                })
            ).toThrow(RangeError)
        }
    })

    it('accepts optional stop floor and hazard ceiling, rejecting unsafe values', () => {
        const accepted = validateIceSlideStageQuality(candidate, {
            parBand: { minMoves: 1, maxMoves: 20 },
            maxStates: 10_000,
            minReachableStops: 1,
            maxHazards: 0,
        })
        expect(accepted.accepted).toBe(true)

        for (const value of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
            expect(() =>
                validateIceSlideStageQuality(candidate, {
                    parBand: { minMoves: 1, maxMoves: 20 },
                    maxStates: 10_000,
                    minReachableStops: value,
                })
            ).toThrow(RangeError)
        }

        for (const value of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
            expect(() =>
                validateIceSlideStageQuality(candidate, {
                    parBand: { minMoves: 1, maxMoves: 20 },
                    maxStates: 10_000,
                    maxHazards: value,
                })
            ).toThrow(RangeError)
        }
    })

    it('throws when the par band is inverted', () => {
        expect(() =>
            validateIceSlideStageQuality(candidate, {
                parBand: { minMoves: 5, maxMoves: 3 },
                maxStates: 64,
            })
        ).toThrow(RangeError)
    })

    it('validates constraints before inspecting the candidate', () => {
        expect(() =>
            validateIceSlideStageQuality(
                { id: 'jagged', rows: ['###', '##'], objectiveIds: [] },
                { parBand: { minMoves: 1, maxMoves: 3 }, maxStates: 0 }
            )
        ).toThrow(RangeError)
    })
})

describe('ice-slide stage quality: board shape', () => {
    it('maps empty, zero-column, and jagged rows to invalid_board', () => {
        for (const rows of [[], ['', ''], ['###', '##']]) {
            const result = validateIceSlideStageQuality(
                { id: 'shape', rows, objectiveIds: [] },
                defaultConstraints
            )
            expect(result.accepted).toBe(false)
            if (result.accepted === false) {
                expect(result.reason).toBe('invalid_board')
                expect(result.message.length).toBeGreaterThan(0)
                expect(result.canonicalKey).toBeUndefined()
                expect(result.solveResult).toBeUndefined()
            }
        }
    })
})

describe('ice-slide stage quality: solver error mapping', () => {
    it('maps glyph, start, goal, and crystal-ceiling errors to invalid_board', () => {
        const cases: Array<{ rows: string[]; pattern: RegExp }> = [
            { rows: ['###', '#X#', '###'], pattern: /unknown glyph/ },
            { rows: ['####', '#.G#', '####'], pattern: /missing a start/ },
            {
                rows: ['#####', '#S.S#', '#.G.#', '#####'],
                pattern: /multiple start/,
            },
            { rows: ['####', '#S.#', '####'], pattern: /missing a goal/ },
            {
                rows: ['######', '#S..G#', '#..G.#', '######'],
                pattern: /multiple goal/,
            },
            {
                rows: ['S' + 'C'.repeat(31), 'G' + '.'.repeat(31)],
                pattern: /more than 30 crystals/,
            },
        ]
        for (const { rows, pattern } of cases) {
            const result = validateIceSlideStageQuality(
                { id: 'content', rows, objectiveIds: [] },
                defaultConstraints
            )
            expect(result.accepted).toBe(false)
            if (result.accepted === false) {
                expect(result.reason).toBe('invalid_board')
                expect(result.message).toMatch(pattern)
                expect(result.canonicalKey).toBe(serializeBoardRows(rows))
                expect(result.solveResult).toBeUndefined()
            }
        }
    })
})

describe('ice-slide stage quality: duplicate detection', () => {
    it('rejects an existing canonical key before running the solver', () => {
        const result = validateIceSlideStageQuality(
            { id: 'dup', rows: MASK_STATE, objectiveIds: [] },
            {
                parBand: { minMoves: 2, maxMoves: 2 },
                // A tiny cap would truncate this board if the solver ran
                // first; getting duplicate_board proves the cheap check
                // precedes the BFS.
                maxStates: 3,
                existingCanonicalKeys: new Set([
                    serializeBoardRows(MASK_STATE),
                ]),
            }
        )
        expect(result.accepted).toBe(false)
        if (result.accepted === false) {
            expect(result.reason).toBe('duplicate_board')
            expect(result.canonicalKey).toBe(serializeBoardRows(MASK_STATE))
            expect(result.solveResult).toBeUndefined()
        }
    })
})

describe('ice-slide stage quality: solver outcome checks', () => {
    it('maps a state-cap hit to solver_truncated', () => {
        const result = validateIceSlideStageQuality(
            { id: 'truncate', rows: MASK_STATE, objectiveIds: [] },
            { parBand: { minMoves: 1, maxMoves: 10 }, maxStates: 3 }
        )
        expect(result.accepted).toBe(false)
        if (result.accepted === false) {
            expect(result.reason).toBe('solver_truncated')
            expect(result.solveResult?.truncated).toBe(true)
            expect(result.canonicalKey).toBe(serializeBoardRows(MASK_STATE))
        }
    })

    it('maps a fully explored impossible board to unsolvable', () => {
        const result = validateIceSlideStageQuality(
            { id: 'walled', rows: WALLED_GOAL, objectiveIds: [] },
            defaultConstraints
        )
        expect(result.accepted).toBe(false)
        if (result.accepted === false) {
            expect(result.reason).toBe('unsolvable')
            expect(result.solveResult?.truncated).toBe(false)
            expect(result.solveResult?.solvable).toBe(false)
            expect(result.canonicalKey).toBe(serializeBoardRows(WALLED_GOAL))
        }
    })

    it('fails closed when fragile state exhausts the solver cap', () => {
        const result = validateIceSlideStageQuality(
            {
                id: 'fragile-truncated',
                rows: FRAGILE_MASK_BOARD,
                objectiveIds: [],
            },
            {
                parBand: { minMoves: 1, maxMoves: 20 },
                maxStates: 10,
            }
        )

        expect(result).toMatchObject({
            accepted: false,
            reason: 'solver_truncated',
        })
    })

    it('rejects a computed par below the band', () => {
        const result = validateIceSlideStageQuality(
            { id: 'below', rows: SOLVABLE, objectiveIds: [] },
            { parBand: { minMoves: 5, maxMoves: 10 }, maxStates: 64 }
        )
        expect(result.accepted).toBe(false)
        if (result.accepted === false) {
            expect(result.reason).toBe('par_out_of_band')
            expect(result.solveResult?.minMoves).toBe(1)
        }
    })

    it('rejects a computed par above the band', () => {
        const level = ICE_SLIDE_LEVELS[1]
        const result = validateIceSlideStageQuality(
            { id: level.id, rows: level.rows, objectiveIds: [] },
            { parBand: { minMoves: 1, maxMoves: 2 }, maxStates: 64 }
        )
        expect(result.accepted).toBe(false)
        if (result.accepted === false) {
            expect(result.reason).toBe('par_out_of_band')
            expect(result.solveResult?.minMoves).toBe(3)
        }
    })
})

describe('ice-slide stage quality: objective feasibility', () => {
    it('rejects collect_all_crystals on a crystal-free board', () => {
        const result = validateIceSlideStageQuality(
            {
                id: 'no-crystals',
                rows: SOLVABLE,
                objectiveIds: ['collect_all_crystals'],
            },
            defaultConstraints
        )
        expect(result.accepted).toBe(false)
        if (result.accepted === false) {
            expect(result.reason).toBe('objective_infeasible')
            expect(result.message).toMatch(/no crystals/)
            expect(result.solveResult).toBeDefined()
        }
    })

    it('rejects collect_all_crystals when crystals are unreachable', () => {
        const result = validateIceSlideStageQuality(
            {
                id: 'isolated',
                rows: ISOLATED_CRYSTAL,
                objectiveIds: ['collect_all_crystals'],
            },
            defaultConstraints
        )
        expect(result.accepted).toBe(false)
        if (result.accepted === false) {
            expect(result.reason).toBe('objective_infeasible')
            expect(result.message).toMatch(/unreachable/)
            expect(result.solveResult?.reachableCrystalIds).toEqual([])
        }
    })

    it('rejects collect_all_crystals when the all-crystal goal is unreachable', () => {
        const rows = [
            '######',
            '##.#.#',
            '##.#.#',
            '#.#GS#',
            '#C.C.#',
            '######',
        ]
        const result = validateIceSlideStageQuality(
            {
                id: 'split',
                rows,
                objectiveIds: ['collect_all_crystals'],
            },
            defaultConstraints
        )
        expect(result.accepted).toBe(false)
        if (result.accepted === false) {
            expect(result.reason).toBe('objective_infeasible')
            expect(result.message).toMatch(/all crystals/)
            expect(result.solveResult?.reachableCrystalIds).toHaveLength(2)
        }
    })

    it('rejects no_falls on a hazard-free board', () => {
        const result = validateIceSlideStageQuality(
            { id: 'no-hazard', rows: SOLVABLE, objectiveIds: ['no_falls'] },
            defaultConstraints
        )
        expect(result.accepted).toBe(false)
        if (result.accepted === false) {
            expect(result.reason).toBe('objective_infeasible')
            expect(result.message).toMatch(/hazard/)
        }
    })

    it('evaluates assigned objectives in input order', () => {
        const result = validateIceSlideStageQuality(
            {
                id: 'order',
                rows: SOLVABLE,
                objectiveIds: ['no_falls', 'collect_all_crystals'],
            },
            defaultConstraints
        )
        expect(result.accepted).toBe(false)
        if (result.accepted === false) {
            expect(result.reason).toBe('objective_infeasible')
            expect(result.message).toMatch(/hazard/)
        }
    })
})

describe('ice-slide stage quality: stop/hazard policy', () => {
    const candidate = {
        id: 'stop-policy',
        rows: SOLVABLE,
        objectiveIds: [],
    }
    const hazardCandidate = {
        id: 'hazard-policy',
        rows: HAZARD_BOARD,
        objectiveIds: [],
    }

    it('rejects a board whose reachable stops fall below the floor', () => {
        expect(
            validateIceSlideStageQuality(candidate, {
                parBand: { minMoves: 1, maxMoves: 20 },
                maxStates: 10_000,
                minReachableStops: 999,
            })
        ).toMatchObject({
            accepted: false,
            reason: 'reachable_stops_below_min',
        })
    })

    it('rejects a board whose hazards exceed the ceiling', () => {
        expect(
            validateIceSlideStageQuality(hazardCandidate, {
                parBand: { minMoves: 1, maxMoves: 20 },
                maxStates: 10_000,
                maxHazards: 0,
            })
        ).toMatchObject({
            accepted: false,
            reason: 'too_many_hazards',
        })
    })

    it('checks the par band before the stop/hazard policy', () => {
        expect(
            validateIceSlideStageQuality(hazardCandidate, {
                parBand: { minMoves: 5, maxMoves: 10 },
                maxStates: 10_000,
                minReachableStops: 999,
                maxHazards: 0,
            })
        ).toMatchObject({
            accepted: false,
            reason: 'par_out_of_band',
        })
    })

    it('checks the stop floor before the hazard ceiling and objectives', () => {
        expect(
            validateIceSlideStageQuality(hazardCandidate, {
                parBand: { minMoves: 1, maxMoves: 20 },
                maxStates: 10_000,
                minReachableStops: 999,
                maxHazards: 0,
            })
        ).toMatchObject({
            accepted: false,
            reason: 'reachable_stops_below_min',
        })
        expect(
            validateIceSlideStageQuality(
                {
                    id: 'stop-before-objective',
                    rows: SOLVABLE,
                    objectiveIds: ['no_falls'],
                },
                {
                    parBand: { minMoves: 1, maxMoves: 20 },
                    maxStates: 10_000,
                    minReachableStops: 999,
                }
            )
        ).toMatchObject({
            accepted: false,
            reason: 'reachable_stops_below_min',
        })
    })

    it('checks the hazard ceiling before objective feasibility', () => {
        expect(
            validateIceSlideStageQuality(
                {
                    id: 'hazard-before-objective',
                    rows: HAZARD_BOARD,
                    objectiveIds: ['collect_all_crystals'],
                },
                {
                    parBand: { minMoves: 1, maxMoves: 20 },
                    maxStates: 10_000,
                    maxHazards: 0,
                }
            )
        ).toMatchObject({
            accepted: false,
            reason: 'too_many_hazards',
        })
    })
})

describe('ice-slide stage quality: accepted candidates', () => {
    it('accepts a snow stop with the corresponding par', () => {
        const result = validateIceSlideStageQuality(
            {
                id: 'snow-quality',
                rows: ['######', '#S.NG#', '######'],
                objectiveIds: [],
            },
            {
                parBand: { minMoves: 2, maxMoves: 2 },
                maxStates: 32,
            }
        )

        expect(result.accepted).toBe(true)
        if (result.accepted) {
            expect(result.parMoves).toBe(2)
        }
    })

    it('accepts a valid board with par, key, feasibility, and solve result', () => {
        const result = validateIceSlideStageQuality(
            {
                id: 'valid',
                rows: CRYSTAL_BOARD,
                objectiveIds: ['collect_all_crystals'],
            },
            { parBand: { minMoves: 2, maxMoves: 2 }, maxStates: 64 }
        )
        expect(result.accepted).toBe(true)
        if (result.accepted === true) {
            expect(result.parMoves).toBe(2)
            expect(result.canonicalKey).toBe(serializeBoardRows(CRYSTAL_BOARD))
            expect(result.objectiveFeasibility).toEqual({
                collect_all_crystals: true,
                no_falls: false,
                no_reset: true,
            })
            expect(result.solveResult.solvable).toBe(true)
            expect(result.solveResult.minMoves).toBe(2)
            expect(result.objectiveFeasibility).toEqual(
                getIceSlideObjectiveFeasibility(
                    CRYSTAL_BOARD,
                    result.solveResult
                )
            )
        }
    })

    it('accepts a known campaign level within its par band', () => {
        const level = ICE_SLIDE_LEVELS[0]
        const result = validateIceSlideStageQuality(
            { id: level.id, rows: level.rows, objectiveIds: [] },
            { parBand: { minMoves: 1, maxMoves: 1 }, maxStates: 64 }
        )
        expect(result.accepted).toBe(true)
        if (result.accepted === true) {
            expect(result.parMoves).toBe(1)
            expect(result.canonicalKey).toBe(serializeBoardRows(level.rows))
        }
    })

    it('accepts no_falls on a hazard board and records the feasibility', () => {
        const result = validateIceSlideStageQuality(
            { id: 'hazard', rows: HAZARD_BOARD, objectiveIds: ['no_falls'] },
            { parBand: { minMoves: 2, maxMoves: 2 }, maxStates: 64 }
        )
        expect(result.accepted).toBe(true)
        if (result.accepted === true) {
            expect(result.parMoves).toBe(2)
            expect(result.objectiveFeasibility.no_falls).toBe(true)
        }
    })

    it('accepts a fragile board using the stateful solver result', () => {
        const result = validateIceSlideStageQuality(
            {
                id: 'fragile-quality',
                rows: FRAGILE_MASK_BOARD,
                objectiveIds: [],
            },
            {
                parBand: { minMoves: 6, maxMoves: 6 },
                maxStates: 10_000,
            }
        )

        expect(result.accepted).toBe(true)
        if (result.accepted) {
            expect(result.parMoves).toBe(6)
            expect(result.solveResult.truncated).toBe(false)
        }
    })
})
