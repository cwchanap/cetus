import { describe, expect, it } from 'vitest'
import { hashString32Hex } from '../shared/seeded-rng'
import { ICE_SLIDE_LEVELS } from './levels'
import {
    CAMPAIGN_RUN_KEY,
    ICE_SLIDE_CAMPAIGN_GENERATOR_VERSION,
    ICE_SLIDE_RULESET_VERSION,
    ICE_SLIDE_RUN_SCHEMA_VERSION,
    assertValidIceSlideRunDefinition,
    cloneIceSlideRunDefinition,
    createCampaignRunDefinition,
    createIceSlideStageSignature,
} from './run'

describe('Ice Slide run versions and signatures', () => {
    it('derives the Campaign key from mode-specific versions', () => {
        expect(ICE_SLIDE_RUN_SCHEMA_VERSION).toBe(1)
        expect(ICE_SLIDE_CAMPAIGN_GENERATOR_VERSION).toBe(1)
        expect(ICE_SLIDE_RULESET_VERSION).toBe(1)
        expect(CAMPAIGN_RUN_KEY).toBe('ice-slide:campaign:g1:r1')
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

function cloneRun(
    run = createCampaignRunDefinition()
): ReturnType<typeof createCampaignRunDefinition> {
    return structuredClone(run)
}

it('accepts the Campaign run', () => {
    expect(() =>
        assertValidIceSlideRunDefinition(createCampaignRunDefinition())
    ).not.toThrow()
})

it.each([
    [
        'bad key characters',
        (run: ReturnType<typeof createCampaignRunDefinition>) => {
            run.runKey = 'ice slide'
        },
    ],
    [
        'version mismatch',
        (run: ReturnType<typeof createCampaignRunDefinition>) => {
            run.runKey = 'ice-slide:campaign:g2:r1'
        },
    ],
    [
        'Campaign seed',
        (run: ReturnType<typeof createCampaignRunDefinition>) => {
            run.seed = 'not-null'
        },
    ],
    [
        'too many stages',
        (run: ReturnType<typeof createCampaignRunDefinition>) => {
            run.stages = Array.from({ length: 65 }, (_, index) => ({
                ...structuredClone(run.stages[0]),
                id: `campaign:${index + 1}`,
            }))
        },
    ],
    [
        'multiplier below band',
        (run: ReturnType<typeof createCampaignRunDefinition>) => {
            run.stages[0].scoreMultiplierBps = 999
        },
    ],
    [
        'multiplier above band',
        (run: ReturnType<typeof createCampaignRunDefinition>) => {
            run.stages[0].scoreMultiplierBps = 50001
        },
    ],
] as const)('rejects %s', (_name, mutate) => {
    const run = cloneRun()
    mutate(run)
    expect(() => assertValidIceSlideRunDefinition(run)).toThrow()
})

it('validates a Daily key/date/seed relationship', () => {
    const run = cloneRun()
    run.mode = 'daily'
    run.generatorVersion = 3
    run.rulesetVersion = 2
    run.runKey = 'ice-slide:daily:2026-08-02:g3:r2'
    run.seed = 'ice-slide:daily:3:2:2026-08-02'
    expect(() => assertValidIceSlideRunDefinition(run)).not.toThrow()
})

it('validates an Expedition key against the seed hash', () => {
    const run = cloneRun()
    run.mode = 'expedition'
    run.generatorVersion = 4
    run.rulesetVersion = 2
    run.seed = 'ice-slide:expedition:sample-seed'
    run.runKey = `ice-slide:expedition:${hashString32Hex(run.seed)}:` + 'g4:r2'

    expect(() => assertValidIceSlideRunDefinition(run)).not.toThrow()
})

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
