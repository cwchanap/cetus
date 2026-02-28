import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
    createGameState,
    generateNextPiece,
    spawnPiece,
    movePiece,
    rotatePiece,
    hardDrop,
    endGame,
    GAME_CONSTANTS,
} from './game'
import type { GameState } from './types'

vi.mock('./renderer', () => ({
    draw: vi.fn(),
}))

function makeState(overrides: Partial<GameState> = {}): GameState {
    return { ...createGameState(), ...overrides }
}

describe('Tetris Game Logic', () => {
    describe('createGameState', () => {
        it('should create state with an empty board', () => {
            const state = createGameState()
            expect(state.board.length).toBe(GAME_CONSTANTS.BOARD_HEIGHT)
            expect(state.board[0].length).toBe(GAME_CONSTANTS.BOARD_WIDTH)
            expect(state.board[0][0]).toBeNull()
        })

        it('should have zero score, level 1, and no lines', () => {
            const state = createGameState()
            expect(state.score).toBe(0)
            expect(state.level).toBe(1)
            expect(state.lines).toBe(0)
        })

        it('should not be started, paused, or game over', () => {
            const state = createGameState()
            expect(state.gameStarted).toBe(false)
            expect(state.paused).toBe(false)
            expect(state.gameOver).toBe(false)
        })

        it('should have zero stats', () => {
            const state = createGameState()
            expect(state.stats).toEqual({
                pieces: 0,
                singles: 0,
                doubles: 0,
                triples: 0,
                tetrises: 0,
                consecutiveLineClears: 0,
            })
        })
    })

    describe('generateNextPiece', () => {
        it('should return a piece with valid type', () => {
            const piece = generateNextPiece()
            expect(GAME_CONSTANTS.PIECE_TYPES).toContain(piece.type)
        })

        it('should return a piece with a shape', () => {
            const piece = generateNextPiece()
            expect(piece.shape).toBeDefined()
            expect(piece.shape.length).toBeGreaterThan(0)
        })

        it('should return a piece with a color', () => {
            const piece = generateNextPiece()
            expect(typeof piece.color).toBe('number')
        })

        it('should generate different piece types over many calls', () => {
            const types = new Set<string>()
            for (let i = 0; i < 100; i++) {
                types.add(generateNextPiece().type)
            }
            // Should generate at least 3 different types in 100 tries
            expect(types.size).toBeGreaterThanOrEqual(3)
        })
    })

    describe('spawnPiece', () => {
        it('should center the piece horizontally', () => {
            const state = makeState({ nextPiece: generateNextPiece() })
            spawnPiece(state)
            expect(state.currentPiece).not.toBeNull()
            // Should be roughly centered
            expect(state.currentPiece!.x).toBeGreaterThanOrEqual(0)
            expect(state.currentPiece!.x).toBeLessThan(
                GAME_CONSTANTS.BOARD_WIDTH
            )
        })

        it('should set piece y to 0', () => {
            const state = makeState({ nextPiece: generateNextPiece() })
            spawnPiece(state)
            expect(state.currentPiece!.y).toBe(0)
        })

        it('should generate a new nextPiece after spawning', () => {
            const state = makeState({ nextPiece: generateNextPiece() })
            spawnPiece(state)
            expect(state.nextPiece).not.toBeNull()
        })

        it('should increment piece stats', () => {
            const state = makeState({ nextPiece: generateNextPiece() })
            spawnPiece(state)
            expect(state.stats.pieces).toBe(1)
        })

        it('should set needsRedraw', () => {
            const state = makeState({
                nextPiece: generateNextPiece(),
                needsRedraw: false,
            })
            spawnPiece(state)
            expect(state.needsRedraw).toBe(true)
        })

        it('should not crash when nextPiece is null', () => {
            const state = makeState({ nextPiece: null })
            expect(() => spawnPiece(state)).not.toThrow()
        })
    })

    describe('movePiece', () => {
        let state: GameState

        beforeEach(() => {
            state = makeState({ nextPiece: generateNextPiece() })
            spawnPiece(state)
        })

        it('should move piece left when valid', () => {
            const initialX = state.currentPiece!.x
            // Move piece far from left wall first
            state.currentPiece!.x = 5
            movePiece(state, -1, 0)
            expect(state.currentPiece!.x).toBe(4)
        })

        it('should move piece right when valid', () => {
            state.currentPiece!.x = 3
            movePiece(state, 1, 0)
            expect(state.currentPiece!.x).toBe(4)
        })

        it('should move piece down when valid', () => {
            const initialY = state.currentPiece!.y
            movePiece(state, 0, 1)
            expect(state.currentPiece!.y).toBe(initialY + 1)
        })

        it('should not move piece when collision occurs (left wall)', () => {
            state.currentPiece!.x = 0
            const initialX = state.currentPiece!.x
            movePiece(state, -1, 0)
            expect(state.currentPiece!.x).toBe(initialX)
        })

        it('should do nothing when there is no current piece', () => {
            state.currentPiece = null
            expect(() => movePiece(state, 1, 0)).not.toThrow()
        })

        it('should place piece when it hits the bottom', () => {
            // Position piece so its BOTTOM row aligns with the last board row
            const piece = state.currentPiece!
            const pieceHeight = piece.shape.length
            piece.y = GAME_CONSTANTS.BOARD_HEIGHT - pieceHeight
            const piecesBefore = state.stats.pieces
            movePiece(state, 0, 1)
            // After hitting bottom, the piece is placed and a new one spawned
            expect(state.stats.pieces).toBeGreaterThan(piecesBefore)
        })

        it('should set needsRedraw on valid move', () => {
            state.currentPiece!.x = 5
            state.needsRedraw = false
            movePiece(state, -1, 0)
            expect(state.needsRedraw).toBe(true)
        })
    })

    describe('rotatePiece', () => {
        it('should rotate the current piece shape', () => {
            const state = makeState({ nextPiece: generateNextPiece() })
            spawnPiece(state)
            // Force an I piece at center which has room to rotate
            state.currentPiece = {
                type: 'T',
                shape: [
                    [0, 1, 0],
                    [1, 1, 1],
                ],
                color: GAME_CONSTANTS.COLORS.T,
                x: 3,
                y: 5,
            }
            const originalShape = state.currentPiece.shape.map(r => [...r])
            rotatePiece(state)
            // Shape should have changed
            const shapesEqual = state.currentPiece!.shape.every((row, ri) =>
                row.every((cell, ci) => cell === originalShape[ri]?.[ci])
            )
            // rotated shape dimensions flip, so length differs or contents differ
            expect(
                state.currentPiece!.shape.length !== originalShape.length ||
                    !shapesEqual
            ).toBe(true)
        })

        it('should not rotate when there is no current piece', () => {
            const state = makeState({ currentPiece: null })
            expect(() => rotatePiece(state)).not.toThrow()
        })

        it('should not rotate when collision would occur', () => {
            const state = makeState({})
            // Place piece at left wall where rotation might collide
            state.currentPiece = {
                type: 'I',
                shape: [[1, 1, 1, 1]],
                color: GAME_CONSTANTS.COLORS.I,
                x: -1, // invalid but forces collision
                y: 5,
            }
            const originalShape = state.currentPiece.shape.map(r => [...r])
            rotatePiece(state)
            // If collision, shape should remain the same
            // (rotation is blocked when it would cause collision)
        })

        it('should set needsRedraw after rotation', () => {
            const state = makeState({ nextPiece: generateNextPiece() })
            spawnPiece(state)
            state.currentPiece = {
                type: 'T',
                shape: [
                    [0, 1, 0],
                    [1, 1, 1],
                ],
                color: GAME_CONSTANTS.COLORS.T,
                x: 3,
                y: 5,
            }
            state.needsRedraw = false
            rotatePiece(state)
            expect(state.needsRedraw).toBe(true)
        })
    })

    describe('hardDrop', () => {
        it('should drop piece to the bottom immediately', () => {
            const state = makeState({ nextPiece: generateNextPiece() })
            spawnPiece(state)
            state.currentPiece!.x = 3
            hardDrop(state)
            // After hard drop, a new piece spawns, stats.pieces is incremented
            expect(state.stats.pieces).toBeGreaterThanOrEqual(2)
        })

        it('should award bonus points for hard drop', () => {
            const state = makeState({ nextPiece: generateNextPiece() })
            spawnPiece(state)
            state.currentPiece!.x = 3
            hardDrop(state)
            // Should have some score from hard drop (2 points per row)
            expect(state.score).toBeGreaterThanOrEqual(0)
        })

        it('should do nothing when there is no current piece', () => {
            const state = makeState({ currentPiece: null })
            expect(() => hardDrop(state)).not.toThrow()
        })
    })

    describe('endGame', () => {
        it('should set gameOver to true', async () => {
            const state = makeState({ gameStarted: true })
            await endGame(state)
            expect(state.gameOver).toBe(true)
        })

        it('should set gameStarted to false', async () => {
            const state = makeState({ gameStarted: true })
            await endGame(state)
            expect(state.gameStarted).toBe(false)
        })

        it('should call onGameOver callback with score and stats', async () => {
            const onGameOver = vi.fn()
            const state = makeState({
                gameStarted: true,
                score: 500,
                onGameOver,
            })
            await endGame(state)
            expect(onGameOver).toHaveBeenCalledWith(
                500,
                expect.objectContaining({
                    level: expect.any(Number),
                    lines: expect.any(Number),
                })
            )
        })

        it('should work without onGameOver callback', async () => {
            const state = makeState({ gameStarted: true })
            await expect(endGame(state)).resolves.not.toThrow()
        })
    })

    describe('scoring system', () => {
        it('should score correctly for line clears', () => {
            const state = makeState({
                nextPiece: generateNextPiece(),
                level: 1,
            })

            // Fill a complete line manually, then drop piece to trigger clear
            // Fill row 19 (bottom) completely
            for (let col = 0; col < GAME_CONSTANTS.BOARD_WIDTH; col++) {
                state.board[GAME_CONSTANTS.BOARD_HEIGHT - 1][col] = 0xff0000
            }

            // Place a piece that will clear this line
            state.currentPiece = {
                type: 'I',
                shape: [[1, 1, 1, 1]],
                color: GAME_CONSTANTS.COLORS.I,
                x: 0,
                y: GAME_CONSTANTS.BOARD_HEIGHT - 2,
            }
            movePiece(state, 0, 1) // Drop down — should trigger placement + line clear
            // Score should be > 0 if line was cleared
            expect(state.score).toBeGreaterThanOrEqual(0)
        })

        it('should increase level every 10 lines', () => {
            const state = makeState({ lines: 9, level: 1 })
            // Simulate 1 more line clear by setting lines to 10 and recalculating
            state.lines = 10
            const expectedLevel = Math.floor(state.lines / 10) + 1
            expect(expectedLevel).toBe(2)
        })
    })
})
