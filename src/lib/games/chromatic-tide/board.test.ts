import { describe, expect, it } from 'vitest'
import { createSeededRng } from '@/lib/games/shared/seeded-rng'
import {
    CHROMATIC_TIDE_PALETTE,
    CHROMATIC_TIDE_RULES,
    createChromaticTideConfig,
    type ChromaticTideBoard,
    type ChromaticTideColor,
} from './types'
import {
    countCapturedCells,
    createChromaticTideBoard,
    floodChromaticTideBoard,
    markInitialTerritory,
} from './board'
import { selectGreedyChromaticTideColor } from './test-fixtures'

function cell(color: ChromaticTideColor, captured: boolean = false) {
    return { color, captured }
}

describe('Chromatic Tide canonical config', () => {
    it('provides BaseGame defaults plus rng without copying frozen board or scoring rules', () => {
        const rng = () => 0.5
        const config = createChromaticTideConfig({ rng })

        expect(config).toEqual({
            duration: CHROMATIC_TIDE_RULES.duration,
            achievementIntegration: true,
            pausable: false,
            resettable: true,
            rng,
        })
        expect(config).not.toHaveProperty('rows')
        expect(config).not.toHaveProperty('completionBonus')
    })
})

describe('Chromatic Tide board generation', () => {
    it('consumes exactly 144 varied samples and maps them in palette order', () => {
        const samples = [0, 0.2, 0.4, 0.6, 0.8]
        let calls = 0
        const board = createChromaticTideBoard(() => {
            const sample = samples[calls % samples.length]
            calls++
            return sample
        })

        expect(calls).toBe(
            CHROMATIC_TIDE_RULES.rows * CHROMATIC_TIDE_RULES.cols
        )
        expect(board).toHaveLength(12)
        expect(board.every(row => row.length === 12)).toBe(true)
        expect(board[0].slice(0, 5).map(({ color }) => color)).toEqual(
            CHROMATIC_TIDE_PALETTE
        )
        expect(board[0][0]).toEqual({ color: 'teal', captured: true })
        expect(countCapturedCells(board)).toBeGreaterThan(0)
    })

    it('repairs only the bottom-right cell for a degenerate sample stream', () => {
        let calls = 0
        const board = createChromaticTideBoard(() => {
            calls++
            return 0
        })

        expect(calls).toBe(144)
        expect(board[11][11]).toEqual({ color: 'amber', captured: false })
        expect(
            board
                .flat()
                .slice(0, -1)
                .every(cell => cell.color === 'teal')
        ).toBe(true)
        expect(countCapturedCells(board)).toBe(143)
        expect(countCapturedCells(board)).toBeLessThan(144)
    })

    it('normalizes invalid samples without retrying', () => {
        const samples = [NaN, -0.5, 1, 1.5]
        let calls = 0
        const board = createChromaticTideBoard(() => {
            const sample = samples[calls % samples.length]
            calls++
            return sample
        })

        expect(calls).toBe(144)
        expect(board[0].slice(0, 4).map(({ color }) => color)).toEqual([
            'teal',
            'teal',
            'green',
            'green',
        ])
        expect(
            board
                .flat()
                .every(({ color }) => CHROMATIC_TIDE_PALETTE.includes(color))
        ).toBe(true)
    })
})

describe('Chromatic Tide territory helpers', () => {
    it('marks the full orthogonal component anchored at top-left', () => {
        const source: ChromaticTideBoard = [
            [cell('teal'), cell('teal'), cell('amber')],
            [cell('amber'), cell('teal'), cell('teal')],
            [cell('teal'), cell('amber'), cell('teal')],
        ]

        const result = markInitialTerritory(source)

        expect(countCapturedCells(result)).toBe(5)
        expect(result.map(row => row.map(cell => cell.captured))).toEqual([
            [true, true, false],
            [false, true, true],
            [false, false, true],
        ])
    })

    it('does not connect same-color cells diagonally', () => {
        const source: ChromaticTideBoard = [
            [cell('teal'), cell('amber')],
            [cell('amber'), cell('teal')],
        ]

        const result = markInitialTerritory(source)

        expect(countCapturedCells(result)).toBe(1)
        expect(result[1][1].captured).toBe(false)
    })

    it('resolves an orthogonal target-color flood to a fixed point', () => {
        const source: ChromaticTideBoard = [
            [cell('teal', true), cell('amber'), cell('magenta')],
            [cell('teal', true), cell('amber'), cell('amber')],
            [cell('green'), cell('green'), cell('amber')],
        ]

        const result = floodChromaticTideBoard(source, 'amber')

        expect(countCapturedCells(result)).toBe(6)
        expect(result.map(row => row.map(cell => cell.captured))).toEqual([
            [true, true, false],
            [true, true, true],
            [false, false, true],
        ])
        expect(
            result
                .flat()
                .filter(cell => cell.captured)
                .every(cell => cell.color === 'amber')
        ).toBe(true)
    })

    it('does not mutate source rows or cell objects', () => {
        const source: ChromaticTideBoard = [
            [cell('teal'), cell('teal')],
            [cell('amber'), cell('amber')],
        ]
        const sourceSnapshot = structuredClone(source)

        const initial = markInitialTerritory(source)
        const flooded = floodChromaticTideBoard(initial, 'amber')

        expect(source).toEqual(sourceSnapshot)
        expect(initial).not.toBe(source)
        expect(initial[0]).not.toBe(source[0])
        expect(initial[0][0]).not.toBe(source[0][0])
        expect(flooded).not.toBe(initial)
        expect(flooded[0]).not.toBe(initial[0])
        expect(flooded[0][0]).not.toBe(initial[0][0])
        expect(initial[0][0]).toEqual({ color: 'teal', captured: true })
    })
})

