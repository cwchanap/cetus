import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { TetrisGame, DEFAULT_TETRIS_CONFIG, GAME_CONSTANTS } from './TetrisGame'
import type { Piece, TetrisConfig } from './types'

describe('TetrisGame', () => {
    let game: TetrisGame

    beforeEach(() => {
        vi.useFakeTimers()
        // Stub rAF so the internal drop loop never auto-fires during unit tests
        vi.stubGlobal(
            'requestAnimationFrame',
            vi.fn(() => 0)
        )
        // Stub fetch so async score-saving in end() doesn't hit the network
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) })
        )
        game = new TetrisGame()
    })

    afterEach(() => {
        game.destroy()
        vi.unstubAllGlobals()
        vi.useRealTimers()
    })

    // Helper to activate the game without running the full start lifecycle
    function activateForLogic() {
        // @ts-expect-error - accessing protected state for testing
        game.state.isActive = true
        // @ts-expect-error - accessing protected state for testing
        game.state.gameStarted = true
    }

    function makePiece(overrides: Partial<Piece> = {}): Piece {
        return {
            type: 'I',
            shape: [[1, 1, 1, 1]],
            color: GAME_CONSTANTS.COLORS.I,
            x: 3,
            y: 0,
            ...overrides,
        }
    }

    function fillBoardRows(
        startRow: number,
        endRow: number,
        excludeCol: number
    ) {
        // @ts-expect-error - accessing protected state for testing
        const board = game.state.board
        for (let row = startRow; row < endRow; row++) {
            for (let col = 0; col < GAME_CONSTANTS.BOARD_WIDTH; col++) {
                if (col !== excludeCol) {
                    board[row][col] = 0xff0000
                }
            }
        }
    }

    describe('createInitialState', () => {
        it('should create state with an empty board', () => {
            const state = game.getState()
            expect(state.board.length).toBe(GAME_CONSTANTS.BOARD_HEIGHT)
            expect(state.board[0].length).toBe(GAME_CONSTANTS.BOARD_WIDTH)
            expect(state.board[0][0]).toBeNull()
        })

        it('should have zero score, level 1, and no lines', () => {
            const state = game.getState()
            expect(state.score).toBe(0)
            expect(state.level).toBe(DEFAULT_TETRIS_CONFIG.startingLevel)
            expect(state.lines).toBe(0)
        })

        it('should not be started, paused, or game over', () => {
            const state = game.getState()
            expect(state.gameStarted).toBe(false)
            expect(state.isPaused).toBe(false)
            expect(state.isGameOver).toBe(false)
            expect(state.isActive).toBe(false)
        })

        it('should have zeroed line stats', () => {
            expect(game.getState().stats).toEqual({
                pieces: 0,
                singles: 0,
                doubles: 0,
                triples: 0,
                tetrises: 0,
                consecutiveLineClears: 0,
            })
        })

        it('should prepare a next piece', () => {
            expect(game.getState().nextPiece).not.toBeNull()
            expect(GAME_CONSTANTS.PIECE_TYPES).toContain(
                game.getState().nextPiece!.type
            )
        })

        it('should start with the configured drop interval', () => {
            expect(game.getState().dropInterval).toBe(
                DEFAULT_TETRIS_CONFIG.baseDropInterval
            )
        })
    })

    describe('custom configuration', () => {
        it('should accept a custom starting level', () => {
            const custom = new TetrisGame({ startingLevel: 3 })
            expect(custom.getState().level).toBe(3)
            expect(custom.getState().dropInterval).toBe(
                DEFAULT_TETRIS_CONFIG.baseDropInterval - 2 * 50
            )
            custom.destroy()
        })

        it('should use default config values', () => {
            const config = game.getConfig()
            expect(config.boardWidth).toBe(DEFAULT_TETRIS_CONFIG.boardWidth)
            expect(config.boardHeight).toBe(DEFAULT_TETRIS_CONFIG.boardHeight)
            expect(config.blockSize).toBe(DEFAULT_TETRIS_CONFIG.blockSize)
        })
    })

    describe('piece generation', () => {
        it('should generate pieces with valid types over many calls', () => {
            const types = new Set<string>()
            for (let i = 0; i < 100; i++) {
                types.add((game as any).generateNextPiece().type)
            }
            expect(types.size).toBeGreaterThanOrEqual(3)
        })
    })

    describe('spawnPiece', () => {
        it('should center the piece horizontally', () => {
            activateForLogic()
            // @ts-expect-error - accessing protected state for testing
            game.state.nextPiece = makePiece()
            // @ts-expect-error - accessing protected method for testing
            game.spawnPiece()
            // @ts-expect-error - accessing protected state for testing
            expect(game.state.currentPiece).not.toBeNull()
            // @ts-expect-error - accessing protected state for testing
            expect(game.state.currentPiece.x).toBeGreaterThanOrEqual(0)
            // @ts-expect-error - accessing protected state for testing
            expect(game.state.currentPiece.x).toBeLessThan(
                GAME_CONSTANTS.BOARD_WIDTH
            )
        })

        it('should set piece y to 0', () => {
            activateForLogic()
            // @ts-expect-error - accessing protected state for testing
            game.state.nextPiece = makePiece({ x: 5, y: 9 })
            // @ts-expect-error - accessing protected method for testing
            game.spawnPiece()
            // @ts-expect-error - accessing protected state for testing
            expect(game.state.currentPiece.y).toBe(0)
        })

        it('should generate a new nextPiece after spawning', () => {
            activateForLogic()
            // @ts-expect-error - accessing protected method for testing
            game.spawnPiece()
            expect(game.getState().nextPiece).not.toBeNull()
        })

        it('should increment piece stats', () => {
            activateForLogic()
            const before = game.getState().stats.pieces
            // @ts-expect-error - accessing protected method for testing
            game.spawnPiece()
            expect(game.getState().stats.pieces).toBe(before + 1)
        })

        it('should set needsRedraw', () => {
            activateForLogic()
            // @ts-expect-error - accessing protected state for testing
            game.state.needsRedraw = false
            // @ts-expect-error - accessing protected method for testing
            game.spawnPiece()
            expect(game.getState().needsRedraw).toBe(true)
        })

        it('should end the game when spawned piece collides immediately', async () => {
            game.start() // active game, first piece spawned on empty board
            // I-piece spawns centered at x=3 (cols 3-6), y=0
            // @ts-expect-error - accessing protected state for testing
            game.state.nextPiece = makePiece()
            // Fill the spawn row at cols 3-6 to force immediate collision
            // @ts-expect-error - accessing protected state for testing
            game.state.board[0][3] = 0xff0000
            // @ts-expect-error - accessing protected state for testing
            game.state.board[0][4] = 0xff0000
            // @ts-expect-error - accessing protected state for testing
            game.state.board[0][5] = 0xff0000
            // @ts-expect-error - accessing protected state for testing
            game.state.board[0][6] = 0xff0000
            // @ts-expect-error - accessing protected method for testing
            game.spawnPiece()
            // Allow the async end() to flip flags (isGameOver set synchronously)
            await vi.runAllTimersAsync()
            expect(game.getState().isGameOver).toBe(true)
            expect(game.getState().isActive).toBe(false)
        })
    })

    describe('movement', () => {
        beforeEach(() => {
            activateForLogic()
            // @ts-expect-error - accessing protected state for testing
            game.state.currentPiece = makePiece({ x: 5, y: 5 })
        })

        it('should move piece left when valid', () => {
            game.moveLeft()
            // @ts-expect-error - accessing protected state for testing
            expect(game.state.currentPiece.x).toBe(4)
        })

        it('should move piece right when valid', () => {
            game.moveRight()
            // @ts-expect-error - accessing protected state for testing
            expect(game.state.currentPiece.x).toBe(6)
        })

        it('should move piece down when valid', () => {
            game.softDrop()
            // @ts-expect-error - accessing protected state for testing
            expect(game.state.currentPiece.y).toBe(6)
        })

        it('should not move piece into the left wall', () => {
            // @ts-expect-error - accessing protected state for testing
            game.state.currentPiece.x = 0
            game.moveLeft()
            // @ts-expect-error - accessing protected state for testing
            expect(game.state.currentPiece.x).toBe(0)
        })

        it('should not move piece into the right wall', () => {
            // @ts-expect-error - accessing protected state for testing
            game.state.currentPiece.x = GAME_CONSTANTS.BOARD_WIDTH - 4
            game.moveRight()
            // @ts-expect-error - accessing protected state for testing
            expect(game.state.currentPiece.x).toBe(
                GAME_CONSTANTS.BOARD_WIDTH - 4
            )
        })

        it('should set needsRedraw on a valid move', () => {
            // @ts-expect-error - accessing protected state for testing
            game.state.needsRedraw = false
            game.moveLeft()
            expect(game.getState().needsRedraw).toBe(true)
        })

        it('should do nothing when there is no current piece', () => {
            // @ts-expect-error - accessing protected state for testing
            game.state.currentPiece = null
            expect(() => game.moveLeft()).not.toThrow()
        })

        it('should place the piece when it hits the bottom', () => {
            const piece = makePiece({ x: 3, y: 0 })
            const pieceHeight = piece.shape.length
            // @ts-expect-error - accessing protected state for testing
            game.state.currentPiece = {
                ...piece,
                y: GAME_CONSTANTS.BOARD_HEIGHT - pieceHeight,
            }
            const piecesBefore = game.getState().stats.pieces
            game.softDrop() // tries to move down → collides → placement
            expect(game.getState().stats.pieces).toBeGreaterThan(piecesBefore)
        })
    })

    describe('rotate', () => {
        it('should rotate the current piece shape', () => {
            activateForLogic()
            // @ts-expect-error - accessing protected state for testing
            game.state.currentPiece = {
                type: 'T',
                shape: [
                    [0, 1, 0],
                    [1, 1, 1],
                ],
                color: GAME_CONSTANTS.COLORS.T,
                x: 3,
                y: 5,
            }
            // @ts-expect-error - accessing protected state for testing
            const original = game.state.currentPiece.shape.map(r => [...r])
            game.rotate()
            // @ts-expect-error - accessing protected state for testing
            const rotated = game.state.currentPiece.shape
            const same =
                rotated.length === original.length &&
                rotated.every((row, ri) =>
                    row.every((cell, ci) => cell === original[ri]?.[ci])
                )
            expect(same).toBe(false)
        })

        it('should not rotate when there is no current piece', () => {
            activateForLogic()
            // @ts-expect-error - accessing protected state for testing
            game.state.currentPiece = null
            expect(() => game.rotate()).not.toThrow()
        })

        it('should not rotate when collision would occur', () => {
            activateForLogic()
            // @ts-expect-error - accessing protected state for testing
            game.state.currentPiece = {
                type: 'I',
                shape: [[1, 1, 1, 1]],
                color: GAME_CONSTANTS.COLORS.I,
                x: -1, // forces collision on rotate
                y: 5,
            }
            // @ts-expect-error - accessing protected state for testing
            const original = game.state.currentPiece.shape.map(r => [...r])
            game.rotate()
            // @ts-expect-error - accessing protected state for testing
            expect(game.state.currentPiece.shape).toEqual(original)
        })

        it('should set needsRedraw after rotation', () => {
            activateForLogic()
            // @ts-expect-error - accessing protected state for testing
            game.state.currentPiece = {
                type: 'T',
                shape: [
                    [0, 1, 0],
                    [1, 1, 1],
                ],
                color: GAME_CONSTANTS.COLORS.T,
                x: 3,
                y: 5,
            }
            // @ts-expect-error - accessing protected state for testing
            game.state.needsRedraw = false
            game.rotate()
            expect(game.getState().needsRedraw).toBe(true)
        })
    })

    describe('hardDrop', () => {
        beforeEach(() => {
            activateForLogic()
            // @ts-expect-error - accessing protected state for testing
            game.state.currentPiece = makePiece({ x: 3, y: 0 })
        })

        it('should drop the piece to the bottom immediately', () => {
            const piecesBefore = game.getState().stats.pieces
            game.hardDrop()
            // After placement a new piece is spawned, incrementing pieces
            expect(game.getState().stats.pieces).toBeGreaterThan(piecesBefore)
        })

        it('should award bonus points for hard drop', () => {
            const initialScore = game.getState().score
            // @ts-expect-error - accessing protected state for testing
            const startY = game.state.currentPiece.y
            game.hardDrop()
            // After hardDrop the original piece is placed (y changed during drop)
            // Expect at least 2 points per row dropped
            const minBonus = (GAME_CONSTANTS.BOARD_HEIGHT - 1 - startY) * 2
            expect(game.getState().score).toBeGreaterThanOrEqual(
                initialScore + minBonus
            )
        })

        it('should do nothing when there is no current piece', () => {
            // @ts-expect-error - accessing protected state for testing
            game.state.currentPiece = null
            expect(() => game.hardDrop()).not.toThrow()
        })
    })

    describe('scoring and line clears', () => {
        beforeEach(() => {
            activateForLogic()
        })

        it('should score correctly for a single line clear', () => {
            // Fill the bottom row completely
            fillBoardRows(
                GAME_CONSTANTS.BOARD_HEIGHT - 1,
                GAME_CONSTANTS.BOARD_HEIGHT,
                -1
            )
            // @ts-expect-error - accessing protected state for testing
            game.state.currentPiece = {
                type: 'I',
                shape: [[1, 1, 1, 1]],
                color: GAME_CONSTANTS.COLORS.I,
                x: 0,
                y: GAME_CONSTANTS.BOARD_HEIGHT - 2,
            }
            const initialScore = game.getState().score
            game.softDrop() // moves into row 19 → placement → clears 1 line
            // Single clear = 40 * level (level 1)
            expect(game.getState().score).toBe(initialScore + 40)
            expect(game.getState().lines).toBe(1)
            expect(game.getState().stats.singles).toBe(1)
        })

        it('should increment doubles stat when 2 lines are cleared', () => {
            fillBoardRows(
                GAME_CONSTANTS.BOARD_HEIGHT - 2,
                GAME_CONSTANTS.BOARD_HEIGHT,
                0
            )
            // @ts-expect-error - accessing protected state for testing
            game.state.currentPiece = {
                type: 'I',
                shape: [[1], [1]],
                color: GAME_CONSTANTS.COLORS.I,
                x: 0,
                y: GAME_CONSTANTS.BOARD_HEIGHT - 2,
            }
            game.softDrop()
            expect(game.getState().stats.doubles).toBe(1)
        })

        it('should increment triples stat when 3 lines are cleared', () => {
            fillBoardRows(
                GAME_CONSTANTS.BOARD_HEIGHT - 3,
                GAME_CONSTANTS.BOARD_HEIGHT,
                0
            )
            // @ts-expect-error - accessing protected state for testing
            game.state.currentPiece = {
                type: 'I',
                shape: [[1], [1], [1]],
                color: GAME_CONSTANTS.COLORS.I,
                x: 0,
                y: GAME_CONSTANTS.BOARD_HEIGHT - 3,
            }
            game.softDrop()
            expect(game.getState().stats.triples).toBe(1)
        })

        it('should increment tetrises stat when 4 lines are cleared', () => {
            fillBoardRows(
                GAME_CONSTANTS.BOARD_HEIGHT - 4,
                GAME_CONSTANTS.BOARD_HEIGHT,
                0
            )
            // @ts-expect-error - accessing protected state for testing
            game.state.currentPiece = {
                type: 'I',
                shape: [[1], [1], [1], [1]],
                color: GAME_CONSTANTS.COLORS.I,
                x: 0,
                y: GAME_CONSTANTS.BOARD_HEIGHT - 4,
            }
            game.softDrop()
            expect(game.getState().stats.tetrises).toBe(1)
            expect(game.getState().stats.consecutiveLineClears).toBe(1)
        })

        it('should reset consecutiveLineClears when no lines are cleared', () => {
            // @ts-expect-error - accessing protected state for testing
            game.state.stats.consecutiveLineClears = 3
            // Place a piece that clears no lines (empty board)
            // @ts-expect-error - accessing protected state for testing
            game.state.currentPiece = makePiece({
                x: 3,
                y: GAME_CONSTANTS.BOARD_HEIGHT - 1,
            })
            game.softDrop()
            expect(game.getState().stats.consecutiveLineClears).toBe(0)
        })

        it('should increase level (and speed up) when crossing 10 lines', () => {
            // @ts-expect-error - accessing protected state for testing
            game.state.lines = 9
            // @ts-expect-error - accessing protected state for testing
            game.state.level = 1
            fillBoardRows(
                GAME_CONSTANTS.BOARD_HEIGHT - 4,
                GAME_CONSTANTS.BOARD_HEIGHT,
                0
            )
            // @ts-expect-error - accessing protected state for testing
            game.state.currentPiece = {
                type: 'I',
                shape: [[1], [1], [1], [1]],
                color: GAME_CONSTANTS.COLORS.I,
                x: 0,
                y: GAME_CONSTANTS.BOARD_HEIGHT - 4,
            }
            game.softDrop() // clears 4 lines → lines 9 → 13, crosses 10 → level 2
            expect(game.getState().lines).toBe(13)
            expect(game.getState().level).toBe(2)
            expect(game.getState().dropInterval).toBe(
                DEFAULT_TETRIS_CONFIG.baseDropInterval - 50
            )
        })
    })

    describe('game lifecycle', () => {
        it('should start the game and spawn the first piece', () => {
            game.start()
            const state = game.getState()
            expect(state.isActive).toBe(true)
            expect(state.gameStarted).toBe(true)
            expect(state.isGameOver).toBe(false)
            expect(state.currentPiece).not.toBeNull()
        })

        it('should pause and resume the game', () => {
            game.start()
            game.pause()
            expect(game.getState().isPaused).toBe(true)
            game.resume()
            expect(game.getState().isPaused).toBe(false)
        })

        it('should not pause when game is not active', () => {
            game.pause()
            expect(game.getState().isPaused).toBe(false)
        })

        it('should reset the game', () => {
            game.start()
            game.reset()
            const state = game.getState()
            expect(state.isActive).toBe(false)
            expect(state.gameStarted).toBe(false)
            expect(state.score).toBe(0)
            expect(state.lines).toBe(0)
            expect(state.currentPiece).toBeNull()
        })

        it('should end the game via end()', async () => {
            game.start()
            await game.end()
            const state = game.getState()
            expect(state.isActive).toBe(false)
            expect(state.isGameOver).toBe(true)
        })
    })

    describe('input guards', () => {
        it('should ignore movement when not active', () => {
            // @ts-expect-error - accessing protected state for testing
            game.state.currentPiece = makePiece({ x: 5, y: 5 })
            const before = game.getState().currentPiece
            game.moveLeft()
            expect(game.getState().currentPiece).toEqual(before)
        })

        it('should ignore movement when paused', () => {
            game.start()
            game.pause()
            // @ts-expect-error - accessing protected state for testing
            game.state.currentPiece = makePiece({ x: 5, y: 5 })
            game.moveLeft()
            // @ts-expect-error - accessing protected state for testing
            expect(game.state.currentPiece.x).toBe(5)
        })
    })

    describe('callbacks', () => {
        it('should call onStart callback when game starts', () => {
            const onStart = vi.fn()
            const g = new TetrisGame({}, { onStart })
            g.start()
            expect(onStart).toHaveBeenCalled()
            g.destroy()
        })

        it('should call onPause and onResume callbacks', () => {
            const onPause = vi.fn()
            const onResume = vi.fn()
            const g = new TetrisGame({}, { onPause, onResume })
            g.start()
            g.pause()
            g.resume()
            expect(onPause).toHaveBeenCalled()
            expect(onResume).toHaveBeenCalled()
            g.destroy()
        })

        it('should call onScoreUpdate callback when score changes', () => {
            const onScoreUpdate = vi.fn()
            const g = new TetrisGame({}, { onScoreUpdate })
            g.start()
            g.addScore(40, 'line_clear')
            expect(onScoreUpdate).toHaveBeenCalledWith(40)
            g.destroy()
        })

        it('should call onStateChange callback', () => {
            const onStateChange = vi.fn()
            const g = new TetrisGame({}, { onStateChange })
            g.start()
            g.reset()
            expect(onStateChange).toHaveBeenCalled()
            g.destroy()
        })
    })

    describe('stats and game data', () => {
        it('should return correct initial game stats', () => {
            const stats = game.getGameStats()
            expect(stats.finalScore).toBe(0)
            expect(stats.lines).toBe(0)
            expect(stats.level).toBe(DEFAULT_TETRIS_CONFIG.startingLevel)
            expect(stats.gameCompleted).toBe(false)
        })

        it('should expose achievement-relevant game data', () => {
            game.start()
            // @ts-expect-error - getGameData is protected
            const data = game.getGameData()
            expect(data).toHaveProperty('doubles')
            expect(data).toHaveProperty('triples')
            expect(data).toHaveProperty('tetrises')
            expect(data).toHaveProperty('consecutiveLineClears')
            expect(data).toHaveProperty('piecesPlaced')
            expect(data).toHaveProperty('level')
            expect(data.piecesPlaced).toBeGreaterThanOrEqual(1)
        })
    })

    describe('markRendered', () => {
        it('should clear the needsRedraw flag', () => {
            game.start()
            expect(game.getState().needsRedraw).toBe(true)
            game.markRendered()
            expect(game.getState().needsRedraw).toBe(false)
        })
    })

    describe('game loop drop', () => {
        it('should drop the active piece when the interval elapses', () => {
            game.start()
            // @ts-expect-error - accessing protected state for testing
            const piece = game.state.currentPiece
            const startY = piece!.y
            // Force the drop timer to be overdue
            // @ts-expect-error - accessing protected state for testing
            game.state.dropTime = Date.now() - (game.state.dropInterval + 100)
            game.update(16)
            // @ts-expect-error - accessing protected state for testing
            expect(game.state.currentPiece!.y).toBe(startY + 1)
        })

        it('should not drop the piece before the interval elapses', () => {
            game.start()
            // @ts-expect-error - accessing protected state for testing
            const piece = game.state.currentPiece
            const startY = piece!.y
            // @ts-expect-error - accessing protected state for testing
            game.state.dropTime = Date.now() // just reset → not overdue
            game.update(16)
            // @ts-expect-error - accessing protected state for testing
            expect(game.state.currentPiece!.y).toBe(startY)
        })
    })

    describe('update is a no-op when not active', () => {
        it('should not throw and should not mutate state', () => {
            const before = JSON.stringify(game.getState())
            game.update(16)
            game.render()
            expect(JSON.stringify(game.getState())).toBe(before)
        })
    })

    describe('cleanup', () => {
        it('should stop loops on destroy without throwing', () => {
            game.start()
            game.destroy()
            expect(() => game.cleanup()).not.toThrow()
        })
    })

    describe('TetrisConfig type compatibility', () => {
        it('should construct with a full override set', () => {
            const overrides: Partial<TetrisConfig> = {
                boardWidth: 8,
                boardHeight: 16,
                blockSize: 20,
                startingLevel: 2,
            }
            const g = new TetrisGame(overrides)
            expect(g.getState().board.length).toBe(16)
            expect(g.getState().board[0].length).toBe(8)
            expect(g.getState().level).toBe(2)
            g.destroy()
        })
    })
})
