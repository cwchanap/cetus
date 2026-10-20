import {
    createIceSlideExpeditionStage,
    ICE_SLIDE_EXPEDITION_SOLVER_MAX_STATES,
    type IceSlideGeneratedStage,
    type IceSlideGenerationRejectionReason,
} from '../src/lib/games/ice-slide/generator'
import { ICE_SLIDE_OBJECTIVE_IDS } from '../src/lib/games/ice-slide/objectives'
import { validateIceSlideStageQuality } from '../src/lib/games/ice-slide/quality'
import { createIceSlideStageSignature } from '../src/lib/games/ice-slide/run'
import {
    getIceSlideTemplatesByDifficulty,
    type IceSlideTemplateDifficulty,
} from '../src/lib/games/ice-slide/templates'
import { getUniqueBoardTransforms } from '../src/lib/games/ice-slide/transforms'
import { pathToFileURL } from 'node:url'

export interface IceSlideExpeditionValidationStats {
    difficulty: IceSlideTemplateDifficulty
    seeds: number
    stageCount: number
    totalAttempts: number
    worstAttempts: number
    fallbacks: number
    rejectionCounts: Partial<Record<IceSlideGenerationRejectionReason, number>>
    worstExploredStates: number
}

const TIER_STAGES = {
    easy: [1, 2],
    medium: [3, 4],
    hard: [5, 6],
} as const

/**
 * Independent recompute of the board's transform-invariant identity: the
 * lexicographically smallest canonicalKey among all unique transforms of
 * the board. Must stay consistent with the canonicalKey returned by
 * createIceSlideExpeditionStage; kept local (not getBoardOrbitKey) so the
 * validation loop cross-checks the generator rather than sharing its helper.
 */
function orbitKey(rows: readonly string[]): string {
    return getUniqueBoardTransforms(rows)
        .map(variant => variant.canonicalKey)
        .sort()[0]
}

function assertResult(
    seed: string,
    stageNumber: number,
    result: IceSlideGeneratedStage,
    tierDifficulty: IceSlideTemplateDifficulty,
    existingCanonicalKeys?: ReadonlySet<string>
): number {
    const context = `seed ${seed} stage ${stageNumber}`
    const { stage } = result

    if (stage.id !== `expedition:${stageNumber}`) {
        throw new Error(
            `${context}: stage id ${stage.id} does not match ` +
                `expedition:${stageNumber}`
        )
    }
    if (stage.difficulty !== tierDifficulty) {
        throw new Error(
            `${context}: stage difficulty ${stage.difficulty} does not match ` +
                `tier ${tierDifficulty}`
        )
    }
    if (stage.scoreMultiplierBps !== 10_000) {
        throw new Error(
            `${context}: scoreMultiplierBps ${stage.scoreMultiplierBps} ` +
                'is not the expedition multiplier 10000'
        )
    }
    const expectedSignature = createIceSlideStageSignature({
        rows: stage.rows,
        parMoves: stage.parMoves,
        transform: stage.transform,
        mutationIds: stage.mutationIds,
        difficulty: stage.difficulty,
        objectiveIds: stage.objectiveIds,
        scoreMultiplierBps: stage.scoreMultiplierBps,
    })
    if (stage.signature !== expectedSignature) {
        throw new Error(
            `${context}: signature ${stage.signature} does not match ` +
                `recomputed ${expectedSignature}`
        )
    }

    const recomputedKey = orbitKey(stage.rows)
    if (recomputedKey !== result.canonicalKey) {
        throw new Error(
            `${context}: returned canonicalKey ${result.canonicalKey} ` +
                `does not match recomputed orbit key ${recomputedKey}`
        )
    }

    const regenerated = createIceSlideExpeditionStage({
        seed,
        stageNumber,
        difficulty: tierDifficulty,
        existingCanonicalKeys,
    })
    if (JSON.stringify(regenerated) !== JSON.stringify(result)) {
        throw new Error(`${context}: regeneration is not byte-identical`)
    }

    const template = getIceSlideTemplatesByDifficulty(tierDifficulty).find(
        candidate => candidate.id === stage.templateId
    )
    if (!template) {
        throw new Error(
            `${context}: no ${tierDifficulty} template ` + stage.templateId
        )
    }

    const quality = validateIceSlideStageQuality(
        {
            id: stage.id,
            rows: stage.rows,
            objectiveIds: stage.objectiveIds,
        },
        {
            parBand: template.constraints.parBand,
            maxStates: ICE_SLIDE_EXPEDITION_SOLVER_MAX_STATES,
            minReachableStops: template.constraints.minReachableStops,
            maxHazards: template.constraints.maxHazards,
        }
    )
    if (!quality.accepted) {
        throw new Error(
            `${context}: independent quality validation rejected ` +
                `(${quality.reason}): ${quality.message}`
        )
    }
    if (stageNumber === 3 || stageNumber === 5) {
        const eligibleCount = ICE_SLIDE_OBJECTIVE_IDS.filter(
            id => quality.objectiveFeasibility[id]
        ).length
        if (eligibleCount < 2) {
            throw new Error(
                `${context}: Risk target has only ${eligibleCount} eligible objectives`
            )
        }
    }
    if (quality.parMoves !== result.stage.parMoves) {
        throw new Error(
            `${context}: par mismatch: independent ${quality.parMoves} ` +
                `vs generated ${result.stage.parMoves}`
        )
    }
    if (!quality.solveResult.solvable || quality.solveResult.truncated) {
        throw new Error(
            `${context}: independent solve is not solvable within ` +
                `${ICE_SLIDE_EXPEDITION_SOLVER_MAX_STATES} states`
        )
    }
    return quality.solveResult.exploredStates
}

