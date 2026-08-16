import { describe, expect, it, vi } from 'vitest'
import { hashString32Hex } from '../shared/seeded-rng'
import { ICE_SLIDE_EXPEDITION_GENERATOR_VERSION } from './generator'
import {
    ICE_SLIDE_RULESET_VERSION,
    ICE_SLIDE_RUN_SCHEMA_VERSION,
    assertValidIceSlideRunDefinition,
    createCampaignRunDefinition,
} from './run'
import { createIceSlideDailyRunDefinition } from './daily'
import {
    ICE_SLIDE_EXPEDITION_RISK_MULTIPLIER_BPS,
    ICE_SLIDE_EXPEDITION_RULESET_VERSION,
    ICE_SLIDE_EXPEDITION_STAGE_DIFFICULTIES,
    applyIceSlideExpeditionRouteChoice,
    createIceSlideExpeditionRunDefinition,
    type IceSlideExpeditionChoiceStage,
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

    it('applies deterministic Safe and Risk route effects after stages 2 and 4', () => {
        const base = createIceSlideExpeditionRunDefinition('route-effect-seed')

        for (const afterStageNumber of [2, 4] as const) {
            const safe = applyIceSlideExpeditionRouteChoice(
                base,
                afterStageNumber,
                'safe'
            )
            expect(safe.undoChargesGranted).toBe(1)
            expect(safe.run.stages[afterStageNumber]).toEqual(
                base.stages[afterStageNumber]
            )
            expect(base.stages[afterStageNumber].scoreMultiplierBps).toBe(
                10_000
            )

            const riskyA = applyIceSlideExpeditionRouteChoice(
                base,
                afterStageNumber,
                'risky'
            )
            const riskyB = applyIceSlideExpeditionRouteChoice(
                base,
                afterStageNumber,
                'risky'
            )
            expect(riskyA).toEqual(riskyB)
            expect(riskyA.undoChargesGranted).toBe(0)
            expect(
                riskyA.run.stages[afterStageNumber].objectiveIds
            ).toHaveLength(2)
            expect(
                new Set(riskyA.run.stages[afterStageNumber].objectiveIds).size
            ).toBe(2)
            expect(riskyA.run.stages[afterStageNumber].scoreMultiplierBps).toBe(
                ICE_SLIDE_EXPEDITION_RISK_MULTIPLIER_BPS
            )
            expect(riskyA.run.stages[afterStageNumber].signature).not.toBe(
                base.stages[afterStageNumber].signature
            )
            expect(base.stages[afterStageNumber].objectiveIds).toHaveLength(1)
        }
    })

    it('rejects non-Expedition, malformed checkpoint, and unseeded inputs without mutation', () => {
        const campaign = createCampaignRunDefinition()
        const campaignBefore = JSON.stringify(campaign)
        expect(() =>
            applyIceSlideExpeditionRouteChoice(campaign, 2, 'safe')
        ).toThrow('route choices require a seeded Expedition run')
        expect(JSON.stringify(campaign)).toBe(campaignBefore)

        const daily = createIceSlideDailyRunDefinition('2026-08-12')
        const dailyBefore = JSON.stringify(daily)
        expect(() =>
            applyIceSlideExpeditionRouteChoice(daily, 2, 'safe')
        ).toThrow('route choices require a seeded Expedition run')
        expect(JSON.stringify(daily)).toBe(dailyBefore)

        const malformedCheckpoint = createIceSlideExpeditionRunDefinition(
            'route-effect-invalid-checkpoint'
        )
        const malformedBefore = JSON.stringify(malformedCheckpoint)
        expect(() =>
            applyIceSlideExpeditionRouteChoice(
                malformedCheckpoint,
                3 as unknown as IceSlideExpeditionChoiceStage,
                'safe'
            )
        ).toThrow()
        expect(JSON.stringify(malformedCheckpoint)).toBe(malformedBefore)

        const unseeded = createIceSlideExpeditionRunDefinition(
            'route-effect-null-seed'
        )
        unseeded.seed = null
        const unseededBefore = JSON.stringify(unseeded)
        expect(() =>
            applyIceSlideExpeditionRouteChoice(unseeded, 2, 'safe')
        ).toThrow()
        expect(JSON.stringify(unseeded)).toBe(unseededBefore)
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
