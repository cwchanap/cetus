// src/lib/games/circuit-hacker/generator.test.ts
import { describe, it, expect } from 'vitest'
import { generatePuzzle } from './generator'
import { DIFFICULTY_CONFIGS, computePoweredCells } from './utils'
import type { Difficulty, Tile } from './types'
import { seededRng } from './test-utils'

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
        // 5000 seeds/difficulty gives >99% chance of catching a bug that
        // occurs at ~1/1500 frequency (the rate observed before the
        // findPath/backtracking fix). 100 seeds only gave ~7%.
        // Explicit 30s timeout: the sweep takes ~6s in isolation but can
        // exceed the 5s default under the full suite's parallel load.
        for (const diff of ['easy', 'medium', 'hard', 'expert'] as const) {
            const cfg = DIFFICULTY_CONFIGS[diff]
            for (let seed = 1; seed <= 5000; seed++) {
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
    }, 30000)

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

    it('throws when no source with a non-core neighbor can be placed', () => {
        // A 1x1 grid has no neighbors, so the source invariant can never hold
        // and the retry loop must give up after its attempt budget.
        const tinyConfig = {
            difficulty: 'easy' as Difficulty,
            rows: 1,
            cols: 1,
            cores: 0,
            blockers: 0,
            duration: 1,
            multiplier: 1,
        }
        expect(() => generatePuzzle(tinyConfig, seededRng(1))).toThrow()
    })
})
