import { describe, expect, it, vi } from 'vitest'
import { hashString32Hex } from '../shared/seeded-rng'
import { ICE_SLIDE_EXPEDITION_GENERATOR_VERSION } from './generator'
import {
    ICE_SLIDE_RULESET_VERSION,
    ICE_SLIDE_RUN_SCHEMA_VERSION,
    assertValidIceSlideRunDefinition,
} from './run'
import {
    ICE_SLIDE_EXPEDITION_RULESET_VERSION,
    ICE_SLIDE_EXPEDITION_STAGE_DIFFICULTIES,
    createIceSlideExpeditionRunDefinition,
} from './expedition'
import { getBoardOrbitKey } from './transforms'
import type { IceSlideStageDefinition } from './types'

const SEED = '00112233445566778899aabbccddeeff'

describe('Ice Slide Expedition run materialization', () => {
    it('materializes the same six-stage run for the same seed', () => {
        const first = createIceSlideExpeditionRunDefinition(SEED)
        const second = createIceSlideExpeditionRunDefinition(SEED)
        expect(second).toEqual(first)
        expect(first.mode).toBe('expedition')
        expect(first.seed).toBe(SEED)
        expect(first.stages).toHaveLength(6)
    })

    it('uses the fixed 2/2/2 order with six unique board orbits', () => {
        const run = createIceSlideExpeditionRunDefinition(SEED)
        expect(
            run.stages.map((stage: IceSlideStageDefinition) => stage.difficulty)
        ).toEqual(['easy', 'easy', 'medium', 'medium', 'hard', 'hard'])
        expect(
            new Set(
                run.stages.map((stage: IceSlideStageDefinition) =>
                    getBoardOrbitKey(stage.rows)
                )
            ).size
        ).toBe(6)
        expect(
            run.stages.map((stage: IceSlideStageDefinition) => stage.id)
        ).toEqual([
            'expedition:1',
            'expedition:2',
            'expedition:3',
            'expedition:4',
            'expedition:5',
            'expedition:6',
        ])
    })

    it('does not use Math.random', () => {
        const random = vi.spyOn(Math, 'random')
        createIceSlideExpeditionRunDefinition(SEED)
        expect(random).not.toHaveBeenCalled()
    })

    it('rejects an empty seed', () => {
        expect(() => createIceSlideExpeditionRunDefinition('')).toThrow(
            RangeError
        )
    })

    it('locks the run identity to the seed hash and current versions', () => {
        const run = createIceSlideExpeditionRunDefinition(SEED)

        expect(ICE_SLIDE_EXPEDITION_STAGE_DIFFICULTIES).toEqual([
            'easy',
            'easy',
            'medium',
            'medium',
            'hard',
            'hard',
        ])
        expect(run.schemaVersion).toBe(ICE_SLIDE_RUN_SCHEMA_VERSION)
        expect(ICE_SLIDE_EXPEDITION_GENERATOR_VERSION).toBe(2)
        expect(ICE_SLIDE_RULESET_VERSION).toBe(1)
        expect(ICE_SLIDE_EXPEDITION_RULESET_VERSION).toBe(2)
        expect(run.generatorVersion).toBe(
            ICE_SLIDE_EXPEDITION_GENERATOR_VERSION
        )
        expect(run.rulesetVersion).toBe(ICE_SLIDE_EXPEDITION_RULESET_VERSION)
        expect(run.runKey).toBe(
            `ice-slide:expedition:${hashString32Hex(SEED)}:` +
                `g${ICE_SLIDE_EXPEDITION_GENERATOR_VERSION}:` +
                `r${ICE_SLIDE_EXPEDITION_RULESET_VERSION}`
        )
        for (const stage of run.stages) {
            expect(stage.objectiveIds).toHaveLength(1)
        }
        expect(() => assertValidIceSlideRunDefinition(run)).not.toThrow()
    })

    it('materializes 500 valid unique complete runs', () => {
        for (let index = 0; index < 500; index++) {
            const seed = `hpa-490:full-run:${String(index).padStart(3, '0')}`
            const run = createIceSlideExpeditionRunDefinition(seed)

            expect(
                run.stages.map(
                    (stage: IceSlideStageDefinition) => stage.difficulty
                )
            ).toEqual(['easy', 'easy', 'medium', 'medium', 'hard', 'hard'])
            expect(run.stages).toHaveLength(6)
            expect(
                new Set(
                    run.stages.map((stage: IceSlideStageDefinition) =>
                        getBoardOrbitKey(stage.rows)
                    )
                ).size
            ).toBe(6)
            expect(() => assertValidIceSlideRunDefinition(run)).not.toThrow()
        }
    })
})