export function runIceSlideExpeditionValidation(options: {
    seedsPerTier: number
    onStage?: (stage: IceSlideGeneratedStage) => void
}): IceSlideExpeditionValidationStats[] {
    const { seedsPerTier, onStage } = options
    const summaries: IceSlideExpeditionValidationStats[] = []

    for (const difficulty of Object.keys(
        TIER_STAGES
    ) as IceSlideTemplateDifficulty[]) {
        const stageNumbers = TIER_STAGES[difficulty]
        const rejectionCounts: Partial<
            Record<IceSlideGenerationRejectionReason, number>
        > = {}
        let totalAttempts = 0
        let worstAttempts = 0
        let fallbacks = 0
        let worstExploredStates = 0

        for (let index = 0; index < seedsPerTier; index++) {
            // Stable validation-corpus ID; intentionally independent of generator version.
            const seed =
                `ice-slide:validate:v1:${difficulty}:` +
                String(index).padStart(4, '0')
            // One shared key set per seed: every stage generation and
            // assertResult regeneration sees all previously used boards.
            const canonicalKeys = new Set<string>()

            for (const stageNumber of stageNumbers) {
                const result = createIceSlideExpeditionStage({
                    seed,
                    stageNumber,
                    difficulty,
                    existingCanonicalKeys: canonicalKeys,
                })
                if (canonicalKeys.has(result.canonicalKey)) {
                    throw new Error(
                        `seed ${seed}: stage ${stageNumber} is a ` +
                            'transform-equivalent duplicate of an earlier ' +
                            'same-seed stage'
                    )
                }

                worstExploredStates = Math.max(
                    worstExploredStates,
                    assertResult(
                        seed,
                        stageNumber,
                        result,
                        difficulty,
                        canonicalKeys
                    )
                )
                canonicalKeys.add(result.canonicalKey)
                totalAttempts += result.attempts
                worstAttempts = Math.max(worstAttempts, result.attempts)
                if (result.usedFallback) {
                    fallbacks++
                }
                for (const [reason, count] of Object.entries(
                    result.rejectionCounts
                ) as [IceSlideGenerationRejectionReason, number][]) {
                    rejectionCounts[reason] =
                        (rejectionCounts[reason] ?? 0) + count
                }
                onStage?.(result)
            }
        }

        summaries.push({
            difficulty,
            seeds: seedsPerTier,
            stageCount: seedsPerTier * stageNumbers.length,
            totalAttempts,
            worstAttempts,
            fallbacks,
            rejectionCounts,
            worstExploredStates,
        })
    }

    return summaries
}

const isMain =
    (import.meta as { main?: boolean }).main ??
    import.meta.url === pathToFileURL(process.argv[1] ?? '').href
if (isMain) {
    const summaries = runIceSlideExpeditionValidation({ seedsPerTier: 1_000 })
    for (const summary of summaries) {
        // eslint-disable-next-line no-console
        console.log(
            JSON.stringify({
                ...summary,
                rejectionCounts: Object.fromEntries(
                    Object.entries(summary.rejectionCounts).sort(([a], [b]) =>
                        a.localeCompare(b)
                    )
                ),
            })
        )
    }
}
