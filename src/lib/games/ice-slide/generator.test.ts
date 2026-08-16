import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    createIceSlideExpeditionStage,
    ICE_SLIDE_EXPEDITION_SOLVER_MAX_STATES,
    type IceSlideGeneratedStage,
} from './generator'
import {
    getIceSlideObjectiveFeasibility,
    ICE_SLIDE_OBJECTIVE_IDS,
} from './objectives'
import {
    type IceSlideStageQualityCandidate,
    type IceSlideStageQualityConstraints,
    validateIceSlideStageQuality,
} from './quality'
import {
    getIceSlideFallback,
    getIceSlideTemplatesByDifficulty,
    type IceSlideTemplate,
} from './templates'
import {
    BOARD_TRANSFORMS,
    getUniqueBoardTransforms,
    transformRows,
} from './transforms'
import { solveIceSlideBoard } from './solver'

vi.mock('./quality', async importOriginal => {
    const actual = await importOriginal<typeof import('./quality')>()
    return {
        ...actual,
        validateIceSlideStageQuality: vi.fn(
            actual.validateIceSlideStageQuality
        ),
    }
})

vi.mock('./templates', async importOriginal => {
    const actual = await importOriginal<typeof import('./templates')>()
    return {
        ...actual,
        getIceSlideTemplatesByDifficulty: vi.fn(
            actual.getIceSlideTemplatesByDifficulty
        ),
    }
})

const { validateIceSlideStageQuality: realValidate } =
    await vi.importActual<typeof import('./quality')>('./quality')

/**
 * Crafted easy-tier template whose every goal alternative shares its cell
 * with every rock/hazard/crystal alternative, so any pick combination fails
 * materialization. fallbackVariantId resolves to the REAL easy-open-lane-v1
 * fallback board, so generation completes via the fallback path.
 */
const COLLISION_TRAP_TEMPLATE: IceSlideTemplate = {
    id: 'easy-collision-trap',
    name: 'Collision Trap',
    difficulty: 'easy',
    baseRows: ['#####', '#S..#', '#...#', '#...#', '#####'],
    allowedTransforms: [...BOARD_TRANSFORMS],
    slots: {
        goals: [
            { id: 'goal:one', position: { row: 1, col: 2 } },
            { id: 'goal:two', position: { row: 1, col: 2 } },
            { id: 'goal:three', position: { row: 1, col: 2 } },
        ],
        rocks: [
            { id: 'rocks:one', positions: [{ row: 1, col: 2 }] },
            { id: 'rocks:two', positions: [{ row: 1, col: 2 }] },
        ],
        hazards: [{ id: 'hazards:one', positions: [{ row: 1, col: 2 }] }],
        crystals: [{ id: 'crystals:one', positions: [{ row: 1, col: 2 }] }],
    },
    constraints: {
        parBand: { minMoves: 1, maxMoves: 4 },
        minReachableStops: 3,
        maxHazards: 1,
    },
    fallbackVariantId: 'easy-open-lane-v1',
}

/**
 * Crafted easy-tier template whose every crystal alternative has 2 cells and
 * every hazard alternative 1 cell, all on free ice and pairwise compatible,
 * so any pick combination materializes and passes quality with the full
 * selected pattern placed.
 */
const PATTERN_SELECT_TEMPLATE: IceSlideTemplate = {
    id: 'easy-pattern-select',
    name: 'Pattern Select',
    difficulty: 'easy',
    baseRows: ['#####', '#S..#', '#...#', '#...#', '#####'],
    allowedTransforms: [...BOARD_TRANSFORMS],
    slots: {
        goals: [
            { id: 'goal:a', position: { row: 3, col: 3 } },
            { id: 'goal:b', position: { row: 3, col: 3 } },
            { id: 'goal:c', position: { row: 3, col: 3 } },
        ],
        rocks: [{ id: 'rocks:none', positions: [] }],
        hazards: [
            { id: 'hazards:a', positions: [{ row: 1, col: 3 }] },
            { id: 'hazards:b', positions: [{ row: 2, col: 2 }] },
        ],
        crystals: [
            {
                id: 'crystals:a',
                positions: [
                    { row: 1, col: 2 },
                    { row: 3, col: 2 },
                ],
            },
            {
                id: 'crystals:b',
                positions: [
                    { row: 1, col: 2 },
                    { row: 2, col: 3 },
                ],
            },
            {
                id: 'crystals:c',
                positions: [
                    { row: 3, col: 2 },
                    { row: 2, col: 3 },
                ],
            },
        ],
    },
    constraints: {
        parBand: { minMoves: 1, maxMoves: 4 },
        minReachableStops: 3,
        maxHazards: 1,
    },
    fallbackVariantId: 'easy-open-lane-v1',
}

