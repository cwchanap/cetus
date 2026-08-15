import { createSeededRng, hashString32Hex } from '../shared/seeded-rng'
import {
    validateIceSlideStageQuality,
    type IceSlideStageRejectionReason,
} from './quality'
import { createIceSlideStageSignature } from './run'
import {
    getIceSlideFallback,
    getIceSlideTemplatesByDifficulty,
    type IceSlideTemplateDifficulty,
} from './templates'
import {
    getBoardOrbitKey,
    transformPosition,
    transformRows,
} from './transforms'
import type {
    BoardTransform,
    GridPosition,
    IceSlideObjectiveId,
    IceSlideStageDefinition,
} from './types'

export const ICE_SLIDE_EXPEDITION_GENERATOR_VERSION = 1
export const ICE_SLIDE_EXPEDITION_MAX_ATTEMPTS = 64
export const ICE_SLIDE_EXPEDITION_SOLVER_MAX_STATES = 10_000

export type IceSlideGenerationRejectionReason =
    | IceSlideStageRejectionReason
    | 'materialization_collision'

export interface IceSlideGeneratedStage {
    stage: IceSlideStageDefinition
    canonicalKey: string
    attempts: number
    usedFallback: boolean
    rejectionCounts: Readonly<
        Partial<Record<IceSlideGenerationRejectionReason, number>>
    >
}

type MaterializeResult =
    | { ok: true; rows: string[] }
    | { ok: false; reason: 'materialization_collision' }

const OBJECTIVE_ORDER: readonly IceSlideObjectiveId[] = [
    'collect_all_crystals',
    'no_falls',
    'no_reset',
]

/**
 * Materialize slot picks onto the transformed base board. Only ice cells ('.')
 * may be replaced; any overlap or non-ice target fails the attempt.
 */
function materializeStageRows(
    baseRows: readonly string[],
    transform: BoardTransform,
    goalPosition: GridPosition,
    rockPositions: readonly GridPosition[],
    hazardPositions: readonly GridPosition[],
    crystalPositions: readonly GridPosition[]
): MaterializeResult {
    const inputRows = baseRows.length
    const inputCols = baseRows[0].length
    const grid = transformRows(baseRows, transform).map(row => row.split(''))

    const place = (
        positions: readonly GridPosition[],
        glyph: string
    ): boolean => {
        for (const position of positions) {
            const target = transformPosition(
                position,
                inputRows,
                inputCols,
                transform
            )
            if (grid[target.row][target.col] !== '.') {
                return false
            }
            grid[target.row][target.col] = glyph
        }
        return true
    }

    if (
        !place([goalPosition], 'G') ||
        !place(rockPositions, 'O') ||
        !place(hazardPositions, 'H') ||
        !place(crystalPositions, 'C')
    ) {
        return { ok: false, reason: 'materialization_collision' }
    }
    return { ok: true, rows: grid.map(row => row.join('')) }
}

function buildStage(input: {
    id: string
    name: string
    templateId: string
    difficulty: IceSlideTemplateDifficulty
    rows: string[]
    parMoves: number
    transform: BoardTransform
    mutationIds: readonly string[]
    objectiveId: IceSlideObjectiveId
}): IceSlideStageDefinition {
    const stage: IceSlideStageDefinition = {
        id: input.id,
        name: input.name,
        templateId: input.templateId,
        difficulty: input.difficulty,
        rows: input.rows,
        parMoves: input.parMoves,
        transform: input.transform,
        mutationIds: [...input.mutationIds],
        objectiveIds: [input.objectiveId],
        scoreMultiplierBps: 10_000,
        signature: '',
    }
    stage.signature = createIceSlideStageSignature(stage)
    return stage
}

/**
 * Generate one deterministic expedition stage for a seed/stage/difficulty
 * triple. Makes at most 64 candidate attempts, then falls back to the tier's
 * full-row fallback boards. Pure and deterministic: never uses Math.random or
 * crypto, and never mutates the caller's existingCanonicalKeys set.
 */
