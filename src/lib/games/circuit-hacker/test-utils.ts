// Shared test utilities for circuit-hacker tests.

import type { CircuitHackerGame } from './game'
import type { GeneratedPuzzle } from './generator'
import type { CircuitHackerState } from './types'

// Deterministic LCG so tests are reproducible.
export function seededRng(seed: number): () => number {
    let s = seed >>> 0
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0
        return s / 0xffffffff
    }
}

// Test-only access to the game's private internals. Defined here (not on the
// production class) so the public API shipped in the production bundle does
// not include a solve backdoor. Tests are co-located with the game source,
// so any private-field rename will surface as a test compile error here
// rather than silently shipping a callable solver.
interface CircuitHackerGameInternals {
    puzzle: GeneratedPuzzle | null
    state: CircuitHackerState
    applyPower(state: CircuitHackerState): void
    allCoresPowered(state: CircuitHackerState): boolean
    solve(): void
}

/** Test-only helper: rotate every tile into the known solution. */
export function solveGameForTest(game: CircuitHackerGame): void {
    const internals = game as unknown as CircuitHackerGameInternals
    const puzzle = internals.puzzle
    if (!puzzle) {
        return
    }
    for (let r = 0; r < internals.state.rows; r++) {
        for (let c = 0; c < internals.state.cols; c++) {
            internals.state.grid[r][c].orientation =
                puzzle.solutionOrientations[r][c]
        }
    }
    internals.applyPower(internals.state)
    if (internals.allCoresPowered(internals.state)) {
        internals.solve()
    }
}

/**
 * Test-only helper: returns the recorded solution orientations so tests can
 * drive the real rotateTile() path to a win without using the solve backdoor.
 */
export function getSolutionOrientationsForTest(
    game: CircuitHackerGame
): number[][] | null {
    const internals = game as unknown as CircuitHackerGameInternals
    return internals.puzzle?.solutionOrientations ?? null
}