/**
 * Crafted non-square (4x5) template restricted to rotate_90. Every fork has
 * exactly one alternative, so the generated stage is fixed: the base rotates
 * to 5 rows x 4 cols and slot coordinates must swap dimensions correctly.
 */
const ROTATE_ONLY_TEMPLATE: IceSlideTemplate = {
    id: 'easy-rotate-only',
    name: 'Rotate Only',
    difficulty: 'easy',
    baseRows: ['#####', '#S...', '#....', '#####'],
    allowedTransforms: ['rotate_90'],
    slots: {
        goals: [{ id: 'goal:west', position: { row: 2, col: 1 } }],
        rocks: [{ id: 'rocks:none', positions: [] }],
        hazards: [{ id: 'hazards:south', positions: [{ row: 2, col: 3 }] }],
        crystals: [
            {
                id: 'crystals:pair',
                positions: [
                    { row: 1, col: 3 },
                    { row: 2, col: 4 },
                ],
            },
        ],
    },
    constraints: {
        parBand: { minMoves: 1, maxMoves: 6 },
        minReachableStops: 2,
        maxHazards: 1,
    },
    fallbackVariantId: 'easy-open-lane-v1',
}

const input = {
    seed: 'ice-slide:hpa-489:v1:easy',
    stageNumber: 1,
    difficulty: 'easy',
} as const

describe('ice-slide expedition generation: Risk capability', () => {
    it('generates at least two eligible objectives for stages 3 and 5', () => {
        const stage3 = createIceSlideExpeditionStage({
            seed: 'risk-stage-3',
            stageNumber: 3,
            difficulty: 'medium',
        })
        const stage5 = createIceSlideExpeditionStage({
            seed: 'risk-stage-5',
            stageNumber: 5,
            difficulty: 'hard',
        })

        for (const stage of [stage3, stage5]) {
            const solve = solveIceSlideBoard(stage.stage, {
                maxStates: ICE_SLIDE_EXPEDITION_SOLVER_MAX_STATES,
            })
            const feasibility = getIceSlideObjectiveFeasibility(
                stage.stage.rows,
                solve
            )
            expect(
                ICE_SLIDE_OBJECTIVE_IDS.filter(id => feasibility[id]).length
            ).toBeGreaterThanOrEqual(2)
        }
    })

    it('keeps ordinary stages valid with one selected objective', () => {
        const stage4 = createIceSlideExpeditionStage({
            seed: 'risk-stage-4',
            stageNumber: 4,
            difficulty: 'medium',
        })

        expect(stage4.stage.objectiveIds).toHaveLength(1)
    })

    it('counts valid one-objective candidates rejected for stage 3', () => {
        const stage3 = createIceSlideExpeditionStage({
            seed: 'risk-rejection-2',
            stageNumber: 3,
            difficulty: 'medium',
        })

        expect(
            stage3.rejectionCounts.insufficient_objective_options
        ).toBeGreaterThan(0)
    })
})

function orbitKey(rows: readonly string[]): string {
    return getUniqueBoardTransforms(rows)
        .map(variant => variant.canonicalKey)
        .sort()[0]
}

function projectStage(result: IceSlideGeneratedStage): object {
    const { rows, transform, mutationIds, objectiveIds, parMoves, signature } =
        result.stage
    return { rows, transform, mutationIds, objectiveIds, parMoves, signature }
}

