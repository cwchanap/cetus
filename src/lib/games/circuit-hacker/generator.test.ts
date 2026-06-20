// src/lib/games/circuit-hacker/generator.test.ts
import { describe, it, expect } from 'vitest'
import { generatePuzzle } from './generator'
import { DIFFICULTY_CONFIGS, computePoweredCells } from './utils'
import type { Difficulty, Tile } from './types'

// Deterministic LCG so tests are reproducible
function seededRng(seed: number): () => number {
    let s = seed >>> 0
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0
        return s / 0xffffffff
    }
}

const difficulties: Difficulty[] = ['easy', 'medium', 'hard', 'expert']

describe('generatePuzzle', () => {
    it.each(difficulties)(
        'produces a grid of the right shape and counts for %s',
        difficulty => {
            const config = DIFFICULTY_CONFIGS[difficulty]
            const puzzle = generatePuzzle(config, seededRng(42))

            expect(puzzle.grid).toHaveLength(config.rows)
            for (const row of puzzle.grid) {
                expect(row).toHaveLength(config.cols)
            }

            const flat = puzzle.grid.flat()
            expect(flat.filter(t => t.type === 'source')).toHaveLength(1)
            expect(flat.filter(t => t.type === 'core')).toHaveLength(
                config.cores
            )
            expect(flat.filter(t => t.type === 'blocker')).toHaveLength(
                config.blockers
            )
            expect(puzzle.corePositions).toHaveLength(config.cores)
        }
    )

    it.each(difficulties)('is solvable by construction for %s', difficulty => {
        const config = DIFFICULTY_CONFIGS[difficulty]
        const puzzle = generatePuzzle(config, seededRng(7))

        // Apply the recorded solution orientations
        const solved: Tile[][] = puzzle.grid.map((row, r) =>
            row.map((tile, c) => ({
                ...tile,
                orientation: puzzle.solutionOrientations[r][c],
            }))
        )
        const powered = computePoweredCells(solved, puzzle.sourcePos)
        for (const core of puzzle.corePositions) {
            expect(powered[core.row][core.col]).toBe(true)
        }
    })

    it('generates solvable puzzles across many seeds for every difficulty', () => {
        const lcg = (seed: number) => {
            let s = seed >>> 0
            return () => {
                s = (1664525 * s + 1013904223) >>> 0
                return s / 0xffffffff
            }
        }
        for (const diff of ['easy', 'medium', 'hard', 'expert'] as const) {
            const cfg = DIFFICULTY_CONFIGS[diff]
            for (let seed = 1; seed <= 100; seed++) {
                const puzzle = generatePuzzle(cfg, lcg(seed))
                const solved = puzzle.grid.map((row, r) =>
                    row.map((tile, c) => ({
                        ...tile,
                        orientation: puzzle.solutionOrientations[r][c],
                    }))
                )
                const powered = computePoweredCells(solved, puzzle.sourcePos)
                const allCoresPowered = puzzle.corePositions.every(
                    cp => powered[cp.row][cp.col]
                )
                expect(allCoresPowered, `${diff} seed ${seed}`).toBe(true)
            }
        }
    })

    it('marks source, core and blocker tiles as locked', () => {
        const puzzle = generatePuzzle(DIFFICULTY_CONFIGS.hard, seededRng(3))
        for (const row of puzzle.grid) {
            for (const tile of row) {
                if (
                    tile.type === 'source' ||
                    tile.type === 'core' ||
                    tile.type === 'blocker'
                ) {
                    expect(tile.locked).toBe(true)
                } else {
                    expect(tile.locked).toBe(false)
                }
            }
        }
    })
})
