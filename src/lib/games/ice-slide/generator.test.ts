import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    createIceSlideExpeditionStage,
    type IceSlideGeneratedStage,
} from './generator'
import { validateIceSlideStageQuality } from './quality'
import {
    BOARD_TRANSFORMS,
    getUniqueBoardTransforms,
    transformRows,
} from './transforms'

vi.mock('./quality', async importOriginal => {
    const actual = await importOriginal<typeof import('./quality')>()
    return {
        ...actual,
        validateIceSlideStageQuality: vi.fn(
            actual.validateIceSlideStageQuality
        ),
    }
})

const { validateIceSlideStageQuality: realValidate } =
    await vi.importActual<typeof import('./quality')>('./quality')

const input = {
    seed: 'ice-slide:hpa-489:v1:easy',
    stageNumber: 1,
    difficulty: 'easy',
} as const

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
        validateMock.mockImplementation((candidate, constraints) => {
            if (String(candidate.id).includes(':attempt:')) {
                return {
                    accepted: false,
                    reason: 'unsolvable',
                    message: 'forced candidate rejection',
                }
            }
            return realValidate(candidate, constraints)
        })

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
})

describe('ice-slide expedition generation: generator-v1 goldens', () => {
    it('locks the easy generator-v1 golden', () => {
        expect(
            projectStage(
                createIceSlideExpeditionStage({
                    seed: 'ice-slide:hpa-489:v1:easy',
                    stageNumber: 1,
                    difficulty: 'easy',
                })
            )
        ).toEqual({
            rows: ['#####', '#.C.#', '#H.G#', '#S..#', '#####'],
            transform: 'reflect_horizontal',
            mutationIds: [
                'goal:east',
                'rocks:none',
                'hazards:west',
                'crystals:south-mid',
            ],
            objectiveIds: ['no_falls'],
            parMoves: 2,
            signature: 'is2-4c1bb3e2',
        })
    })

    it('locks the medium generator-v1 golden', () => {
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
                '########',
                '#..#..S#',
                '#H....##',
                '#..#.#.#',
                '#......#',
                '#..#...#',
                '#G.....#',
                '########',
            ],
            transform: 'rotate_90',
            mutationIds: [
                'goal:southeast',
                'rocks:none',
                'hazards:southwest',
                'crystals:none',
            ],
            objectiveIds: ['no_falls'],
            parMoves: 3,
            signature: 'is2-cadf4ffb',
        })
    })

    it('locks the hard generator-v1 golden', () => {
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
                '#.....#G#',
                '#.#.....#',
                '#.O#....#',
                '#.....#.#',
                '#....CH.#',
                '#S..#...#',
                '#########',
            ],
            transform: 'reflect_horizontal',
            mutationIds: [
                'goal:southeast',
                'rocks:center-west',
                'hazards:upper-east',
                'crystals:northeast',
            ],
            objectiveIds: ['no_falls'],
            parMoves: 5,
            signature: 'is2-40f46428',
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