function glyphCount(rows: readonly string[], glyph: string): number {
    return rows.join('').split(glyph).length - 1
}

afterEach(() => {
    vi.restoreAllMocks()
})

describe('ice-slide expedition generation: input and determinism', () => {
    it('rejects an empty seed', () => {
        expect(() =>
            createIceSlideExpeditionStage({
                seed: '',
                stageNumber: 1,
                difficulty: 'easy',
            })
        ).toThrow(RangeError)
        expect(() =>
            createIceSlideExpeditionStage({
                seed: '',
                stageNumber: 1,
                difficulty: 'easy',
            })
        ).toThrow('seed must be non-empty')
    })

    it('rejects invalid stage numbers', () => {
        for (const stageNumber of [
            0,
            -1,
            1.5,
            NaN,
            Number.MAX_SAFE_INTEGER + 1,
        ]) {
            expect(() =>
                createIceSlideExpeditionStage({
                    seed: 'ice-slide:hpa-489:v1:easy',
                    stageNumber,
                    difficulty: 'easy',
                })
            ).toThrow(RangeError)
            expect(() =>
                createIceSlideExpeditionStage({
                    seed: 'ice-slide:hpa-489:v1:easy',
                    stageNumber,
                    difficulty: 'easy',
                })
            ).toThrow('stageNumber must be a positive safe integer')
        }
    })

    it('produces identical output for repeated identical input', () => {
        const first = createIceSlideExpeditionStage(input)
        const second = createIceSlideExpeditionStage(input)
        expect(second).toEqual(first)
    })

    it('never draws from Math.random', () => {
        const random = vi.spyOn(Math, 'random').mockImplementation(() => {
            throw new Error('Math.random must not be called')
        })
        try {
            expect(() => createIceSlideExpeditionStage(input)).not.toThrow()
        } finally {
            random.mockRestore()
        }
    })
})

describe('ice-slide expedition generation: orbit keys', () => {
    it('returns the transform-invariant orbit key of the final board', () => {
        const result = createIceSlideExpeditionStage(input)
        const expected = orbitKey(result.stage.rows)
        const rotated = transformRows(result.stage.rows, 'rotate_90')

        expect(result.canonicalKey).toBe(expected)
        expect(orbitKey(rotated)).toBe(expected)
    })

    it('matches the orbit key for every transform variant of the board', () => {
        const result = createIceSlideExpeditionStage(input)
        for (const transform of BOARD_TRANSFORMS) {
            expect(orbitKey(transformRows(result.stage.rows, transform))).toBe(
                result.canonicalKey
            )
        }
    })

    it('rejects orbit duplicates without mutating the caller set', () => {
        const first = createIceSlideExpeditionStage(input)
        const existing = new Set([first.canonicalKey])
        const second = createIceSlideExpeditionStage({
            ...input,
            existingCanonicalKeys: existing,
        })

        expect(second.canonicalKey).not.toBe(first.canonicalKey)
        expect(existing).toEqual(new Set([first.canonicalKey]))
    })
})

