import { describe, expect, it } from 'vitest'
import { hashString32Hex } from '../shared/seeded-rng'
import { ICE_SLIDE_LEVELS } from './levels'
import {
    CAMPAIGN_RUN_KEY,
    ICE_SLIDE_CAMPAIGN_GENERATOR_VERSION,
    ICE_SLIDE_RULESET_VERSION,
    ICE_SLIDE_RUN_SCHEMA_VERSION,
    assertValidIceSlideUtcDateKey,
    assertValidIceSlideRunDefinition,
    cloneIceSlideRunDefinition,
    createCampaignRunDefinition,
    createIceSlideStageSignature,
} from './run'
import type { IceSlideObjectiveId, IceSlideRunDefinition } from './types'

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
                transform: 'identity',
                mutationIds: [],
                difficulty: 'tutorial',
                objectiveIds: [],
                scoreMultiplierBps: 10000,
            })
        ).toBe('is2-d1feaba1')
    })

    it('distinguishes mutation id lists that share a comma-joined form', () => {
        const common = {
            rows: ICE_SLIDE_LEVELS[0].rows,
            parMoves: 1,
            transform: 'identity' as const,
            difficulty: 'tutorial' as const,
            objectiveIds: [] as IceSlideObjectiveId[],
            scoreMultiplierBps: 10000,
        }
        const commaFirst = createIceSlideStageSignature({
            ...common,
            mutationIds: ['a,b', 'c'],
        })
        const commaSecond = createIceSlideStageSignature({
            ...common,
            mutationIds: ['a', 'b,c'],
        })
        expect(commaFirst).not.toBe(commaSecond)
    })

    it('validates exact UTC calendar date keys', () => {
        expect(() => assertValidIceSlideUtcDateKey('2026-08-12')).not.toThrow()
        expect(() => assertValidIceSlideUtcDateKey('2026-02-29')).toThrow(
            RangeError
        )
        expect(() => assertValidIceSlideUtcDateKey('2024-02-29')).not.toThrow()
        expect(() => assertValidIceSlideUtcDateKey('2026-13-01')).toThrow(
            RangeError
        )
        expect(() => assertValidIceSlideUtcDateKey('08-12-2026')).toThrow(
            RangeError
        )
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
            expect(stage.signature).toMatch(/^is2-[0-9a-f]{8}$/)
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
        'runKey must be transport-safe',
    ],
    [
        'version mismatch',
        (run: ReturnType<typeof createCampaignRunDefinition>) => {
            run.generatorVersion = 2
        },
        'campaign versions must match the campaign runKey',
    ],
    [
        'Campaign seed',
        (run: ReturnType<typeof createCampaignRunDefinition>) => {
            run.seed = 'not-null'
        },
        'campaign seed must be null',
    ],
    [
        'too many stages',
        (run: ReturnType<typeof createCampaignRunDefinition>) => {
            run.stages = Array.from({ length: 65 }, (_, index) => ({
                ...structuredClone(run.stages[0]),
                id: `campaign:${index + 1}`,
            }))
        },
        'run must contain between 1 and 64 stages',
    ],
    [
        'multiplier below band',
        (run: ReturnType<typeof createCampaignRunDefinition>) => {
            run.stages[0].scoreMultiplierBps = 999
        },
        'scoreMultiplierBps must be an integer from 1000 through 50000',
    ],
    [
        'multiplier above band',
        (run: ReturnType<typeof createCampaignRunDefinition>) => {
            run.stages[0].scoreMultiplierBps = 50001
        },
        'scoreMultiplierBps must be an integer from 1000 through 50000',
    ],
    [
        'fractional multiplier',
        (run: ReturnType<typeof createCampaignRunDefinition>) => {
            run.stages[0].scoreMultiplierBps = 10000.5
        },
        'scoreMultiplierBps must be an integer from 1000 through 50000',
    ],
    [
        'unknown glyph',
        (run: ReturnType<typeof createCampaignRunDefinition>) => {
            run.stages[0].rows = ['#####', '#S..#', '#Z..#', '#G..#', '#####']
            run.stages[0].signature = createIceSlideStageSignature(
                run.stages[0]
            )
        },
        'unknown stage glyph',
    ],
    [
        'non-rectangular rows',
        (run: ReturnType<typeof createCampaignRunDefinition>) => {
            run.stages[0].rows = ['#####', '#S..#', '###', '#G..#', '#####']
        },
        'stage rows must be rectangular',
    ],
    [
        'signature mismatch',
        (run: ReturnType<typeof createCampaignRunDefinition>) => {
            run.stages[0].signature = 'is2-deadbeef'
        },
        'stage signature does not match its definition',
    ],
    [
        'duplicate stage IDs',
        (run: ReturnType<typeof createCampaignRunDefinition>) => {
            run.stages[1] = structuredClone(run.stages[0])
        },
        'stage ids must contain unique non-empty values',
    ],
    [
        'unknown objective',
        (run: ReturnType<typeof createCampaignRunDefinition>) => {
            run.stages[0].objectiveIds = ['no_falls', 'unknown' as never]
            run.stages[0].signature = createIceSlideStageSignature(
                run.stages[0]
            )
        },
        'unknown objective "unknown"',
    ],
    [
        'daily seed mismatch',
        (run: ReturnType<typeof createCampaignRunDefinition>) => {
            run.mode = 'daily'
            run.runKey = 'ice-slide:daily:2026-08-03:g1:r1'
            run.seed = 'ice-slide:daily:1:1:2026-08-04'
        },
        'daily seed must match the runKey date and versions',
    ],
    [
        'expedition hash mismatch',
        (run: ReturnType<typeof createCampaignRunDefinition>) => {
            run.mode = 'expedition'
            run.runKey = 'ice-slide:expedition:deadbeef:g1:r1'
            run.seed = 'test-seed'
        },
        'expedition runKey hash must equal hashString32Hex(seed)',
    ],
] as const)('rejects %s', (_name, mutate, message) => {
    const run = cloneRun()
    mutate(run)
    expect(() => assertValidIceSlideRunDefinition(run)).toThrow(message)
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

function makeDailyRun(): IceSlideRunDefinition {
    const run = cloneRun()
    run.mode = 'daily'
    run.generatorVersion = 3
    run.rulesetVersion = 2
    run.runKey = 'ice-slide:daily:2026-08-02:g3:r2'
    run.seed = 'ice-slide:daily:3:2:2026-08-02'
    return run
}

function makeExpeditionRun(
    seed = 'ice-slide:expedition:sample-seed'
): IceSlideRunDefinition {
    const run = cloneRun()
    run.mode = 'expedition'
    run.generatorVersion = 4
    run.rulesetVersion = 2
    run.seed = seed
    run.runKey = `ice-slide:expedition:${hashString32Hex(seed)}:g4:r2`
    return run
}

describe('assertValidIceSlideRunDefinition rejections', () => {
    it.each([
        [
            'schemaVersion mismatch',
            (run: ReturnType<typeof cloneRun>) => {
                run.schemaVersion = 2 as 1
            },
            'schemaVersion must be 1',
        ],
        [
            'generatorVersion not a positive int',
            (run: ReturnType<typeof cloneRun>) => {
                run.generatorVersion = 0
            },
            'generatorVersion must be a positive signed integer',
        ],
        [
            'rulesetVersion not a positive int',
            (run: ReturnType<typeof cloneRun>) => {
                run.rulesetVersion = -1
            },
            'rulesetVersion must be a positive signed integer',
        ],
        [
            'generatorVersion non-integer',
            (run: ReturnType<typeof cloneRun>) => {
                run.generatorVersion = 1.5
            },
            'generatorVersion must be a positive signed integer',
        ],
        [
            'unknown run mode',
            (run: ReturnType<typeof cloneRun>) => {
                run.mode = 'arcade' as 'campaign'
            },
            'unknown run mode "arcade"',
        ],
        [
            'campaign generatorVersion mismatch',
            (run: ReturnType<typeof cloneRun>) => {
                run.generatorVersion = 2
            },
            'campaign versions must match the campaign runKey',
        ],
        [
            'campaign rulesetVersion mismatch',
            (run: ReturnType<typeof cloneRun>) => {
                run.rulesetVersion = 2
            },
            'campaign versions must match the campaign runKey',
        ],
        [
            'duplicate stage ids',
            (run: ReturnType<typeof cloneRun>) => {
                run.stages[1].id = run.stages[0].id
            },
            'stage ids must contain unique non-empty values',
        ],
        [
            'empty stage id',
            (run: ReturnType<typeof cloneRun>) => {
                run.stages[0].id = ''
            },
            'stage ids must contain unique non-empty values',
        ],
        [
            'unknown stage difficulty',
            (run: ReturnType<typeof cloneRun>) => {
                run.stages[0].difficulty = 'impossible' as 'easy'
            },
            'unknown stage difficulty "impossible"',
        ],
        [
            'unknown stage transform',
            (run: ReturnType<typeof cloneRun>) => {
                run.stages[0].transform = 'flip' as 'identity'
            },
            'unknown stage transform "flip"',
        ],
        [
            'empty stage rows',
            (run: ReturnType<typeof cloneRun>) => {
                run.stages[0].rows = []
            },
            'stage rows must not be empty',
        ],
        [
            'non-rectangular stage rows',
            (run: ReturnType<typeof cloneRun>) => {
                run.stages[0].rows = ['###', '##']
            },
            'stage rows must be rectangular',
        ],
        [
            'unknown stage glyph',
            (run: ReturnType<typeof cloneRun>) => {
                run.stages[0].rows = ['###', '#X#', '###']
            },
            'unknown stage glyph "X"',
        ],
        [
            'parMoves not a positive int',
            (run: ReturnType<typeof cloneRun>) => {
                run.stages[0].parMoves = 0
            },
            'parMoves must be a positive signed integer',
        ],
        [
            'duplicate mutation ids',
            (run: ReturnType<typeof cloneRun>) => {
                run.stages[0].mutationIds = ['m:a', 'm:a']
            },
            'mutation ids must contain unique non-empty values',
        ],
        [
            'empty mutation id',
            (run: ReturnType<typeof cloneRun>) => {
                run.stages[0].mutationIds = ['m:a', '']
            },
            'mutation ids must contain unique non-empty values',
        ],
        [
            'duplicate objective ids',
            (run: ReturnType<typeof cloneRun>) => {
                run.stages[0].objectiveIds = ['no_falls', 'no_falls']
            },
            'objective ids must contain unique non-empty values',
        ],
        [
            'unknown objective id',
            (run: ReturnType<typeof cloneRun>) => {
                run.stages[0].objectiveIds = ['no_falls', 'bogus' as 'no_falls']
            },
            'unknown objective "bogus"',
        ],
        [
            'stage signature mismatch',
            (run: ReturnType<typeof cloneRun>) => {
                run.stages[0].parMoves = 999
            },
            'stage signature does not match its definition',
        ],
    ] as const)('rejects %s', (_name, mutate, message) => {
        const run = cloneRun()
        mutate(run)
        expect(() => assertValidIceSlideRunDefinition(run)).toThrow(message)
    })
})

describe('Daily run key validation', () => {
    it.each([
        [
            'malformed daily key',
            (run: ReturnType<typeof makeDailyRun>) => {
                run.runKey = 'ice-slide:daily:bad'
            },
            'daily runKey must match the daily key format',
        ],
        [
            'daily generatorVersion mismatch',
            (run: ReturnType<typeof makeDailyRun>) => {
                run.generatorVersion = 5
            },
            'daily generatorVersion must match the runKey',
        ],
        [
            'daily rulesetVersion mismatch',
            (run: ReturnType<typeof makeDailyRun>) => {
                run.rulesetVersion = 5
            },
            'daily rulesetVersion must match the runKey',
        ],
        [
            'daily seed mismatch',
            (run: ReturnType<typeof makeDailyRun>) => {
                run.seed = 'ice-slide:daily:3:2:2026-08-99'
            },
            'daily seed must match the runKey date and versions',
        ],
        [
            'daily calendar-invalid date',
            (run: ReturnType<typeof makeDailyRun>) => {
                run.runKey = 'ice-slide:daily:2026-02-30:g3:r2'
                run.seed = 'ice-slide:daily:3:2:2026-02-30'
            },
            'daily runKey date must be a calendar-valid YYYY-MM-DD date',
        ],
    ] as const)('rejects %s', (_name, mutate, message) => {
        const run = makeDailyRun()
        mutate(run)
        expect(() => assertValidIceSlideRunDefinition(run)).toThrow(message)
    })
})

describe('Expedition run key validation', () => {
    it.each([
        [
            'malformed expedition key',
            (run: ReturnType<typeof makeExpeditionRun>) => {
                run.runKey = 'ice-slide:expedition:bad'
            },
            'expedition runKey must match the expedition key format',
        ],
        [
            'expedition generatorVersion mismatch',
            (run: ReturnType<typeof makeExpeditionRun>) => {
                run.generatorVersion = 99
            },
            'expedition generatorVersion must match the runKey',
        ],
        [
            'expedition rulesetVersion mismatch',
            (run: ReturnType<typeof makeExpeditionRun>) => {
                run.rulesetVersion = 99
            },
            'expedition rulesetVersion must match the runKey',
        ],
        [
            'null expedition seed',
            (run: ReturnType<typeof makeExpeditionRun>) => {
                run.seed = null
            },
            'expedition seed must be non-empty without U+001F',
        ],
        [
            'empty expedition seed',
            (run: ReturnType<typeof makeExpeditionRun>) => {
                run.seed = ''
            },
            'expedition seed must be non-empty without U+001F',
        ],
        [
            'expedition seed with U+001F',
            (run: ReturnType<typeof makeExpeditionRun>) => {
                run.seed = 'a\u001fb'
            },
            'expedition seed must be non-empty without U+001F',
        ],
        [
            'expedition hash mismatch',
            (run: ReturnType<typeof makeExpeditionRun>) => {
                run.seed = 'different-seed'
            },
            'expedition runKey hash must equal hashString32Hex(seed)',
        ],
    ] as const)('rejects %s', (_name, mutate, message) => {
        const run = makeExpeditionRun()
        mutate(run)
        expect(() => assertValidIceSlideRunDefinition(run)).toThrow(message)
    })
})
