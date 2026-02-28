import { describe, it, expect, beforeEach } from 'vitest'
import {
    initializeGame,
    selectCell,
    placeNumber,
    clearCell,
    updateTimer,
    togglePause,
    calculateScore,
} from './game'
import { createSolvedGrid } from './utils'
import type { GameState } from './types'

describe('Sudoku Game', () => {
    let state: GameState

    beforeEach(() => {
        state = initializeGame('easy')
    })

    describe('initializeGame', () => {
        it('should create a new game state with default difficulty', () => {
            const defaultState = initializeGame()

            expect(defaultState.difficulty).toBe('medium')
            expect(defaultState.timer).toBe(0)
            expect(defaultState.mistakes).toBe(0)
            expect(defaultState.isComplete).toBe(false)
            expect(defaultState.isPaused).toBe(false)
            expect(defaultState.isGameOver).toBe(false)
        })

        it('should create a 9x9 grid', () => {
            expect(state.grid.cells).toHaveLength(9)
            expect(state.grid.cells[0]).toHaveLength(9)
        })

        it('should have no selected cell initially', () => {
            expect(state.grid.selectedCell).toBeNull()
        })

        it('should respect difficulty parameter', () => {
            const easyState = initializeGame('easy')
            const hardState = initializeGame('hard')

            expect(easyState.difficulty).toBe('easy')
            expect(hardState.difficulty).toBe('hard')
        })

        it('should have some given cells (non-empty)', () => {
            const givenCells = state.grid.cells
                .flat()
                .filter(cell => cell.isGiven)

            expect(givenCells.length).toBeGreaterThan(0)
        })
    })

    describe('selectCell', () => {
        it('should select a cell', () => {
            selectCell(state, 0, 0)

            expect(state.grid.selectedCell).toEqual({ row: 0, col: 0 })
        })

        it('should toggle off when clicking same cell', () => {
            selectCell(state, 0, 0)
            selectCell(state, 0, 0)

            expect(state.grid.selectedCell).toBeNull()
        })

        it('should change selection when clicking different cell', () => {
            selectCell(state, 0, 0)
            selectCell(state, 1, 1)

            expect(state.grid.selectedCell).toEqual({ row: 1, col: 1 })
        })

        it('should not select when game is complete', () => {
            state.isComplete = true
            selectCell(state, 0, 0)

            expect(state.grid.selectedCell).toBeNull()
        })

        it('should not select when game is over', () => {
            state.isGameOver = true
            selectCell(state, 0, 0)

            expect(state.grid.selectedCell).toBeNull()
        })

        it('should highlight related cells', () => {
            selectCell(state, 4, 4)

            // Check row highlighting
            expect(state.grid.cells[4][0].isHighlighted).toBe(true)
            expect(state.grid.cells[4][8].isHighlighted).toBe(true)

            // Check column highlighting
            expect(state.grid.cells[0][4].isHighlighted).toBe(true)
            expect(state.grid.cells[8][4].isHighlighted).toBe(true)

            // Selected cell should not be highlighted
            expect(state.grid.cells[4][4].isHighlighted).toBe(false)
        })
    })

    describe('placeNumber', () => {
        it('should not place number if no cell is selected', () => {
            const initialCells = JSON.stringify(state.grid.cells)
            placeNumber(state, 5)

            expect(JSON.stringify(state.grid.cells)).toBe(initialCells)
        })

        it('should not modify given cells', () => {
            // Find a given cell
            let givenRow = -1,
                givenCol = -1
            for (let r = 0; r < 9; r++) {
                for (let c = 0; c < 9; c++) {
                    if (state.grid.cells[r][c].isGiven) {
                        givenRow = r
                        givenCol = c
                        break
                    }
                }
                if (givenRow >= 0) {
                    break
                }
            }

            expect(givenRow).toBeGreaterThanOrEqual(0)

            const originalValue = state.grid.cells[givenRow][givenCol].value
            selectCell(state, givenRow, givenCol)
            placeNumber(state, 9)

            expect(state.grid.cells[givenRow][givenCol].value).toBe(
                originalValue
            )
        })

        it('should place number in empty non-given cell', () => {
            // Find an empty non-given cell
            let emptyRow = -1,
                emptyCol = -1
            for (let r = 0; r < 9; r++) {
                for (let c = 0; c < 9; c++) {
                    if (!state.grid.cells[r][c].isGiven) {
                        emptyRow = r
                        emptyCol = c
                        break
                    }
                }
                if (emptyRow >= 0) {
                    break
                }
            }

            expect(emptyRow).toBeGreaterThanOrEqual(0)

            selectCell(state, emptyRow, emptyCol)
            placeNumber(state, 5)

            expect(state.grid.cells[emptyRow][emptyCol].value).toBe(5)
        })

        it('should clear selection after placing number', () => {
            // Find an empty non-given cell
            let foundCell = false
            for (let r = 0; r < 9; r++) {
                for (let c = 0; c < 9; c++) {
                    if (!state.grid.cells[r][c].isGiven) {
                        selectCell(state, r, c)
                        placeNumber(state, 5)
                        expect(state.grid.selectedCell).toBeNull()
                        foundCell = true
                        break
                    }
                }
                if (foundCell) {
                    break
                }
            }
            expect(foundCell).toBe(true)
        })
    })

    describe('clearCell', () => {
        it('should not clear if no cell is selected', () => {
            const stateBefore = JSON.parse(JSON.stringify(state))
            clearCell(state)
            expect(state).toEqual(stateBefore)
        })

        it('should not clear given cells', () => {
            // Find a given cell
            for (let r = 0; r < 9; r++) {
                for (let c = 0; c < 9; c++) {
                    if (state.grid.cells[r][c].isGiven) {
                        const originalValue = state.grid.cells[r][c].value
                        selectCell(state, r, c)
                        clearCell(state)
                        expect(state.grid.cells[r][c].value).toBe(originalValue)
                        return
                    }
                }
            }
            // Ensure a given cell was found and tested
            expect.fail('No given cell found in puzzle to test')
        })

        it('should clear non-given cell value', () => {
            // Find and fill an empty non-given cell
            for (let r = 0; r < 9; r++) {
                for (let c = 0; c < 9; c++) {
                    if (!state.grid.cells[r][c].isGiven) {
                        selectCell(state, r, c)
                        placeNumber(state, 5)
                        selectCell(state, r, c)
                        clearCell(state)
                        expect(state.grid.cells[r][c].value).toBeNull()
                        return
                    }
                }
            }
            // Ensure the test actually exercised the logic
            expect.fail('No non-given cell found in puzzle to test')
        })
    })

    describe('updateTimer', () => {
        it('should increment timer when game is active', () => {
            expect(state.timer).toBe(0)
            updateTimer(state)
            expect(state.timer).toBe(1)
            updateTimer(state)
            expect(state.timer).toBe(2)
        })

        it('should not increment timer when paused', () => {
            state.isPaused = true
            updateTimer(state)
            expect(state.timer).toBe(0)
        })

        it('should not increment timer when complete', () => {
            state.isComplete = true
            updateTimer(state)
            expect(state.timer).toBe(0)
        })

        it('should not increment timer when game over', () => {
            state.isGameOver = true
            updateTimer(state)
            expect(state.timer).toBe(0)
        })
    })

    describe('togglePause', () => {
        it('should toggle pause state', () => {
            expect(state.isPaused).toBe(false)
            togglePause(state)
            expect(state.isPaused).toBe(true)
            togglePause(state)
            expect(state.isPaused).toBe(false)
        })

        it('should not toggle when game is complete', () => {
            state.isComplete = true
            togglePause(state)
            expect(state.isPaused).toBe(false)
        })

        it('should not toggle when game is over', () => {
            state.isGameOver = true
            togglePause(state)
            expect(state.isPaused).toBe(false)
        })
    })

    describe('calculateScore', () => {
        it('should include difficulty bonus', () => {
            const easyState = initializeGame('easy')
            const hardState = initializeGame('hard')

            calculateScore(easyState)
            calculateScore(hardState)

            // Hard should have higher base score
            expect(hardState.score).toBeGreaterThan(easyState.score)
        })

        it('should calculate score based on solved rows', () => {
            calculateScore(state)
            // Should have base difficulty score at minimum
            expect(state.score).toBeGreaterThanOrEqual(150) // Easy difficulty
        })

        it('should increment solvedRows for complete non-conflicting rows', () => {
            // Fill row 0 with 1-9, no conflicts — triggers solvedRows++ (lines 213-214)
            for (let c = 0; c < 9; c++) {
                state.grid.cells[0][c].value = c + 1
                state.grid.cells[0][c].isConflicting = false
            }
            calculateScore(state)
            // Score should be > base (at least 1 row bonus applied: 1*1*10 + 150 = 160)
            expect(state.score).toBeGreaterThan(150)
        })
    })

    describe('placeNumber completion', () => {
        it('should set isComplete when last cell is correctly placed', () => {
            const solvedGrid = createSolvedGrid()

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

            selectCell(state, 8, 8)
            placeNumber(state, solvedGrid[8][8])

            expect(state.isComplete).toBe(true)
        })
    })
})