describe('ice-slide expedition generation: fallback after 64 attempts', () => {
    it('uses a deterministic fallback with bounded candidate attempts', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const validateMock = vi.mocked(validateIceSlideStageQuality)
        validateMock.mockImplementation(
            (
                candidate: IceSlideStageQualityCandidate,
                constraints: IceSlideStageQualityConstraints
            ) => {
                if (String(candidate.id).includes(':attempt:')) {
                    return {
                        accepted: false,
                        reason: 'unsolvable',
                        message: 'forced candidate rejection',
                    }
                }
                return realValidate(candidate, constraints)
            }
        )

        try {
            const result = createIceSlideExpeditionStage({
                seed: 'ice-slide:hpa-489:v1:fallback:easy',
                stageNumber: 1,
                difficulty: 'easy',
            })

            const candidateQualityCalls = validateMock.mock.calls.filter(
                ([candidate]) => String(candidate.id).includes(':attempt:')
            ).length
            const collisionCount =
                result.rejectionCounts.materialization_collision ?? 0
            const fallbackCalls =
                validateMock.mock.calls.length - candidateQualityCalls

            expect(result.usedFallback).toBe(true)
            expect(result.attempts).toBe(64)
            expect(candidateQualityCalls + collisionCount).toBe(64)
            expect(fallbackCalls).toBeGreaterThanOrEqual(1)
            expect(fallbackCalls).toBeLessThanOrEqual(3)
            expect(result.stage.transform).toBe('identity')
            expect(result.stage.mutationIds[0]).toMatch(/^fallback:/)
            expect(warn).toHaveBeenCalledTimes(1)
        } finally {
            validateMock.mockRestore()
            warn.mockRestore()
        }
    })

    it('throws when every candidate and fallback is rejected', () => {
        const validateMock = vi.mocked(validateIceSlideStageQuality)
        validateMock.mockImplementation(() => ({
            accepted: false,
            reason: 'unsolvable',
            message: 'forced rejection',
        }))

        try {
            expect(() =>
                createIceSlideExpeditionStage({
                    seed: 'ice-slide:hpa-489:v1:fallback:all-reject',
                    stageNumber: 1,
                    difficulty: 'easy',
                })
            ).toThrow(/Ice Slide Expedition stage 1 \(easy\)/)
        } finally {
            validateMock.mockRestore()
        }
    })

    it('pins the exact accepted fallback id for a frozen seed', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const validateMock = vi.mocked(validateIceSlideStageQuality)
        validateMock.mockImplementation(
            (
                candidate: IceSlideStageQualityCandidate,
                constraints: IceSlideStageQualityConstraints
            ) => {
                if (String(candidate.id).includes(':attempt:')) {
                    return {
                        accepted: false,
                        reason: 'unsolvable',
                        message: 'forced candidate rejection',
                    }
                }
                return realValidate(candidate, constraints)
            }
        )

        try {
            const result = createIceSlideExpeditionStage({
                seed: 'ice-slide:hpa-489:v1:fallback:easy',
                stageNumber: 1,
                difficulty: 'easy',
            })

            expect(result.usedFallback).toBe(true)
            expect(result.stage.mutationIds).toEqual([
                'fallback:easy-open-lane-v1',
            ])
        } finally {
            validateMock.mockRestore()
            warn.mockRestore()
        }
    })

    it('warns only in development, never in production', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const validateMock = vi.mocked(validateIceSlideStageQuality)
        validateMock.mockImplementation(
            (
                candidate: IceSlideStageQualityCandidate,
                constraints: IceSlideStageQualityConstraints
            ) => {
                if (String(candidate.id).includes(':attempt:')) {
                    return {
                        accepted: false,
                        reason: 'unsolvable',
                        message: 'forced candidate rejection',
                    }
                }
                return realValidate(candidate, constraints)
            }
        )
        const fallbackInput = {
            seed: 'ice-slide:hpa-489:v1:fallback:easy',
            stageNumber: 1,
            difficulty: 'easy',
        } as const

        try {
            vi.stubEnv('DEV', true)
            expect(() =>
                createIceSlideExpeditionStage(fallbackInput)
            ).not.toThrow()
            expect(warn).toHaveBeenCalledTimes(1)

            warn.mockClear()
            vi.stubEnv('DEV', false)
            expect(() =>
                createIceSlideExpeditionStage(fallbackInput)
            ).not.toThrow()
            expect(warn).not.toHaveBeenCalled()
        } finally {
            vi.unstubAllEnvs()
            validateMock.mockRestore()
            warn.mockRestore()
        }
    })

    it('rejects an all-infeasible objective set with bounded retry and fallback', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const validateMock = vi.mocked(validateIceSlideStageQuality)
        validateMock.mockImplementation(
            (
                candidate: IceSlideStageQualityCandidate,
                constraints: IceSlideStageQualityConstraints
            ) => {
                const real = realValidate(candidate, constraints)
                if (!real.accepted) {
                    return real
                }
                return {
                    ...real,
                    objectiveFeasibility: {
                        collect_all_crystals: false,
                        no_falls: false,
                        no_reset: false,
                    },
                }
            }
        )

        try {
            expect(() =>
                createIceSlideExpeditionStage({
                    seed: 'ice-slide:hpa-489:v1:no-objective:easy',
                    stageNumber: 1,
                    difficulty: 'easy',
                })
            ).toThrow(/has no valid generated candidate or fallback/)
            expect(warn).not.toHaveBeenCalled()
        } finally {
            validateMock.mockRestore()
            warn.mockRestore()
        }
    })
})