export function createIceSlideExpeditionStage(input: {
    seed: string
    stageNumber: number
    difficulty: IceSlideTemplateDifficulty
    existingCanonicalKeys?: ReadonlySet<string>
}): IceSlideGeneratedStage {
    if (input.seed.length === 0) {
        throw new RangeError('seed must be non-empty')
    }
    if (!Number.isSafeInteger(input.stageNumber) || input.stageNumber < 1) {
        throw new RangeError('stageNumber must be a positive safe integer')
    }

    const rejectionCounts: Partial<
        Record<IceSlideGenerationRejectionReason, number>
    > = {}
    const increment = (reason: IceSlideGenerationRejectionReason): void => {
        rejectionCounts[reason] = (rejectionCounts[reason] ?? 0) + 1
    }

    const stageRng = createSeededRng(input.seed)
        .fork(`expedition:g${ICE_SLIDE_EXPEDITION_GENERATOR_VERSION}`)
        .fork(`stage:${input.stageNumber}`)

    const tierTemplates = getIceSlideTemplatesByDifficulty(input.difficulty)

    for (
        let attempt = 1;
        attempt <= ICE_SLIDE_EXPEDITION_MAX_ATTEMPTS;
        attempt++
    ) {
        const attemptRng = stageRng.fork(`attempt:${attempt}`)
        const template = attemptRng.fork('template').pick(tierTemplates)
        const transform = attemptRng
            .fork('transform')
            .pick(template.allowedTransforms)
        const goal = attemptRng.fork('goal').pick(template.slots.goals)
        const rocks = attemptRng.fork('rocks').pick(template.slots.rocks)
        const hazards = attemptRng.fork('hazards').pick(template.slots.hazards)
        const crystals = attemptRng
            .fork('crystals')
            .pick(template.slots.crystals)

        const materialized = materializeStageRows(
            template.baseRows,
            transform,
            goal.position,
            rocks.positions,
            hazards.positions,
            crystals.positions
        )
        if (!materialized.ok) {
            increment('materialization_collision')
            continue
        }
        const rows = materialized.rows

        const canonicalKey = getBoardOrbitKey(rows)
        if (input.existingCanonicalKeys?.has(canonicalKey)) {
            increment('duplicate_board')
            continue
        }

        const quality = validateIceSlideStageQuality(
            {
                id: `${template.id}:attempt:${attempt}`,
                rows,
                objectiveIds: [],
            },
            {
                parBand: template.constraints.parBand,
                maxStates: ICE_SLIDE_EXPEDITION_SOLVER_MAX_STATES,
                minReachableStops: template.constraints.minReachableStops,
                maxHazards: template.constraints.maxHazards,
            }
        )
        if (!quality.accepted) {
            increment(quality.reason)
            continue
        }

        const eligibleObjectives = OBJECTIVE_ORDER.filter(
            id => quality.objectiveFeasibility[id]
        )
        if (eligibleObjectives.length === 0) {
            // Accepted boards are solvable, so no_reset always qualifies
            // today; keep a future feasibility change from crashing pick().
            increment('objective_infeasible')
            continue
        }
        const objectiveId = attemptRng
            .fork('objective')
            .pick(eligibleObjectives)

        return {
            stage: buildStage({
                id: `expedition:${input.stageNumber}`,
                name: template.name,
                templateId: template.id,
                difficulty: template.difficulty,
                rows,
                parMoves: quality.parMoves,
                transform,
                mutationIds: [goal.id, rocks.id, hazards.id, crystals.id],
                objectiveId,
            }),
            canonicalKey,
            attempts: attempt,
            usedFallback: false,
            rejectionCounts: { ...rejectionCounts },
        }
    }

    const fallbackOrder = stageRng.fork('fallback').shuffle(
        tierTemplates.map(template => ({
            template,
            fallback: getIceSlideFallback(template.fallbackVariantId),
        }))
    )

    for (const { template, fallback } of fallbackOrder) {
        const canonicalKey = getBoardOrbitKey(fallback.rows)
        if (input.existingCanonicalKeys?.has(canonicalKey)) {
            increment('duplicate_board')
            continue
        }

        const quality = validateIceSlideStageQuality(
            {
                id: `fallback:${fallback.id}`,
                rows: fallback.rows,
                objectiveIds: [],
            },
            {
                parBand: template.constraints.parBand,
                maxStates: ICE_SLIDE_EXPEDITION_SOLVER_MAX_STATES,
                minReachableStops: template.constraints.minReachableStops,
                maxHazards: template.constraints.maxHazards,
            }
        )
        if (!quality.accepted) {
            increment(quality.reason)
            continue
        }

        const eligibleObjectives = OBJECTIVE_ORDER.filter(
            id => quality.objectiveFeasibility[id]
        )
        if (eligibleObjectives.length === 0) {
            increment('objective_infeasible')
            continue
        }
        const objectiveId = stageRng
            .fork(`fallback:${fallback.id}:objective`)
            .pick(eligibleObjectives)

        if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.warn('Ice Slide Expedition generation fallback', {
                stageNumber: input.stageNumber,
                difficulty: input.difficulty,
                seedHash: hashString32Hex(input.seed),
                attempts: ICE_SLIDE_EXPEDITION_MAX_ATTEMPTS,
                rejectionCounts: { ...rejectionCounts },
                fallbackId: fallback.id,
            })
        }

        return {
            stage: buildStage({
                id: `expedition:${input.stageNumber}`,
                name: template.name,
                templateId: template.id,
                difficulty: template.difficulty,
                rows: [...fallback.rows],
                parMoves: quality.parMoves,
                transform: 'identity',
                mutationIds: [`fallback:${fallback.id}`],
                objectiveId,
            }),
            canonicalKey,
            attempts: ICE_SLIDE_EXPEDITION_MAX_ATTEMPTS,
            usedFallback: true,
            rejectionCounts: { ...rejectionCounts },
        }
    }

    throw new Error(
        `Ice Slide Expedition stage ${input.stageNumber} (${input.difficulty}) ` +
            'has no valid generated candidate or fallback'
    )
}
