import type { IceSlideGridSource } from './physics'
import { solveIceSlideBoard, type IceSlideSolveResult } from './solver'
import { serializeBoardRows } from './transforms'
import type { IceSlideObjectiveId } from './types'

export interface IceSlideStageQualityCandidate extends IceSlideGridSource {
    objectiveIds: readonly IceSlideObjectiveId[]
}

export interface IceSlideStageQualityConstraints {
    parBand: {
        minMoves: number
        maxMoves: number
    }
    maxStates: number
    existingCanonicalKeys?: ReadonlySet<string>
    minReachableStops?: number
    maxHazards?: number
}

export type IceSlideStageRejectionReason =
    | 'invalid_board'
    | 'duplicate_board'
    | 'solver_truncated'
    | 'unsolvable'
    | 'par_out_of_band'
    | 'reachable_stops_below_min'
    | 'too_many_hazards'
    | 'objective_infeasible'

export type IceSlideStageQualityResult =
    | {
          accepted: true
          parMoves: number
          canonicalKey: string
          objectiveFeasibility: Record<IceSlideObjectiveId, boolean>
          solveResult: IceSlideSolveResult
      }
    | {
          accepted: false
          reason: IceSlideStageRejectionReason
          message: string
          canonicalKey?: string
          solveResult?: IceSlideSolveResult
      }

function validateConstraints(
    constraints: IceSlideStageQualityConstraints
): void {
    for (const [label, value] of [
        ['maxStates', constraints.maxStates],
        ['parBand.minMoves', constraints.parBand.minMoves],
        ['parBand.maxMoves', constraints.parBand.maxMoves],
    ] as const) {
        if (!Number.isSafeInteger(value) || value < 1) {
            throw new RangeError(`${label} must be a positive safe integer`)
        }
    }
    if (constraints.parBand.minMoves > constraints.parBand.maxMoves) {
        throw new RangeError(
            'parBand.minMoves must not exceed parBand.maxMoves'
        )
    }
    if (
        constraints.minReachableStops !== undefined &&
        (!Number.isSafeInteger(constraints.minReachableStops) ||
            constraints.minReachableStops < 1)
    ) {
        throw new RangeError(
            'minReachableStops must be a positive safe integer'
        )
    }

    if (
        constraints.maxHazards !== undefined &&
        (!Number.isSafeInteger(constraints.maxHazards) ||
            constraints.maxHazards < 0)
    ) {
        throw new RangeError('maxHazards must be a non-negative safe integer')
    }
}

function countGlyphs(rows: readonly string[], glyph: string): number {
    let count = 0
    for (const row of rows) {
        for (const cell of row) {
            if (cell === glyph) {
                count++
            }
        }
    }
    return count
}

function objectiveInfeasibleMessage(
    objectiveId: IceSlideObjectiveId,
    crystalCount: number,
    solveResult: IceSlideSolveResult
): string {
    switch (objectiveId) {
        case 'collect_all_crystals': {
            const unreachableCount =
                crystalCount - solveResult.reachableCrystalIds.length
            if (crystalCount === 0) {
                return 'board has no crystals to collect'
            }
            if (unreachableCount > 0) {
                return `${unreachableCount} of ${crystalCount} crystals are unreachable`
            }
            return 'all crystals reachable but the goal cannot be reached with all crystals collected'
        }
        case 'no_falls':
            return 'board has no hazard tiles; the no_falls objective cannot be achieved'
        case 'no_reset':
            return 'board is not solvable; the no_reset objective cannot be achieved'
    }
}

/**
 * Validate a generated Ice Slide stage against shape, uniqueness, solver,
 * par-band, and objective-eligibility checks. Pure stage gate: returns a
 * verdict and never mutates or re-generates the candidate.
 */
export function validateIceSlideStageQuality(
    candidate: IceSlideStageQualityCandidate,
    constraints: IceSlideStageQualityConstraints
): IceSlideStageQualityResult {
    validateConstraints(constraints)

    let canonicalKey: string
    try {
        canonicalKey = serializeBoardRows(candidate.rows)
    } catch (error) {
        return {
            accepted: false,
            reason: 'invalid_board',
            message: error instanceof Error ? error.message : String(error),
        }
    }

    if (constraints.existingCanonicalKeys?.has(canonicalKey)) {
        return {
            accepted: false,
            reason: 'duplicate_board',
            message: `Level ${candidate.id} duplicates an existing board`,
            canonicalKey,
        }
    }

    let solveResult: IceSlideSolveResult
    try {
        solveResult = solveIceSlideBoard(candidate, {
            maxStates: constraints.maxStates,
        })
    } catch (error) {
        return {
            accepted: false,
            reason: 'invalid_board',
            message: error instanceof Error ? error.message : String(error),
            canonicalKey,
        }
    }

    if (solveResult.truncated) {
        return {
            accepted: false,
            reason: 'solver_truncated',
            message: `search exceeded the ${constraints.maxStates} state cap`,
            canonicalKey,
            solveResult,
        }
    }
    if (!solveResult.solvable) {
        return {
            accepted: false,
            reason: 'unsolvable',
            message: `Level ${candidate.id} has no path to the goal`,
            canonicalKey,
            solveResult,
        }
    }
    const parMoves = solveResult.minMoves as number
    if (
        parMoves < constraints.parBand.minMoves ||
        parMoves > constraints.parBand.maxMoves
    ) {
        return {
            accepted: false,
            reason: 'par_out_of_band',
            message: `par ${parMoves} outside band [${constraints.parBand.minMoves}, ${constraints.parBand.maxMoves}]`,
            canonicalKey,
            solveResult,
        }
    }

    if (
        constraints.minReachableStops !== undefined &&
        solveResult.reachableStopCount < constraints.minReachableStops
    ) {
        return {
            accepted: false,
            reason: 'reachable_stops_below_min',
            message:
                `reachable stops ${solveResult.reachableStopCount} below minimum ` +
                `${constraints.minReachableStops}`,
            canonicalKey,
            solveResult,
        }
    }

    const hazardCount = countGlyphs(candidate.rows, 'H')
    if (
        constraints.maxHazards !== undefined &&
        hazardCount > constraints.maxHazards
    ) {
        return {
            accepted: false,
            reason: 'too_many_hazards',
            message: `hazards ${hazardCount} exceed maximum ${constraints.maxHazards}`,
            canonicalKey,
            solveResult,
        }
    }

    const crystalCount = countGlyphs(candidate.rows, 'C')
    const hasHazard = hazardCount > 0
    const objectiveFeasibility: Record<IceSlideObjectiveId, boolean> = {
        collect_all_crystals:
            crystalCount > 0 && solveResult.reachedGoalWithAllCrystals,
        no_falls: hasHazard && solveResult.solvable,
        no_reset: solveResult.solvable,
    }

    for (const objectiveId of candidate.objectiveIds) {
        if (objectiveFeasibility[objectiveId]) {
            continue
        }
        return {
            accepted: false,
            reason: 'objective_infeasible',
            message: objectiveInfeasibleMessage(
                objectiveId,
                crystalCount,
                solveResult
            ),
            canonicalKey,
            solveResult,
        }
    }

    return {
        accepted: true,
        parMoves,
        canonicalKey,
        objectiveFeasibility,
        solveResult,
    }
}