describe('ice-slide expedition generation: forced materialization collisions', () => {
    it('rejects all 64 candidates by collision and completes via the real fallback', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const templatesMock = vi.mocked(getIceSlideTemplatesByDifficulty)
        const validateMock = vi.mocked(validateIceSlideStageQuality)
        templatesMock.mockImplementation(() => [COLLISION_TRAP_TEMPLATE])

        try {
            const result = createIceSlideExpeditionStage({
                seed: 'ice-slide:hpa-489:v1:forced-collision:easy',
                stageNumber: 1,
                difficulty: 'easy',
            })

            expect(result.usedFallback).toBe(true)
            expect(result.attempts).toBe(64)
            expect(result.rejectionCounts).toEqual({
                materialization_collision: 64,
            })
            expect(
                validateMock.mock.calls.filter(([candidate]) =>
                    String(candidate.id).includes(':attempt:')
                )
            ).toEqual([])
            expect(result.stage.mutationIds).toEqual([
                'fallback:easy-open-lane-v1',
            ])
            expect(result.stage.rows).toEqual([
                '#####',
                '#S..#',
                '#...#',
                '#G..#',
                '#####',
            ])
            // Returned rows are a copy, never the catalog-owned array.
            expect(result.stage.rows).not.toBe(
                getIceSlideFallback('easy-open-lane-v1').rows
            )
        } finally {
            templatesMock.mockRestore()
            validateMock.mockRestore()
            warn.mockRestore()
        }
    })

    it('produces byte-identical traces across repeated forced-fallback runs', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const templatesMock = vi.mocked(getIceSlideTemplatesByDifficulty)
        templatesMock.mockImplementation(() => [COLLISION_TRAP_TEMPLATE])

        try {
            const forcedFallbackInput = {
                seed: 'ice-slide:hpa-489:v1:forced-collision:easy',
                stageNumber: 1,
                difficulty: 'easy',
            } as const
            const first = createIceSlideExpeditionStage(forcedFallbackInput)
            const second = createIceSlideExpeditionStage(forcedFallbackInput)

            expect(first.usedFallback).toBe(true)
            expect(JSON.stringify(second)).toBe(JSON.stringify(first))
            expect(warn).toHaveBeenCalledTimes(2)
        } finally {
            templatesMock.mockRestore()
            warn.mockRestore()
        }
    })
})

