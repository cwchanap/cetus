import { createSeededRng, hashString32Hex } from '../shared/seeded-rng'
import {
    ICE_SLIDE_EXPEDITION_GENERATOR_VERSION,
    ICE_SLIDE_EXPEDITION_SOLVER_MAX_STATES,
    createIceSlideExpeditionStage,
} from './generator'
import {
    ICE_SLIDE_OBJECTIVE_IDS,
    getIceSlideObjectiveFeasibility,
} from './objectives'
import { solveIceSlideBoard } from './solver'
import {
    ICE_SLIDE_RUN_SCHEMA_VERSION,
    assertValidIceSlideRunDefinition,
    cloneIceSlideRunDefinition,
    createIceSlideStageSignature,
    formatIceSlideExpeditionRunKey,
} from './run'
import type { IceSlideRunDefinition } from './types'

export const ICE_SLIDE_EXPEDITION_RULESET_VERSION = 2
export const ICE_SLIDE_EXPEDITION_RISK_MULTIPLIER_BPS = 12_500

export type IceSlideExpeditionRouteChoice = 'safe' | 'risky'
export type IceSlideExpeditionChoiceStage = 2 | 4

export interface IceSlideExpeditionRouteEffect {
    run: IceSlideRunDefinition
    undoChargesGranted: number
}

export const ICE_SLIDE_EXPEDITION_STAGE_DIFFICULTIES = [
    'easy',
    'easy',
    'medium',
    'medium',
    'hard',
    'hard',
] as const

export function applyIceSlideExpeditionRouteChoice(
    run: IceSlideRunDefinition,
    afterStageNumber: IceSlideExpeditionChoiceStage,
    choice: IceSlideExpeditionRouteChoice
): IceSlideExpeditionRouteEffect {
    assertValidIceSlideRunDefinition(run)
    if (run.mode !== 'expedition' || run.seed === null) {
        throw new RangeError('route choices require a seeded Expedition run')
    }
    if (afterStageNumber !== 2 && afterStageNumber !== 4) {
        throw new RangeError(
            'route choices are only available after stages 2 and 4'
        )
    }

    if (choice !== 'safe' && choice !== 'risky') {
        throw new RangeError(
            `route choice must be 'safe' or 'risky', received: ${String(choice)}`
        )
    }

    const nextRun = cloneIceSlideRunDefinition(run)
    const targetIndex = afterStageNumber

    if (choice === 'safe') {
        assertValidIceSlideRunDefinition(nextRun)
        return { run: nextRun, undoChargesGranted: 1 }
    }

    const target = nextRun.stages[targetIndex]
    if (!target) {
        throw new RangeError('route choice target stage is unavailable')
    }
    const solve = solveIceSlideBoard(target, {
        maxStates: ICE_SLIDE_EXPEDITION_SOLVER_MAX_STATES,
    })
    if (solve.truncated || !solve.solvable) {
        throw new Error('Risk target stage is not solver-valid')
    }

    const feasibility = getIceSlideObjectiveFeasibility(target.rows, solve)
    const remaining = ICE_SLIDE_OBJECTIVE_IDS.filter(
        id => feasibility[id] && !target.objectiveIds.includes(id)
    )
    if (remaining.length === 0) {
        throw new Error(
            'Risk target stage has no additional eligible objective'
        )
    }

    const extraObjective = createSeededRng(run.seed)
        .fork(`expedition:g${run.generatorVersion}`)
        .fork(`route:${afterStageNumber}`)
        .fork('risk-objective')
        .pick(remaining)

    target.objectiveIds.push(extraObjective)
    target.scoreMultiplierBps = ICE_SLIDE_EXPEDITION_RISK_MULTIPLIER_BPS
    target.signature = createIceSlideStageSignature(target)
    assertValidIceSlideRunDefinition(nextRun)
    return { run: nextRun, undoChargesGranted: 0 }
}

export function createIceSlideExpeditionRunDefinition(
    seed: string
): IceSlideRunDefinition {
    if (seed.length === 0) {
        throw new RangeError('seed must be non-empty')
    }

    const canonicalKeys = new Set<string>()
    const stages = ICE_SLIDE_EXPEDITION_STAGE_DIFFICULTIES.map(
        (difficulty, index) => {
            const generated = createIceSlideExpeditionStage({
                seed,
                stageNumber: index + 1,
                difficulty,
                existingCanonicalKeys: canonicalKeys,
            })
            canonicalKeys.add(generated.canonicalKey)
            return generated.stage
        }
    )

    const run: IceSlideRunDefinition = {
        schemaVersion: ICE_SLIDE_RUN_SCHEMA_VERSION,
        generatorVersion: ICE_SLIDE_EXPEDITION_GENERATOR_VERSION,
        rulesetVersion: ICE_SLIDE_EXPEDITION_RULESET_VERSION,
        mode: 'expedition',
        runKey: formatIceSlideExpeditionRunKey({
            seedHash: hashString32Hex(seed),
            generatorVersion: ICE_SLIDE_EXPEDITION_GENERATOR_VERSION,
            rulesetVersion: ICE_SLIDE_EXPEDITION_RULESET_VERSION,
        }),
        seed,
        stages,
    }

    assertValidIceSlideRunDefinition(run)
    return run
}
