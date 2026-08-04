import { cloneGrid, parseGrid, slide, type IceSlideGridSource } from './physics'
import {
    DIRECTION_DELTA,
    type CellType,
    type Direction,
    type GridPosition,
} from './types'

const MAX_CRYSTAL_BITS = 30

export interface IceSlideSolverLimits {
    maxStates: number
}

export interface IceSlideSolveResult {
    solvable: boolean
    minMoves: number | null
    reachableStopCount: number
    reachableCrystalIds: string[]
    reachedGoalWithAllCrystals: boolean
    exploredStates: number
    truncated: boolean
}

interface SolverState {
    position: GridPosition
    moves: number
    crystalMask: number
    grid: CellType[][]
}

/**
 * Solve an Ice Slide board with a bounded breadth-first search over
 * `(position, crystal mask)` states. Returns the minimum moves to the goal
 * plus reachability diagnostics, or truncates when `maxStates` is exceeded.
 */
export function solveIceSlideBoard(
    source: IceSlideGridSource,
    limits: IceSlideSolverLimits
): IceSlideSolveResult {
    if (!Number.isSafeInteger(limits.maxStates) || limits.maxStates < 1) {
        throw new Error('maxStates must be a positive safe integer')
    }

    const base = parseGrid(source)
    if (base.length === 0 || base[0].length === 0) {
        throw new Error(`Level ${source.id} has zero columns`)
    }

    let start: GridPosition | null = null
    let goalCount = 0
    const crystalPositions: GridPosition[] = []
    for (let row = 0; row < base.length; row++) {
        for (let col = 0; col < base[row].length; col++) {
            const cell = base[row][col]
            if (cell === 'start') {
                if (start) {
                    throw new Error(
                        `Level ${source.id} has multiple start tiles`
                    )
                }
                start = { row, col }
            } else if (cell === 'goal') {
                goalCount++
            } else if (cell === 'crystal') {
                crystalPositions.push({ row, col })
            }
        }
    }
    if (!start) {
        throw new Error(`Level ${source.id} is missing a start tile`)
    }
    if (goalCount === 0) {
        throw new Error(`Level ${source.id} is missing a goal tile`)
    }
    if (goalCount > 1) {
        throw new Error(`Level ${source.id} has multiple goal tiles`)
    }
    if (crystalPositions.length > MAX_CRYSTAL_BITS) {
        throw new Error(
            `Level ${source.id} has more than ${MAX_CRYSTAL_BITS} crystals`
        )
    }

    const fullMask = (1 << crystalPositions.length) - 1
    const stateKey = (position: GridPosition, crystalMask: number) =>
        `${position.row},${position.col},${crystalMask}`

    const startGrid = cloneGrid(base)
    startGrid[start.row][start.col] = 'ice'

    const directions: Direction[] = ['N', 'E', 'S', 'W']
    const queue: SolverState[] = [
        { position: start, moves: 0, crystalMask: 0, grid: startGrid },
    ]
    const seen = new Set<string>([stateKey(start, 0)])
    const stops = new Set<string>([`${start.row},${start.col}`])
    const crystalReached = new Array<boolean>(crystalPositions.length).fill(
        false
    )

    let cursor = 0
    let minMoves: number | null = null
    let reachedGoalWithAllCrystals = false
    let truncated = false

    while (cursor < queue.length && !truncated) {
        const current = queue[cursor]
        cursor++
        for (const direction of directions) {
            const grid = cloneGrid(current.grid)
            const outcome = slide(
                grid,
                current.position,
                DIRECTION_DELTA[direction]
            )
            if (outcome.kind !== 'moved') {
                continue
            }

            let crystalMask = 0
            for (let i = 0; i < crystalPositions.length; i++) {
                const crystal = crystalPositions[i]
                if (grid[crystal.row][crystal.col] !== 'crystal') {
                    crystalMask |= 1 << i
                }
            }
            for (let i = 0; i < crystalPositions.length; i++) {
                if (crystalMask & (1 << i)) {
                    crystalReached[i] = true
                }
            }

            stops.add(`${outcome.end.row},${outcome.end.col}`)

            const moves = current.moves + 1
            const key = stateKey(outcome.end, crystalMask)
            if (seen.has(key)) {
                continue
            }
            if (seen.size >= limits.maxStates) {
                truncated = true
                break
            }
            seen.add(key)
            if (outcome.reachedGoal) {
                if (minMoves === null || moves < minMoves) {
                    minMoves = moves
                }
                if (crystalPositions.length > 0 && crystalMask === fullMask) {
                    reachedGoalWithAllCrystals = true
                }
                continue
            }

            queue.push({
                position: outcome.end,
                moves,
                crystalMask,
                grid,
            })
        }
    }

    const reachableCrystalIds: string[] = []
    for (let i = 0; i < crystalPositions.length; i++) {
        if (crystalReached[i]) {
            const crystal = crystalPositions[i]
            reachableCrystalIds.push(`${crystal.row},${crystal.col}`)
        }
    }

    return {
        solvable: !truncated && minMoves !== null,
        minMoves: truncated ? null : minMoves,
        reachableStopCount: stops.size,
        reachableCrystalIds,
        // A full-crystal goal may be found before a later transition reaches
        // the state cap. Suppress the flag when truncated so the result never
        // claims partial solvability alongside `truncated: true`.
        reachedGoalWithAllCrystals: !truncated && reachedGoalWithAllCrystals,
        exploredStates: seen.size,
        truncated,
    }
}
