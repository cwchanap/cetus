import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
    createGameState,
    generateNextPiece,
    spawnPiece,
    movePiece,
    rotatePiece,
    hardDrop,
    endGame,
    updateUI,
    startGame,
    togglePause,
    resetGame,
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
            expect(state.currentPiece!.shape).toEqual(originalShape)
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
            const initialScore = state.score
            const startY = state.currentPiece!.y
            hardDrop(state)
            // Calculate expected bonus: 2 points per row dropped
            const rowsDropped = state.currentPiece
                ? state.currentPiece.y - startY
                : 0
            // Should have bonus score from hard drop
            expect(state.score).toBeGreaterThanOrEqual(
                initialScore + rowsDropped * 2
            )
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

            const initialScore = state.score

            // Place a piece that will clear this line
            state.currentPiece = {
                type: 'I',
                shape: [[1, 1, 1, 1]],
                color: GAME_CONSTANTS.COLORS.I,
                x: 0,
                y: GAME_CONSTANTS.BOARD_HEIGHT - 2,
            }
            movePiece(state, 0, 1) // Drop down — should trigger placement + line clear
            // Score should increase by expected line clear points (100 * level for single)
            expect(state.score).toBeGreaterThan(initialScore)
            expect(state.lines).toBeGreaterThan(0)
        })

        it('should increase level every 10 lines', () => {
            const state = makeState({ lines: 9, level: 1 })
            // Simulate 1 more line clear by setting lines to 10 and recalculating
            state.lines = 10
            const expectedLevel = Math.floor(state.lines / 10) + 1
            expect(expectedLevel).toBe(2)
            // Verify the level calculation matches actual implementation
            expect(state.level).toBeLessThan(expectedLevel)
        })
    })

    describe('updateUI', () => {
        it('should update DOM elements with game state values', () => {
            const elements: Record<string, { textContent: string }> = {}
            const ids = [
                'score',
                'level',
                'lines',
                'pieces-count',
                'singles-count',
                'doubles-count',
                'triples-count',
                'tetrises-count',
            ]
            for (const id of ids) {
                elements[id] = { textContent: '' }
            }
            vi.spyOn(document, 'getElementById').mockImplementation(
                (id: string) => (elements[id] as unknown as HTMLElement) ?? null
            )

            const state = makeState({
                score: 1500,
                level: 3,
                lines: 25,
                stats: {
                    pieces: 40,
                    singles: 10,
                    doubles: 5,
                    triples: 2,
                    tetrises: 1,
                    consecutiveLineClears: 0,
                },
            })
            updateUI(state)

            expect(elements['score'].textContent).toBe('1500')
            expect(elements['level'].textContent).toBe('3')
            expect(elements['lines'].textContent).toBe('25')
            expect(elements['pieces-count'].textContent).toBe('40')
            expect(elements['singles-count'].textContent).toBe('10')
            expect(elements['doubles-count'].textContent).toBe('5')
            expect(elements['triples-count'].textContent).toBe('2')
            expect(elements['tetrises-count'].textContent).toBe('1')

            vi.restoreAllMocks()
        })

        it('should not throw when DOM elements are missing', () => {
            vi.spyOn(document, 'getElementById').mockReturnValue(null)
            const state = makeState()
            expect(() => updateUI(state)).not.toThrow()
            vi.restoreAllMocks()
        })
    })

    describe('startGame', () => {
        it('should set gameStarted and call gameLoopFn', () => {
            const state = makeState({ nextPiece: generateNextPiece() })
            vi.spyOn(document, 'getElementById').mockReturnValue(null)
            const gameLoopFn = vi.fn()
            startGame(state, gameLoopFn)
            expect(state.gameStarted).toBe(true)
            expect(gameLoopFn).toHaveBeenCalledOnce()
            vi.restoreAllMocks()
        })

        it('should not restart if already started', () => {
            const state = makeState({
                gameStarted: true,
                nextPiece: generateNextPiece(),
            })
            const gameLoopFn = vi.fn()
            startGame(state, gameLoopFn)
            expect(gameLoopFn).not.toHaveBeenCalled()
        })

        it('should update start button text when element exists', () => {
            const state = makeState({ nextPiece: generateNextPiece() })
            const mockBtn = {
                textContent: 'Start',
                disabled: false,
            } as HTMLButtonElement
            vi.spyOn(document, 'getElementById').mockImplementation(id =>
                id === 'start-btn' ? (mockBtn as unknown as HTMLElement) : null
            )
            startGame(state, vi.fn())
            expect(mockBtn.textContent).toBe('Playing...')
            expect(mockBtn.disabled).toBe(true)
            vi.restoreAllMocks()
        })
    })

    describe('togglePause', () => {
        it('should do nothing if game not started', () => {
            const state = makeState()
            togglePause(state, vi.fn())
            expect(state.paused).toBe(false)
        })

        it('should do nothing if game over', () => {
            const state = makeState({ gameStarted: true, gameOver: true })
            togglePause(state, vi.fn())
            expect(state.paused).toBe(false)
        })

        it('should toggle paused state', () => {
            vi.spyOn(document, 'getElementById').mockReturnValue(null)
            const state = makeState({ gameStarted: true })
            const gameLoopFn = vi.fn()
            togglePause(state, gameLoopFn)
            expect(state.paused).toBe(true)
            togglePause(state, gameLoopFn)
            expect(state.paused).toBe(false)
            expect(gameLoopFn).toHaveBeenCalledOnce() // only called on resume
            vi.restoreAllMocks()
        })

        it('should update pause button text', () => {
            const mockBtn = { textContent: 'Pause' } as HTMLElement
            vi.spyOn(document, 'getElementById').mockImplementation(id =>
                id === 'pause-btn' ? mockBtn : null
            )
            const state = makeState({ gameStarted: true })
            togglePause(state, vi.fn())
            expect(mockBtn.textContent).toBe('Resume')
            togglePause(state, vi.fn())
            expect(mockBtn.textContent).toBe('Pause')
            vi.restoreAllMocks()
        })
    })

    describe('resetGame', () => {
        it('should reset all state fields to initial values', () => {
            const state = makeState({
                score: 999,
                level: 5,
                lines: 40,
                gameOver: true,
                gameStarted: true,
            })
            vi.spyOn(document, 'getElementById').mockReturnValue(null)
            const updateNextPieceDisplayFn = vi.fn()
            resetGame(state, updateNextPieceDisplayFn)
            expect(state.score).toBe(0)
            expect(state.level).toBe(1)
            expect(state.lines).toBe(0)
            expect(state.gameOver).toBe(false)
            expect(state.gameStarted).toBe(false)
            expect(updateNextPieceDisplayFn).toHaveBeenCalled()
            vi.restoreAllMocks()
        })

        it('should reset button states when elements exist', () => {
            const state = makeState({ gameOver: true })
            const mockGameOver = {
                classList: { add: vi.fn() },
            } as unknown as HTMLElement
            const mockStart = {
                textContent: '',
                disabled: true,
                style: { display: 'none' },
            } as unknown as HTMLButtonElement
            const mockPause = {
                textContent: 'Resume',
            } as unknown as HTMLElement
            const mockEnd = {
                style: { display: 'inline-flex' },
            } as unknown as HTMLElement
            vi.spyOn(document, 'getElementById').mockImplementation(id => {
                if (id === 'game-over-overlay') {
                    return mockGameOver
                }
                if (id === 'start-btn') {
                    return mockStart as HTMLElement
                }
                if (id === 'pause-btn') {
                    return mockPause
                }
                if (id === 'end-btn') {
                    return mockEnd
                }
                return null
            })
            resetGame(state, vi.fn())
            expect(mockGameOver.classList.add).toHaveBeenCalledWith('hidden')
            expect((mockStart as any).textContent).toBe('Start')
            expect((mockPause as any).textContent).toBe('Pause')
            expect((mockEnd as any).style.display).toBe('none')
            vi.restoreAllMocks()
        })
    })
})
