// 2048 Game Unit Tests

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
    createGameState,
    spawnTile,
    move,
    startGame,
    resetGame,
    checkGameOver,
    checkWin,
    endGame,
    processMove,
} from './game'
import {
    getEmptyCells,
    canMove,
    getMaxTile,
    getTileColor,
    getTileTextColor,
    cloneBoard,
    createEmptyBoard,
    getTileFontSize,
    getCellPixelPosition,
    getRandomEmptyPosition,
    getNewTileValue,
    generateTileId,
} from './utils'
import { type Board, type GameState, type Tile, GAME_CONSTANTS } from './types'

describe('2048 Game Utils', () => {
    describe('createEmptyBoard', () => {
        it('should create a 4x4 board filled with nulls', () => {
            const board = createEmptyBoard()
            expect(board.length).toBe(4)
            expect(board[0].length).toBe(4)
            board.forEach(row => {
                row.forEach(cell => {
                    expect(cell).toBeNull()
                })
            })
        })
    })

    describe('getEmptyCells', () => {
        it('should return all positions for an empty board', () => {
            const board = createEmptyBoard()
            const emptyCells = getEmptyCells(board)
            expect(emptyCells.length).toBe(16)
        })

        it('should return correct positions with some tiles', () => {
            const board = createEmptyBoard()
            board[0][0] = {
                id: 'tile-1',
                value: 2,
                position: { row: 0, col: 0 },
            }
            board[1][1] = {
                id: 'tile-2',
                value: 4,
                position: { row: 1, col: 1 },
            }
            const emptyCells = getEmptyCells(board)
            expect(emptyCells.length).toBe(14)
            expect(emptyCells).not.toContainEqual({ row: 0, col: 0 })
            expect(emptyCells).not.toContainEqual({ row: 1, col: 1 })
        })

        it('should return empty array for full board', () => {
            const board: Board = []
            for (let row = 0; row < 4; row++) {
                board.push([])
                for (let col = 0; col < 4; col++) {
                    board[row].push({
                        id: `tile-${row * 4 + col}`,
                        value: 2,
                        position: { row, col },
                    })
                }
            }
            const emptyCells = getEmptyCells(board)
            expect(emptyCells.length).toBe(0)
        })
    })

    describe('canMove', () => {
        it('should return true for board with empty cells', () => {
            const board = createEmptyBoard()
            board[0][0] = {
                id: 'tile-1',
                value: 2,
                position: { row: 0, col: 0 },
            }
            expect(canMove(board)).toBe(true)
        })

        it('should return true for full board with adjacent matching tiles (horizontal)', () => {
            const board: Board = []
            let id = 0
            for (let row = 0; row < 4; row++) {
                board.push([])
                for (let col = 0; col < 4; col++) {
                    board[row].push({
                        id: `tile-${id++}`,
                        value: (row * 4 + col) * 2 + 2, // Different values
                        position: { row, col },
                    })
                }
            }
            // Make two adjacent tiles match
            board[0][0]!.value = 2
            board[0][1]!.value = 2
            expect(canMove(board)).toBe(true)
        })

        it('should return true for full board with adjacent matching tiles (vertical)', () => {
            const board: Board = []
            let id = 0
            for (let row = 0; row < 4; row++) {
                board.push([])
                for (let col = 0; col < 4; col++) {
                    board[row].push({
                        id: `tile-${id++}`,
                        value: (row * 4 + col) * 2 + 2, // Different values
                        position: { row, col },
                    })
                }
            }
            // Make two adjacent tiles match vertically
            board[0][0]!.value = 2
            board[1][0]!.value = 2
            expect(canMove(board)).toBe(true)
        })

        it('should return false for full board with no matching adjacent tiles', () => {
            // Create a board where no adjacent tiles match
            const values = [
                [2, 4, 2, 4],
                [4, 2, 4, 2],
                [2, 4, 2, 4],
                [4, 2, 4, 2],
            ]
            const board: Board = values.map((row, r) =>
                row.map((value, c) => ({
                    id: `tile-${r * 4 + c}`,
                    value,
                    position: { row: r, col: c },
                }))
            )
            expect(canMove(board)).toBe(false)
        })
    })

    describe('getMaxTile', () => {
        it('should return 0 for empty board', () => {
            const board = createEmptyBoard()
            expect(getMaxTile(board)).toBe(0)
        })

        it('should return highest tile value', () => {
            const board = createEmptyBoard()
            board[0][0] = {
                id: 'tile-1',
                value: 2,
                position: { row: 0, col: 0 },
            }
            board[1][1] = {
                id: 'tile-2',
                value: 256,
                position: { row: 1, col: 1 },
            }
            board[2][2] = {
                id: 'tile-3',
                value: 32,
                position: { row: 2, col: 2 },
            }
            expect(getMaxTile(board)).toBe(256)
        })
    })

    describe('cloneBoard', () => {
        it('should create a deep copy of the board', () => {
            const board = createEmptyBoard()
            board[0][0] = {
                id: 'tile-1',
                value: 2,
                position: { row: 0, col: 0 },
            }
            const clone = cloneBoard(board)

            // Modify original
            board[0][0]!.value = 4
            board[1][1] = {
                id: 'tile-2',
                value: 8,
                position: { row: 1, col: 1 },
            }

            // Clone should be unchanged
            expect(clone[0][0]!.value).toBe(2)
            expect(clone[1][1]).toBeNull()
        })
    })

    describe('getTileColor', () => {
        it('should return correct colors for known values', () => {
            expect(getTileColor(2)).toBe(0x1a1a2e)
            expect(getTileColor(4)).toBe(0x16213e)
            expect(getTileColor(2048)).toBe(0x00ffff)
        })

        it('should return magenta for values > 2048', () => {
            expect(getTileColor(4096)).toBe(0xff00ff)
            expect(getTileColor(8192)).toBe(0xff00ff)
        })
    })

    describe('getTileTextColor', () => {
        it('should return cyan for small values', () => {
            expect(getTileTextColor(2)).toBe(0x00ffff)
            expect(getTileTextColor(4)).toBe(0x00ffff)
        })

        it('should return dark for light backgrounds', () => {
            expect(getTileTextColor(128)).toBe(0x1a1a2e)
            expect(getTileTextColor(256)).toBe(0x1a1a2e)
            expect(getTileTextColor(2048)).toBe(0x1a1a2e)
        })

        it('should return white for medium values', () => {
            expect(getTileTextColor(8)).toBe(0xffffff)
            expect(getTileTextColor(64)).toBe(0xffffff)
        })
    })

    describe('getTileFontSize', () => {
        it('should return 36 for values under 100', () => {
            expect(getTileFontSize(2)).toBe(36)
            expect(getTileFontSize(64)).toBe(36)
        })

        it('should return 30 for values 100-999', () => {
            expect(getTileFontSize(128)).toBe(30)
            expect(getTileFontSize(512)).toBe(30)
        })

        it('should return 24 for values 1000-9999', () => {
            expect(getTileFontSize(1024)).toBe(24)
            expect(getTileFontSize(4096)).toBe(24)
        })

        it('should return 20 for values >= 10000', () => {
            expect(getTileFontSize(16384)).toBe(20)
        })
    })

    describe('getCellPixelPosition', () => {
        it('should return correct pixel position for (0,0)', () => {
            const { TILE_SIZE, GAP } = GAME_CONSTANTS
            const pos = getCellPixelPosition(0, 0)
            expect(pos.x).toBe(GAP + TILE_SIZE / 2)
            expect(pos.y).toBe(GAP + TILE_SIZE / 2)
        })

        it('should increase x for increasing col', () => {
            const pos0 = getCellPixelPosition(0, 0)
            const pos1 = getCellPixelPosition(0, 1)
            expect(pos1.x).toBeGreaterThan(pos0.x)
        })

        it('should increase y for increasing row', () => {
            const pos0 = getCellPixelPosition(0, 0)
            const pos1 = getCellPixelPosition(1, 0)
            expect(pos1.y).toBeGreaterThan(pos0.y)
        })
    })

    describe('getRandomEmptyPosition', () => {
        it('should return a position from an empty board', () => {
            const board = createEmptyBoard()
            const pos = getRandomEmptyPosition(board)
            expect(pos).not.toBeNull()
            expect(pos!.row).toBeGreaterThanOrEqual(0)
            expect(pos!.col).toBeGreaterThanOrEqual(0)
        })

        it('should return null when board is full', () => {
            const board = createEmptyBoard()
            const dummyTile: Tile = {
                id: 'test',
                value: 2,
                position: { row: 0, col: 0 },
            }
            for (let r = 0; r < GAME_CONSTANTS.BOARD_SIZE; r++) {
                for (let c = 0; c < GAME_CONSTANTS.BOARD_SIZE; c++) {
                    board[r][c] = { ...dummyTile, position: { row: r, col: c } }
                }
            }
            const pos = getRandomEmptyPosition(board)
            expect(pos).toBeNull()
        })
    })

    describe('getNewTileValue', () => {
        it('should return 2 or 4', () => {
            for (let i = 0; i < 20; i++) {
                const value = getNewTileValue()
                expect([2, 4]).toContain(value)
            }
        })
    })

    describe('generateTileId', () => {
        it('should generate id with counter', () => {
            const state = createGameState()
            state.tileIdCounter = 5
            const id = generateTileId(state)
            expect(id).toBe('tile-5')
        })
    })
})

