import { createSeededRng } from '../shared/seeded-rng'
import { ICE_SLIDE_LEVELS } from './levels'
import { validateIceSlideStageQuality } from './quality'
import {
    assertValidIceSlideRunDefinition,
    assertValidIceSlideUtcDateKey,
    createIceSlideStageSignature,
    ICE_SLIDE_RULESET_VERSION,
    ICE_SLIDE_RUN_SCHEMA_VERSION,
    CAMPAIGN_STAGE_DIFFICULTIES,
} from './run'
import { getUniqueBoardTransforms } from './transforms'
import type {
    IceSlideObjectiveId,
    IceSlideRunDefinition,
    IceSlideStageDefinition,
} from './types'

export const ICE_SLIDE_DAILY_GENERATOR_VERSION = 1
export const ICE_SLIDE_DAILY_SOLVER_MAX_STATES = 10_000
export const ICE_SLIDE_DAILY_STAGE_POOLS = [
    [1, 2],
    [2, 3],
    [3, 4, 5],
    [5, 6, 7],
    [7, 8],
] as const

const DAILY_OBJECTIVE_ORDER: readonly IceSlideObjectiveId[] = [
    'collect_all_crystals',
    'no_falls',
    'no_reset',
]

export function toIceSlideUtcDateKey(date: Date): string {
    const timestamp = date.getTime()
    if (Number.isNaN(timestamp)) {
        throw new RangeError('date must be valid')
    }

    const year = date.getUTCFullYear()
    if (year < 0 || year > 9999) {
        throw new RangeError('date must be representable as YYYY-MM-DD')
    }

    const dateKey = [
        String(year).padStart(4, '0'),
        String(date.getUTCMonth() + 1).padStart(2, '0'),
        String(date.getUTCDate()).padStart(2, '0'),
    ].join('-')
    assertValidIceSlideUtcDateKey(dateKey)
    return dateKey
}

export function createIceSlideDailyRunDefinition(
    dateKey: string
): IceSlideRunDefinition {
    assertValidIceSlideUtcDateKey(dateKey)

    const seed =
        `ice-slide:daily:${ICE_SLIDE_DAILY_GENERATOR_VERSION}:` +
        `${ICE_SLIDE_RULESET_VERSION}:${dateKey}`
    const rootRng = createSeededRng(seed)
    const acceptedCanonicalKeys = new Set<string>()
    const acceptedSourceIds = new Set<number>()
    const stages: IceSlideStageDefinition[] = []

    // Resolve every authored pool reference once before materialization so
    // that stale/missing level IDs are reported regardless of which
    // candidate the per-stage shuffle happens to visit first.
    const uniquePoolIds = new Set<number>()
    for (const pool of ICE_SLIDE_DAILY_STAGE_POOLS) {
        for (const templateId of pool) {
            uniquePoolIds.add(templateId)
        }
    }
    const resolvedSources = new Map<
        number,
        { source: (typeof ICE_SLIDE_LEVELS)[number]; sourceIndex: number }
    >()
    for (const templateId of uniquePoolIds) {
        const sourceIndex = ICE_SLIDE_LEVELS.findIndex(
            level => level.id === templateId
        )
        if (sourceIndex < 0) {
            throw new Error(
                `Daily pool references missing Ice Slide level ${templateId}`
            )
        }
        resolvedSources.set(templateId, {
            source: ICE_SLIDE_LEVELS[sourceIndex],
            sourceIndex,
        })
    }

    // Generator-v1 determinism invariants: the same dateKey must always
    // produce the same stage list. This depends on (1) ICE_SLIDE_DAILY_STAGE_POOLS
    // order, (2) the stable fork labels used for template/transform/objective
    // shuffles ("stage:N", "transform:ID", "objective"), (3) quality-rejection
    // decisions from validateIceSlideStageQuality, and (4) objective selection
    // via the deterministic pick from eligibleObjectives. Changing any of these
    // breaks historical daily-run reproducibility and bumps the generator version.
    for (const [stageIndex, pool] of ICE_SLIDE_DAILY_STAGE_POOLS.entries()) {
        const stageNumber = stageIndex + 1
        const stageRng = rootRng.fork(`stage:${stageNumber}`)
        const templateOrder = stageRng.fork('template').shuffle(pool)
        let materializedStage: IceSlideStageDefinition | null = null

        for (const templateId of templateOrder) {
            if (acceptedSourceIds.has(templateId)) {
                continue
            }
            const resolved = resolvedSources.get(templateId)
            if (!resolved) {
                continue
            }
            const { source, sourceIndex } = resolved
            const variantOrder = stageRng
                .fork(`transform:${source.id}`)
                .shuffle(getUniqueBoardTransforms(source.rows))

            for (const variant of variantOrder) {
                const quality = validateIceSlideStageQuality(
                    {
                        id: source.id,
                        rows: variant.rows,
                        objectiveIds: [],
                    },
                    {
                        parBand: {
                            minMoves: source.parMoves,
                            maxMoves: source.parMoves,
                        },
                        maxStates: ICE_SLIDE_DAILY_SOLVER_MAX_STATES,
                        existingCanonicalKeys: acceptedCanonicalKeys,
                    }
                )
                if (!quality.accepted) {
                    continue
                }

                const eligibleObjectives = DAILY_OBJECTIVE_ORDER.filter(
                    objectiveId => quality.objectiveFeasibility[objectiveId]
                )
                if (eligibleObjectives.length === 0) {
                    continue
                }
                const bonusObjective = stageRng
                    .fork('objective')
                    .pick(eligibleObjectives)

                const stage: IceSlideStageDefinition = {
                    id: `daily:${dateKey}:${stageNumber}`,
                    name: source.name,
                    templateId: `campaign:${source.id}`,
                    difficulty: CAMPAIGN_STAGE_DIFFICULTIES[sourceIndex],
                    rows: variant.rows,
                    parMoves: quality.parMoves,
                    transform: variant.transform,
                    mutationIds: [],
                    objectiveIds: [bonusObjective],
                    scoreMultiplierBps: 10_000,
                    signature: '',
                }
                stage.signature = createIceSlideStageSignature(stage)
                acceptedCanonicalKeys.add(quality.canonicalKey)
                acceptedSourceIds.add(source.id)
                materializedStage = stage
                break
            }

            if (materializedStage) {
                break
            }
        }

        if (!materializedStage) {
            throw new Error(
                `Daily stage ${stageNumber} has no eligible authored candidate`
            )
        }
        stages.push(materializedStage)
    }

    const run: IceSlideRunDefinition = {
        schemaVersion: ICE_SLIDE_RUN_SCHEMA_VERSION,
        generatorVersion: ICE_SLIDE_DAILY_GENERATOR_VERSION,
        rulesetVersion: ICE_SLIDE_RULESET_VERSION,
        mode: 'daily',
        runKey: `ice-slide:daily:${dateKey}:g${ICE_SLIDE_DAILY_GENERATOR_VERSION}:r${ICE_SLIDE_RULESET_VERSION}`,
        seed,
        stages,
    }
    assertValidIceSlideRunDefinition(run)
    return run
}
