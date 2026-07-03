import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SudokuGame, DEFAULT_SUDOKU_CONFIG } from './SudokuGame'
import { createSolvedGrid } from './utils'
import type { SudokuCell } from './types'

// Mock the score service so ScoreManager.saveFinalScore doesn't hit network
vi.mock('@/lib/services/scoreService', () => ({
    saveGameScore: vi.fn().mockResolvedValue({ success: true }),
}))

// Helper to find the first non-given cell in a game's grid
function findEmptyCell(cells: SudokuCell[][]): {
    row: number
    col: number
} {
    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            if (!cells[r][c].isGiven) {
                return { row: r, col: c }
            }
        }
    }
    return { row: -1, col: -1 }
}

// Helper to find the first given cell
function findGivenCell(cells: SudokuCell[][]): {
    row: number
    col: number
} {
    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            if (cells[r][c].isGiven) {
                return { row: r, col: c }
            }
        }
    }
    return { row: -1, col: -1 }
}

describe('SudokuGame', () => {
    let game: SudokuGame

    beforeEach(() => {
        vi.useFakeTimers()
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({ newAchievements: [] }),
            })
        )
        game = new SudokuGame({ difficulty: 'easy' })
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.unstubAllGlobals()
        game.destroy()
    })

    describe('Initialization', () => {
        it('should initialize with correct default state', () => {
            const state = game.getState()
            expect(state.score).toBe(0)
            expect(
                state.timer !== undefined || state.timeRemaining !== undefined
            ).toBe(true)
            expect(state.isGameOver).toBe(false)
            expect(state.gameStarted).toBe(false)
            expect(state.isActive).toBe(false)
            expect(state.isPaused).toBe(false)
            expect(state.isComplete).toBe(false)
            expect(state.mistakes).toBe(0)
            expect(state.grid.selectedCell).toBeNull()
        })

        it('should create a 9x9 grid', () => {
            const state = game.getState()
            expect(state.grid.cells).toHaveLength(9)
            expect(state.grid.cells[0]).toHaveLength(9)
        })

        it('should have no selected cell initially', () => {
            expect(game.getState().grid.selectedCell).toBeNull()
        })

        it('should respect difficulty parameter', () => {
            const easy = new SudokuGame({ difficulty: 'easy' })
            const hard = new SudokuGame({ difficulty: 'hard' })
            expect(easy.getState().difficulty).toBe('easy')
            expect(hard.getState().difficulty).toBe('hard')
            easy.destroy()
            hard.destroy()
        })

        it('should have some given cells (non-empty)', () => {
            const givenCells = game
                .getState()
                .grid.cells.flat()
                .filter(cell => cell.isGiven)
            expect(givenCells.length).toBeGreaterThan(0)
        })

        it('should use default medium difficulty', () => {
            const defaultGame = new SudokuGame()
            expect(defaultGame.getState().difficulty).toBe('medium')
            defaultGame.destroy()
        })
    })

    describe('Game Flow', () => {
        it('should start game correctly', () => {
            game.start()
            const state = game.getState()
            expect(state.gameStarted).toBe(true)
            expect(state.isActive).toBe(true)
        })

        it('should set difficulty base score on start', () => {
            game.start()
            // Easy difficulty base = 150
            expect(game.getState().score).toBe(150)
        })

        it('should have higher base score for harder difficulty', () => {
            const easy = new SudokuGame({ difficulty: 'easy' })
            const hard = new SudokuGame({ difficulty: 'hard' })
            easy.start()
            hard.start()
            expect(hard.getState().score).toBeGreaterThan(easy.getState().score)
            easy.destroy()
            hard.destroy()
        })

        it('should track elapsed time when game is active', () => {
            game.start()
            expect(game.getElapsedTime()).toBe(0)
            vi.advanceTimersByTime(2000)
            expect(game.getElapsedTime()).toBe(2)
        })

        it('should reset game correctly', () => {
            game.start()
            vi.advanceTimersByTime(5000)

            game.reset()

            const state = game.getState()
            expect(state.gameStarted).toBe(false)
            expect(state.isGameOver).toBe(false)
            expect(state.isComplete).toBe(false)
            expect(state.score).toBe(0)
            expect(state.mistakes).toBe(0)
        })

        it('should end game via end()', async () => {
            game.start()
            await game.end()
            const state = game.getState()
            expect(state.isGameOver).toBe(true)
            expect(state.isActive).toBe(false)
        })
    })

    describe('Cell Selection', () => {
        beforeEach(() => {
            game.start()
        })

        it('should select a cell', () => {
            game.selectCell(0, 0)
            expect(game.getState().grid.selectedCell).toEqual({
                row: 0,
                col: 0,
            })
        })

        it('should toggle off when clicking same cell', () => {
            game.selectCell(0, 0)
            game.selectCell(0, 0)
            expect(game.getState().grid.selectedCell).toBeNull()
        })

        it('should change selection when clicking different cell', () => {
            game.selectCell(0, 0)
            game.selectCell(1, 1)
            expect(game.getState().grid.selectedCell).toEqual({
                row: 1,
                col: 1,
            })
        })

        it('should not select when game is complete', () => {
            // Access internal state since getState() returns a shallow copy
            const internalState = (
                game as unknown as { state: { isComplete: boolean } }
            ).state
            internalState.isComplete = true
            game.selectCell(0, 0)
            expect(game.getState().grid.selectedCell).toBeNull()
        })

        it('should not select when game is over', async () => {
            await game.end()
            game.selectCell(0, 0)
            expect(game.getState().grid.selectedCell).toBeNull()
        })

        it('should not select before game starts', () => {
            game.reset()
            game.selectCell(0, 0)
            expect(game.getState().grid.selectedCell).toBeNull()
        })

        it('should highlight related cells', () => {
            game.selectCell(4, 4)
            const state = game.getState()
            // Row highlighting
            expect(state.grid.cells[4][0].isHighlighted).toBe(true)
            expect(state.grid.cells[4][8].isHighlighted).toBe(true)
            // Column highlighting
            expect(state.grid.cells[0][4].isHighlighted).toBe(true)
            expect(state.grid.cells[8][4].isHighlighted).toBe(true)
            // Selected cell should not be highlighted
            expect(state.grid.cells[4][4].isHighlighted).toBe(false)
        })
    })

    describe('Number Placement', () => {
        beforeEach(() => {
            game.start()
        })

        it('should not place number if no cell is selected', () => {
            const cellsBefore = JSON.stringify(game.getState().grid.cells)
            game.placeNumber(5)
            expect(JSON.stringify(game.getState().grid.cells)).toBe(cellsBefore)
        })

        it('should not modify given cells', () => {
            const state = game.getState()
            const { row, col } = findGivenCell(state.grid.cells)
            expect(row).toBeGreaterThanOrEqual(0)

            const originalValue = state.grid.cells[row][col].value
            game.selectCell(row, col)
            game.placeNumber(9)

            expect(game.getState().grid.cells[row][col].value).toBe(
                originalValue
            )
        })

        it('should place number in empty non-given cell', () => {
            const state = game.getState()
            const { row, col } = findEmptyCell(state.grid.cells)
            expect(row).toBeGreaterThanOrEqual(0)

            game.selectCell(row, col)
            game.placeNumber(5)

            expect(game.getState().grid.cells[row][col].value).toBe(5)
        })

        it('should clear selection after placing number', () => {
            const state = game.getState()
            const { row, col } = findEmptyCell(state.grid.cells)
            game.selectCell(row, col)
            game.placeNumber(5)
            expect(game.getState().grid.selectedCell).toBeNull()
        })

        it('should mark conflicts when placing invalid number', () => {
            const state = game.getState()
            const { row, col } = findEmptyCell(state.grid.cells)

            // Find a number that already exists in the same row
            const existingNum = state.grid.cells[row].find(
                c => c.value !== null
            )?.value
            expect(existingNum).toBeDefined()

            game.selectCell(row, col)
            game.placeNumber(existingNum!)

            expect(game.getState().grid.cells[row][col].isConflicting).toBe(
                true
            )
            expect(game.getState().mistakes).toBe(1)
        })
    })

    describe('Clear Cell', () => {
        beforeEach(() => {
            game.start()
        })

        it('should not clear if no cell is selected', () => {
            const cellsBefore = JSON.stringify(game.getState().grid.cells)
            game.clearSelectedCell()
            expect(JSON.stringify(game.getState().grid.cells)).toBe(cellsBefore)
        })

        it('should not clear given cells', () => {
            const state = game.getState()
            const { row, col } = findGivenCell(state.grid.cells)
            const originalValue = state.grid.cells[row][col].value

            game.selectCell(row, col)
            game.clearSelectedCell()

            expect(game.getState().grid.cells[row][col].value).toBe(
                originalValue
            )
        })

        it('should clear non-given cell value', () => {
            const state = game.getState()
            const { row, col } = findEmptyCell(state.grid.cells)

            game.selectCell(row, col)
            game.placeNumber(5)
            game.selectCell(row, col)
            game.clearSelectedCell()

            expect(game.getState().grid.cells[row][col].value).toBeNull()
        })
    })

    describe('Scoring', () => {
        it('should calculate score based on solved rows', () => {
            game.start()
            const baseScore = game.getState().score

            // Directly fill row 0 with non-conflicting values and recalculate
            const state = game.getState()
            for (let c = 0; c < 9; c++) {
                state.grid.cells[0][c].value = c + 1
                state.grid.cells[0][c].isConflicting = false
            }

            // Trigger recalculation via private method
            ;(
                game as unknown as { recalculateScore: () => void }
            ).recalculateScore()

            expect(game.getState().score).toBeGreaterThan(baseScore)
        })

        it('should have score = solvedRows^2 * 10 + difficulty base', () => {
            game.start()
            const state = game.getState()

            // Fill all 9 rows with 1-9, no conflicts
            for (let r = 0; r < 9; r++) {
                for (let c = 0; c < 9; c++) {
                    state.grid.cells[r][c].value = c + 1
                    state.grid.cells[r][c].isConflicting = false
                }
            }

            ;(
                game as unknown as { recalculateScore: () => void }
            ).recalculateScore()

            // 9 solved rows: 9*9*10 + 150 (easy) = 960
            expect(game.getState().score).toBe(960)
        })
    })

    describe('Pause / Resume', () => {
        it('should toggle pause state', () => {
            game.start()
            expect(game.getState().isPaused).toBe(false)
            game.pause()
            expect(game.getState().isPaused).toBe(true)
            game.resume()
            expect(game.getState().isPaused).toBe(false)
        })

        it('should not count time when paused', () => {
            game.start()
            vi.advanceTimersByTime(3000)
            expect(game.getElapsedTime()).toBe(3)

            game.pause()
            vi.advanceTimersByTime(5000)
            // Still 3 seconds elapsed (paused time excluded)
            expect(game.getElapsedTime()).toBe(3)

            game.resume()
            vi.advanceTimersByTime(2000)
            expect(game.getElapsedTime()).toBe(5)
        })

        it('should not place numbers when paused', () => {
            game.start()
            game.pause()
            const state = game.getState()
            const { row, col } = findEmptyCell(state.grid.cells)
            game.selectCell(row, col)
            game.placeNumber(5)
            expect(game.getState().grid.cells[row][col].value).toBeNull()
        })
    })

    describe('Game Completion', () => {
        it('should set isComplete when last cell is correctly placed', () => {
            game.start()

            const solvedGrid = createSolvedGrid()
            const state = game.getState()

            // Fill all cells from solved grid, mark all as given except (8,8)
            for (let r = 0; r < 9; r++) {
                for (let c = 0; c < 9; c++) {
                    state.grid.cells[r][c].value = solvedGrid[r][c]
                    state.grid.cells[r][c].isGiven = true
                    state.grid.cells[r][c].isConflicting = false
                }
            }
            state.grid.cells[8][8].value = null
            state.grid.cells[8][8].isGiven = false

            game.selectCell(8, 8)
            game.placeNumber(solvedGrid[8][8])

            expect(game.getState().isComplete).toBe(true)
        })
    })

    describe('getGameData (Task 3.7 contract)', () => {
        it('should expose difficulty, cellsFilled, hintsUsed', () => {
            game.start()
            const data = (
                game as unknown as {
                    getGameData: () => Record<string, unknown>
                }
            ).getGameData()

            expect(data).toHaveProperty('difficulty', 'easy')
            expect(data).toHaveProperty('hintsUsed', 0)
            expect(typeof data.cellsFilled).toBe('number')
        })
    })

    describe('newGame', () => {
        it('should regenerate puzzle with same difficulty', () => {
            const originalCells = JSON.stringify(game.getState().grid.cells)
            game.newGame()
            // New puzzle should be generated (very unlikely to be identical)
            expect(JSON.stringify(game.getState().grid.cells)).not.toBe(
                originalCells
            )
            expect(game.getState().difficulty).toBe('easy')
        })

        it('should change difficulty when specified', () => {
            game.newGame('hard')
            expect(game.getState().difficulty).toBe('hard')
        })

        it('should reset game state', () => {
            game.start()
            game.newGame()
            const state = game.getState()
            expect(state.gameStarted).toBe(false)
            expect(state.isActive).toBe(false)
            expect(state.score).toBe(0)
        })
    })

    describe('State Management', () => {
        it('should return copies of state', () => {
            const state1 = game.getState()
            const state2 = game.getState()
            expect(state1).not.toBe(state2)
            expect(state1).toEqual(state2)
        })
    })

    describe('DEFAULT_SUDOKU_CONFIG', () => {
        it('should have effectively infinite duration', () => {
            expect(DEFAULT_SUDOKU_CONFIG.duration).toBe(Number.MAX_SAFE_INTEGER)
        })

        it('should have correct defaults', () => {
            expect(DEFAULT_SUDOKU_CONFIG.pausable).toBe(true)
            expect(DEFAULT_SUDOKU_CONFIG.resettable).toBe(true)
            expect(DEFAULT_SUDOKU_CONFIG.achievementIntegration).toBe(true)
            expect(DEFAULT_SUDOKU_CONFIG.difficulty).toBe('medium')
        })
    })
})