describe('2048 Game Logic', () => {
    let state: GameState

    beforeEach(() => {
        state = createGameState()
    })

    describe('createGameState', () => {
        it('should create initial state with empty board', () => {
            expect(state.board.length).toBe(4)
            expect(state.score).toBe(0)
            expect(state.gameStarted).toBe(false)
            expect(state.gameOver).toBe(false)
            expect(state.won).toBe(false)
            expect(state.moveCount).toBe(0)
            expect(state.tileIdCounter).toBe(0)
        })
    })

    describe('spawnTile', () => {
        it('should spawn a tile in an empty cell', () => {
            const result = spawnTile(state)
            const emptyCells = getEmptyCells(result.state.board)
            expect(emptyCells.length).toBe(15)
            expect(result.animation).not.toBeNull()
            expect(result.animation!.type).toBe('spawn')
        })

        it('should spawn tile with value 2 or 4', () => {
            const result = spawnTile(state)
            const tiles = result.state.board
                .flat()
                .filter((t): t is Tile => t !== null)
            expect([2, 4]).toContain(tiles[0].value)
        })

        it('should increment tileIdCounter', () => {
            const result = spawnTile(state)
            expect(result.state.tileIdCounter).toBe(1)
        })

        it('should return null animation when board is full', () => {
            // Fill the board
            for (let row = 0; row < 4; row++) {
                for (let col = 0; col < 4; col++) {
                    state.board[row][col] = {
                        id: `tile-${row * 4 + col}`,
                        value: 2,
                        position: { row, col },
                    }
                }
            }
            const result = spawnTile(state)
            expect(result.animation).toBeNull()
        })
    })

    describe('move', () => {
        it('should not move when game not started', () => {
            state.board[0][0] = {
                id: 'tile-1',
                value: 2,
                position: { row: 0, col: 0 },
            }
            const result = move(state, 'right')
            expect(result.moved).toBe(false)
        })

        it('should slide tiles to the left', () => {
            state.gameStarted = true
            state.board[0][3] = {
                id: 'tile-1',
                value: 2,
                position: { row: 0, col: 3 },
            }
            const result = move(state, 'left')
            expect(result.moved).toBe(true)
            expect(result.board[0][0]!.value).toBe(2)
            expect(result.board[0][3]).toBeNull()
        })

        it('should slide tiles to the right', () => {
            state.gameStarted = true
            state.board[0][0] = {
                id: 'tile-1',
                value: 2,
                position: { row: 0, col: 0 },
            }
            const result = move(state, 'right')
            expect(result.moved).toBe(true)
            expect(result.board[0][3]!.value).toBe(2)
            expect(result.board[0][0]).toBeNull()
        })

        it('should slide tiles up', () => {
            state.gameStarted = true
            state.board[3][0] = {
                id: 'tile-1',
                value: 2,
                position: { row: 3, col: 0 },
            }
            const result = move(state, 'up')
            expect(result.moved).toBe(true)
            expect(result.board[0][0]!.value).toBe(2)
            expect(result.board[3][0]).toBeNull()
        })

        it('should slide tiles down', () => {
            state.gameStarted = true
            state.board[0][0] = {
                id: 'tile-1',
                value: 2,
                position: { row: 0, col: 0 },
            }
            const result = move(state, 'down')
            expect(result.moved).toBe(true)
            expect(result.board[3][0]!.value).toBe(2)
            expect(result.board[0][0]).toBeNull()
        })

        it('should merge matching tiles', () => {
            state.gameStarted = true
            state.board[0][0] = {
                id: 'tile-1',
                value: 2,
                position: { row: 0, col: 0 },
            }
            state.board[0][1] = {
                id: 'tile-2',
                value: 2,
                position: { row: 0, col: 1 },
            }
            const result = move(state, 'left')
            expect(result.moved).toBe(true)
            expect(result.board[0][0]!.value).toBe(4)
            expect(result.board[0][1]).toBeNull()
            expect(result.scoreGained).toBe(4)
            expect(result.mergeCount).toBe(1)
        })

        it('should only merge once per tile per move', () => {
            state.gameStarted = true
            // Three 2s in a row: [2, 2, 2, null] should become [4, 2, null, null] moving left
            state.board[0][0] = {
                id: 'tile-1',
                value: 2,
                position: { row: 0, col: 0 },
            }
            state.board[0][1] = {
                id: 'tile-2',
                value: 2,
                position: { row: 0, col: 1 },
            }
            state.board[0][2] = {
                id: 'tile-3',
                value: 2,
                position: { row: 0, col: 2 },
            }
            const result = move(state, 'left')
            expect(result.board[0][0]!.value).toBe(4)
            expect(result.board[0][1]!.value).toBe(2)
            expect(result.board[0][2]).toBeNull()
            expect(result.mergeCount).toBe(1)
        })

        it('should merge four tiles into two pairs', () => {
            state.gameStarted = true
            // [2, 2, 2, 2] should become [4, 4, null, null] moving left
            state.board[0][0] = {
                id: 'tile-1',
                value: 2,
                position: { row: 0, col: 0 },
            }
            state.board[0][1] = {
                id: 'tile-2',
                value: 2,
                position: { row: 0, col: 1 },
            }
            state.board[0][2] = {
                id: 'tile-3',
                value: 2,
                position: { row: 0, col: 2 },
            }
            state.board[0][3] = {
                id: 'tile-4',
                value: 2,
                position: { row: 0, col: 3 },
            }
            const result = move(state, 'left')
            expect(result.board[0][0]!.value).toBe(4)
            expect(result.board[0][1]!.value).toBe(4)
            expect(result.board[0][2]).toBeNull()
            expect(result.board[0][3]).toBeNull()
            expect(result.scoreGained).toBe(8)
            expect(result.mergeCount).toBe(2)
        })

        it('should not merge non-matching tiles', () => {
            state.gameStarted = true
            state.board[0][0] = {
                id: 'tile-1',
                value: 2,
                position: { row: 0, col: 0 },
            }
            state.board[0][1] = {
                id: 'tile-2',
                value: 4,
                position: { row: 0, col: 1 },
            }
            const result = move(state, 'left')
            expect(result.board[0][0]!.value).toBe(2)
            expect(result.board[0][1]!.value).toBe(4)
            expect(result.mergeCount).toBe(0)
        })

        it('should return moved=false when no tiles can move', () => {
            state.gameStarted = true
            state.board[0][0] = {
                id: 'tile-1',
                value: 2,
                position: { row: 0, col: 0 },
            }
            const result = move(state, 'left') // Tile already at left edge
            expect(result.moved).toBe(false)
        })
    })

    describe('startGame', () => {
        it('should spawn initial tiles', () => {
            const startedState = startGame(state)
            const tiles = startedState.board.flat().filter(t => t !== null)
            expect(tiles.length).toBe(GAME_CONSTANTS.INITIAL_TILES)
            expect(startedState.gameStarted).toBe(true)
        })
    })

    describe('resetGame', () => {
        it('should reset to initial state', () => {
            state.gameStarted = true
            state.score = 100
            state.moveCount = 10
            const resetState = resetGame(state)
            expect(resetState.gameStarted).toBe(false)
            expect(resetState.score).toBe(0)
            expect(resetState.moveCount).toBe(0)
        })
    })

    describe('checkGameOver', () => {
        it('should return false when moves are available', () => {
            state.board[0][0] = {
                id: 'tile-1',
                value: 2,
                position: { row: 0, col: 0 },
            }
            expect(checkGameOver(state)).toBe(false)
        })

        it('should return true when no moves available', () => {
            const values = [
                [2, 4, 2, 4],
                [4, 2, 4, 2],
                [2, 4, 2, 4],
                [4, 2, 4, 2],
            ]
            state.board = values.map((row, r) =>
                row.map((value, c) => ({
                    id: `tile-${r * 4 + c}`,
                    value,
                    position: { row: r, col: c },
                }))
            )
            expect(checkGameOver(state)).toBe(true)
        })
    })

    describe('checkWin', () => {
        it('should return false when no 2048 tile', () => {
            state.board[0][0] = {
                id: 'tile-1',
                value: 1024,
                position: { row: 0, col: 0 },
            }
            expect(checkWin(state)).toBe(false)
        })

        it('should return true when 2048 tile exists', () => {
            state.board[0][0] = {
                id: 'tile-1',
                value: 2048,
                position: { row: 0, col: 0 },
            }
            expect(checkWin(state)).toBe(true)
        })

        it('should return true for values higher than 2048', () => {
            state.board[0][0] = {
                id: 'tile-1',
                value: 4096,
                position: { row: 0, col: 0 },
            }
            expect(checkWin(state)).toBe(true)
        })
    })

    describe('endGame', () => {
        it('should set gameOver to true', () => {
            state.score = 500
            state.maxTile = 256
            state.moveCount = 50
            const { state: endedState, stats } = endGame(state, 25)
            expect(endedState.gameOver).toBe(true)
            expect(stats.finalScore).toBe(500)
            expect(stats.maxTile).toBe(256)
            expect(stats.moveCount).toBe(50)
            expect(stats.mergeCount).toBe(25)
        })
    })

    describe('processMove', () => {
        it('should process a complete move with callbacks', () => {
            const onScoreChange = vi.fn()
            const onMove = vi.fn()

            state = startGame(state)
            // Place tiles for a merge
            state.board = createEmptyBoard()
            state.board[0][0] = {
                id: 'tile-1',
                value: 2,
                position: { row: 0, col: 0 },
            }
            state.board[0][1] = {
                id: 'tile-2',
                value: 2,
                position: { row: 0, col: 1 },
            }

            const result = processMove(state, 'left', 0, {
                onScoreChange,
                onMove,
            })

            // Execute callbacks
            result.callbacksToInvoke.forEach(cb => cb())

            expect(result.state.score).toBe(4)
            expect(result.totalMerges).toBe(1)
            expect(onScoreChange).toHaveBeenCalledWith(4)
            expect(onMove).toHaveBeenCalled()
        })

        it('should trigger onWin when reaching 2048', () => {
            const onWin = vi.fn()

            state = startGame(state)
            state.board = createEmptyBoard()
            state.board[0][0] = {
                id: 'tile-1',
                value: 1024,
                position: { row: 0, col: 0 },
            }
            state.board[0][1] = {
                id: 'tile-2',
                value: 1024,
                position: { row: 0, col: 1 },
            }

            const result = processMove(state, 'left', 0, { onWin })

            // Execute callbacks
            result.callbacksToInvoke.forEach(cb => cb())

            expect(result.state.won).toBe(true)
            expect(onWin).toHaveBeenCalled()
        })

        it('should trigger onGameOver when no moves left', () => {
            const onGameOver = vi.fn()

            state = startGame(state)
            // Create a board that will be game over after one move
            const values = [
                [2, 4, 2, 4],
                [4, 2, 4, 2],
                [2, 4, 2, 4],
                [4, 2, 4, null], // One empty cell for the spawn
            ]
            state.board = values.map((row, r) =>
                row.map((value, c) =>
                    value
                        ? {
                              id: `tile-${r * 4 + c}`,
                              value,
                              position: { row: r, col: c },
                          }
                        : null
                )
            )

            // Mock random to place spawned tile in last position with value that causes game over
            const mockRandom = vi.spyOn(Math, 'random')
            mockRandom.mockReturnValue(0.5) // This will spawn a 2

            const result = processMove(state, 'down', 0, { onGameOver })

            // If game over was triggered
            if (result.state.gameOver) {
                result.callbacksToInvoke.forEach(cb => cb())
                expect(onGameOver).toHaveBeenCalled()
            }

            mockRandom.mockRestore()
        })
    })
})