describe('ice-slide expedition generation: complete pattern placement', () => {
    it('places every cell of the selected multi-position slot patterns', () => {
        const templatesMock = vi.mocked(getIceSlideTemplatesByDifficulty)
        templatesMock.mockImplementation(() => [PATTERN_SELECT_TEMPLATE])

        try {
            const result = createIceSlideExpeditionStage({
                seed: 'ice-slide:hpa-489:v1:pattern-select:easy',
                stageNumber: 1,
                difficulty: 'easy',
            })

            expect(result.usedFallback).toBe(false)
            expect(result.stage.mutationIds).toEqual([
                expect.stringMatching(/^goal:/),
                'rocks:none',
                expect.stringMatching(/^hazards:/),
                expect.stringMatching(/^crystals:/),
            ])
            expect(glyphCount(result.stage.rows, 'C')).toBe(2)
            expect(glyphCount(result.stage.rows, 'H')).toBe(1)
        } finally {
            templatesMock.mockRestore()
        }
    })

    it('maps slot coordinates across swapped non-square dimensions under rotate_90', () => {
        const templatesMock = vi.mocked(getIceSlideTemplatesByDifficulty)
        templatesMock.mockImplementation(() => [ROTATE_ONLY_TEMPLATE])

        try {
            const result = createIceSlideExpeditionStage({
                seed: 'ice-slide:hpa-489:v1:rotate-only:easy',
                stageNumber: 1,
                difficulty: 'easy',
            })

            expect(result.usedFallback).toBe(false)
            expect(result.stage.transform).toBe('rotate_90')
            // 4x5 base rotates to 5 rows x 4 cols; goal lands west of the
            // start, hazard and both crystals keep their authored cells.
            expect(result.stage.rows).toEqual([
                '####',
                '#GS#',
                '#..#',
                '#HC#',
                '#C.#',
            ])
            expect(glyphCount(result.stage.rows, 'G')).toBe(1)
            expect(glyphCount(result.stage.rows, 'H')).toBe(1)
            expect(glyphCount(result.stage.rows, 'C')).toBe(2)
        } finally {
            templatesMock.mockRestore()
        }
    })
})

describe('ice-slide expedition generation: generator-v2 goldens', () => {
    it('locks the easy generator-v2 golden', () => {
        expect(
            projectStage(
                createIceSlideExpeditionStage({
                    seed: 'ice-slide:hpa-489:v1:easy',
                    stageNumber: 1,
                    difficulty: 'easy',
                })
            )
        ).toEqual({
            rows: ['#####', '#S.C#', '#.O.#', '#G..#', '#####'],
            transform: 'identity',
            mutationIds: [
                'goal:south',
                'rocks:center',
                'hazards:none',
                'crystals:northeast',
            ],
            objectiveIds: ['collect_all_crystals'],
            parMoves: 1,
            signature: 'is2-c8600062',
        })
    })

    it('locks the medium generator-v2 golden', () => {
        expect(
            projectStage(
                createIceSlideExpeditionStage({
                    seed: 'ice-slide:hpa-489:v1:medium',
                    stageNumber: 3,
                    difficulty: 'medium',
                })
            )
        ).toEqual({
            rows: [
                '#########',
                '#...#...#',
                '#.O...H.#',
                '#G..#...#',
                '#.......#',
                '#.#....##',
                '#...#..S#',
                '#########',
            ],
            transform: 'reflect_anti_diagonal',
            mutationIds: [
                'goal:south-mid',
                'rocks:lower-east',
                'hazards:upper-east',
                'crystals:none',
            ],
            objectiveIds: ['no_reset'],
            parMoves: 6,
            signature: 'is2-f942214b',
        })
    })

    it('locks the hard generator-v2 golden', () => {
        expect(
            projectStage(
                createIceSlideExpeditionStage({
                    seed: 'ice-slide:hpa-489:v1:hard',
                    stageNumber: 5,
                    difficulty: 'hard',
                })
            )
        ).toEqual({
            rows: [
                '#########',
                '#.......#',
                '#.#.O.#.#',
                '#GC.....#',
                '##..H..##',
                '#.....C.#',
                '#.#.#...#',
                '#.....#S#',
                '#########',
            ],
            transform: 'rotate_180',
            mutationIds: [
                'goal:east-pocket',
                'rocks:lower-center',
                'hazards:center',
                'crystals:pair',
            ],
            objectiveIds: ['no_reset'],
            parMoves: 7,
            signature: 'is2-d01c6a81',
        })
    })

    it('keeps byte-repeat output for the hard seed', () => {
        const hardInput = {
            seed: 'ice-slide:hpa-489:v1:hard',
            stageNumber: 5,
            difficulty: 'hard',
        } as const
        const first = createIceSlideExpeditionStage(hardInput)
        const second = createIceSlideExpeditionStage(hardInput)
        expect(JSON.stringify(second)).toBe(JSON.stringify(first))
    })
})