describe('selectGreedyChromaticTideColor', () => {
    it('never returns the current color and ignores zero-gain alternatives', () => {
        const board: ChromaticTideBoard = [
            [cell('teal', true), cell('amber'), cell('amber')],
            [cell('green'), cell('magenta'), cell('ice')],
        ]

        const selected = selectGreedyChromaticTideColor(board, 'teal')
        const flooded = floodChromaticTideBoard(board, selected)

        expect(selected).toBe('amber')
        expect(selected).not.toBe('teal')
        expect(countCapturedCells(flooded)).toBeGreaterThan(
            countCapturedCells(board)
        )
    })

    it('handles irregular territory boundaries and breaks ties by palette order', () => {
        const board: ChromaticTideBoard = [
            [cell('teal', true), cell('teal', true), cell('amber')],
            [cell('green'), cell('teal', true), cell('amber')],
            [cell('green'), cell('green'), cell('amber')],
        ]

        expect(selectGreedyChromaticTideColor(board, 'teal')).toBe('amber')
        expect(
            countCapturedCells(floodChromaticTideBoard(board, 'amber'))
        ).toBe(6)
        expect(
            countCapturedCells(floodChromaticTideBoard(board, 'green'))
        ).toBe(6)
    })

    it('strictly progresses and clears valid boards within their uncaptured count', () => {
        const fixtures: ChromaticTideBoard[] = [
            [
                [cell('teal', true), cell('amber'), cell('magenta')],
                [cell('green'), cell('amber'), cell('magenta')],
                [cell('green'), cell('ice'), cell('ice')],
            ],
            [
                [
                    cell('magenta', true),
                    cell('magenta', true),
                    cell('green'),
                    cell('amber'),
                ],
                [
                    cell('ice'),
                    cell('magenta', true),
                    cell('green'),
                    cell('amber'),
                ],
                [cell('ice'), cell('ice'), cell('teal'), cell('teal')],
            ],
            [
                [cell('green', true), cell('amber'), cell('green')],
                [cell('magenta'), cell('ice'), cell('amber')],
                [cell('teal'), cell('magenta'), cell('ice')],
            ],
        ]

        for (const fixture of fixtures) {
            let board = fixture
            let territoryColor = fixture[0][0].color
            const totalCells = fixture.reduce((sum, row) => sum + row.length, 0)
            const initialUncapturedCells =
                totalCells - countCapturedCells(fixture)
            let moves = 0

            while (countCapturedCells(board) < totalCells) {
                const before = countCapturedCells(board)
                const selected = selectGreedyChromaticTideColor(
                    board,
                    territoryColor
                )
                board = floodChromaticTideBoard(board, selected)
                moves++

                expect(selected).not.toBe(territoryColor)
                expect(countCapturedCells(board)).toBeGreaterThan(before)
                territoryColor = selected
            }

            expect(moves).toBeLessThanOrEqual(initialUncapturedCells)
        }
    })
})

describe('Chromatic Tide deterministic calibration', () => {
    it('pins the intended greedy move distribution across 512 seeded boards', () => {
        const moveCounts = Array.from({ length: 512 }, (_, index) => {
            const rng = createSeededRng(`chromatic-tide-calibration:${index}`)
            let board = createChromaticTideBoard(rng.nextFloat)
            let territoryColor = board[0][0].color
            let moves = 0

            while (countCapturedCells(board) < 144) {
                const selected = selectGreedyChromaticTideColor(
                    board,
                    territoryColor
                )
                board = floodChromaticTideBoard(board, selected)
                territoryColor = selected
                moves++
            }

            return moves
        }).sort((left, right) => left - right)

        const nearestRank = (percent: number) =>
            moveCounts[Math.ceil((percent / 100) * moveCounts.length) - 1]
        const proportionAtMost = (threshold: number) =>
            moveCounts.filter(moves => moves <= threshold).length /
            moveCounts.length

        expect(nearestRank(10)).toBe(16)
        expect(nearestRank(50)).toBe(19)
        expect(nearestRank(90)).toBe(22)
        expect(proportionAtMost(17)).toBeGreaterThanOrEqual(0.2)
        expect(proportionAtMost(17)).toBeLessThanOrEqual(0.3)
        expect(proportionAtMost(15)).toBeGreaterThanOrEqual(0.03)
        expect(proportionAtMost(15)).toBeLessThanOrEqual(0.07)
    })
})
