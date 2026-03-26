import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock pixi.js before imports
vi.mock('pixi.js', () => {
    const makeGraphics = () => {
        const g: Record<string, unknown> = {
            alpha: 1,
            x: 0,
            y: 0,
            scale: { set: vi.fn() },
        }
        for (const m of [
            'clear',
            'rect',
            'fill',
            'stroke',
            'circle',
            'moveTo',
            'lineTo',
            'poly',
            'addChild',
        ]) {
            g[m] = vi.fn(() => g)
        }
        g['destroy'] = vi.fn()
        return g
    }

    const makeContainer = () => ({
        addChild: vi.fn(),
        removeChild: vi.fn(),
        removeChildren: vi.fn(),
        destroy: vi.fn(),
        x: 0,
        y: 0,
    })

    const makeApp = () => {
        const canvas = document.createElement('canvas')
        Object.defineProperty(canvas, 'style', {
            value: { border: '', borderRadius: '', boxShadow: '' },
            writable: true,
        })
        const stage = makeContainer()
        return {
            init: vi.fn().mockResolvedValue(undefined),
            canvas,
            stage,
            destroy: vi.fn(),
        }
    }

    const MockApplication = vi.fn(makeApp)
    const MockContainer = vi.fn(makeContainer)
    const MockGraphics = vi.fn(makeGraphics)

    return {
        Application: MockApplication,
        Container: MockContainer,
        Graphics: MockGraphics,
    }
})

import {
    setupPixiJS,
    clearPixiJS,
    drawBlock,
    drawBoard,
    drawPiece,
    drawGrid,
    draw,
    type RendererState,
} from './renderer'
import type { GameConstants, GameState, Piece } from './types'
import { Application, Container, Graphics } from 'pixi.js'

function makeConstants(overrides: Partial<GameConstants> = {}): GameConstants {
    return {
        BOARD_WIDTH: 10,
        BOARD_HEIGHT: 20,
        BLOCK_SIZE: 30,
        GAME_WIDTH: 300,
        GAME_HEIGHT: 600,
        NEXT_CANVAS_SIZE: 120,
        COLORS: { I: 0x00ffff },
        PIECE_TYPES: ['I'],
        PIECES: { I: { shape: [[1, 1, 1, 1]], color: 0x00ffff } },
        ...overrides,
    }
}

function makeRendererState(): RendererState {
    const MockApp = vi.mocked(Application)
    const appInst = new MockApp() as unknown as RendererState['app']
    const MockCont = vi.mocked(Container)

    return {
        app: appInst,
        stage: new MockCont() as unknown as RendererState['stage'],
        boardContainer:
            new MockCont() as unknown as RendererState['boardContainer'],
        uiContainer: new MockCont() as unknown as RendererState['uiContainer'],
        blockGraphics: [],
    }
}

function makeGameState(overrides: Partial<GameState> = {}): GameState {
    return {
        board: Array.from({ length: 20 }, () => Array(10).fill(null)),
        currentPiece: null,
        nextPiece: null,
        score: 0,
        level: 1,
        lines: 0,
        gameOver: false,
        paused: false,
        gameStarted: true,
        stats: {
            pieces: 0,
            singles: 0,
            doubles: 0,
            triples: 0,
            tetrises: 0,
            consecutiveLineClears: 0,
        },
        dropTime: 0,
        dropInterval: 1000,
        needsRedraw: true,
        ...overrides,
    }
}

describe('tetris/renderer', () => {
    let gameContainer: HTMLElement

    beforeEach(() => {
        gameContainer = document.createElement('div')
        document.body.appendChild(gameContainer)
        vi.clearAllMocks()
    })

    afterEach(() => {
        document.body.removeChild(gameContainer)
        vi.unstubAllGlobals()
    })

    describe('setupPixiJS', () => {
        it('should return a valid RendererState', async () => {
            const constants = makeConstants()
            const state = await setupPixiJS(gameContainer, constants)

            expect(state).toBeDefined()
            expect(state.app).toBeDefined()
            expect(state.stage).toBeDefined()
            expect(state.boardContainer).toBeDefined()
            expect(state.uiContainer).toBeDefined()
            expect(state.blockGraphics).toBeInstanceOf(Array)
        })

        it('should initialize app with correct dimensions', async () => {
            const constants = makeConstants({
                GAME_WIDTH: 300,
                GAME_HEIGHT: 600,
            })
            await setupPixiJS(gameContainer, constants)

            const MockApp = vi.mocked(Application)
            const appInst = MockApp.mock.results[0].value
            expect(appInst.init).toHaveBeenCalledWith(
                expect.objectContaining({
                    width: 300,
                    height: 600,
                })
            )
        })

        it('should append canvas to game container', async () => {
            const constants = makeConstants()
            await setupPixiJS(gameContainer, constants)
            expect(gameContainer.children.length).toBeGreaterThan(0)
        })

        it('should add boardContainer and uiContainer to stage', async () => {
            const constants = makeConstants()
            const state = await setupPixiJS(gameContainer, constants)
            expect(state.app.stage.addChild).toHaveBeenCalledTimes(2)
        })

        it('should start with empty blockGraphics array', async () => {
            const constants = makeConstants()
            const state = await setupPixiJS(gameContainer, constants)
            expect(state.blockGraphics).toHaveLength(0)
        })

        it('should clear container and throw when app init fails', async () => {
            const MockApp = vi.mocked(Application)
            MockApp.mockImplementationOnce(() => {
                return {
                    init: vi.fn().mockRejectedValue(new Error('WebGL failed')),
                    canvas: document.createElement('canvas'),
                    stage: { addChild: vi.fn() },
                    destroy: vi.fn(),
                } as unknown as InstanceType<typeof Application>
            })

            const constants = makeConstants()
            await expect(
                setupPixiJS(gameContainer, constants)
            ).rejects.toThrow()
            expect(gameContainer.innerHTML).toContain('Failed to initialize')
        })
    })

    describe('clearPixiJS', () => {
        it('should call removeChildren on boardContainer and uiContainer', () => {
            const state = makeRendererState()
            clearPixiJS(state)

            expect(state.boardContainer.removeChildren).toHaveBeenCalled()
            expect(state.uiContainer.removeChildren).toHaveBeenCalled()
        })

        it('should destroy all block graphics', () => {
            const state = makeRendererState()
            const MockGfx = vi.mocked(Graphics)
            const g1 = new MockGfx() as unknown as Graphics
            const g2 = new MockGfx() as unknown as Graphics
            state.blockGraphics.push(g1, g2)

            clearPixiJS(state)

            expect(g1.destroy).toHaveBeenCalled()
            expect(g2.destroy).toHaveBeenCalled()
        })

        it('should empty blockGraphics array after clearing', () => {
            const state = makeRendererState()
            const MockGfx = vi.mocked(Graphics)
            state.blockGraphics.push(
                new MockGfx() as unknown as Graphics,
                new MockGfx() as unknown as Graphics
            )

            clearPixiJS(state)

            expect(state.blockGraphics).toHaveLength(0)
        })
    })

    describe('drawBlock', () => {
        it('should create a graphics object and add it to boardContainer', () => {
            const state = makeRendererState()
            const constants = makeConstants()

            drawBlock(state, 0, 0, 0x00ffff, constants)

            expect(state.boardContainer.addChild).toHaveBeenCalled()
        })

        it('should push the graphic into blockGraphics', () => {
            const state = makeRendererState()
            const constants = makeConstants()

            drawBlock(state, 10, 20, 0xff0000, constants)

            expect(state.blockGraphics).toHaveLength(1)
        })

        it('should draw rect with block size from constants', () => {
            const state = makeRendererState()
            const constants = makeConstants({ BLOCK_SIZE: 30 })

            drawBlock(state, 5, 10, 0x00ff00, constants)

            const MockGfx = vi.mocked(Graphics)
            const gfxInst =
                MockGfx.mock.results[MockGfx.mock.results.length - 1].value
            expect(gfxInst.rect).toHaveBeenCalledWith(5, 10, 30, 30)
        })

        it('should call fill with the provided color', () => {
            const state = makeRendererState()
            const constants = makeConstants()

            drawBlock(state, 0, 0, 0xaabbcc, constants)

            const MockGfx = vi.mocked(Graphics)
            const gfxInst =
                MockGfx.mock.results[MockGfx.mock.results.length - 1].value
            expect(gfxInst.fill).toHaveBeenCalledWith(0xaabbcc)
        })
    })

    describe('drawBoard', () => {
        it('should not add any graphics for an empty board', () => {
            const state = makeRendererState()
            const constants = makeConstants()
            const board: (number | null)[][] = Array.from({ length: 20 }, () =>
                Array(10).fill(null)
            )

            drawBoard(state, board, constants)

            expect(state.boardContainer.addChild).not.toHaveBeenCalled()
        })

        it('should add a block for each non-null cell', () => {
            const state = makeRendererState()
            const constants = makeConstants()
            const board: (number | null)[][] = Array.from({ length: 20 }, () =>
                Array(10).fill(null)
            )
            board[0][0] = 0x00ffff
            board[0][1] = 0xff0000
            board[1][0] = 0x00ff00

            drawBoard(state, board, constants)

            expect(state.blockGraphics).toHaveLength(3)
        })

        it('should position blocks correctly based on column and row', () => {
            const state = makeRendererState()
            const constants = makeConstants({ BLOCK_SIZE: 30 })
            const board: (number | null)[][] = Array.from({ length: 20 }, () =>
                Array(10).fill(null)
            )
            board[2][3] = 0x00ffff

            drawBoard(state, board, constants)

            const MockGfx = vi.mocked(Graphics)
            const gfxInst =
                MockGfx.mock.results[MockGfx.mock.results.length - 1].value
            // x = col * BLOCK_SIZE = 3 * 30 = 90, y = row * BLOCK_SIZE = 2 * 30 = 60
            expect(gfxInst.rect).toHaveBeenCalledWith(90, 60, 30, 30)
        })
    })

    describe('drawPiece', () => {
        it('should draw blocks for each filled cell in the piece shape', () => {
            const state = makeRendererState()
            const constants = makeConstants({ BLOCK_SIZE: 30 })
            const piece: Piece = {
                type: 'I',
                shape: [[1, 1, 1, 1]],
                color: 0x00ffff,
                x: 0,
                y: 0,
            }

            drawPiece(state, piece, constants)

            expect(state.blockGraphics).toHaveLength(4)
        })

        it('should not draw blocks for zero cells in shape', () => {
            const state = makeRendererState()
            const constants = makeConstants()
            const piece: Piece = {
                type: 'O',
                shape: [
                    [0, 0],
                    [0, 0],
                ],
                color: 0xffff00,
                x: 3,
                y: 5,
            }

            drawPiece(state, piece, constants)

            expect(state.blockGraphics).toHaveLength(0)
        })

        it('should offset blocks by piece position', () => {
            const state = makeRendererState()
            const constants = makeConstants({ BLOCK_SIZE: 30 })
            const piece: Piece = {
                type: 'I',
                shape: [[1]],
                color: 0x00ffff,
                x: 2,
                y: 3,
            }

            drawPiece(state, piece, constants)

            const MockGfx = vi.mocked(Graphics)
            const gfxInst =
                MockGfx.mock.results[MockGfx.mock.results.length - 1].value
            // x = (piece.x + col) * BLOCK_SIZE = (2+0)*30 = 60, y = (piece.y + row)*30 = 90
            expect(gfxInst.rect).toHaveBeenCalledWith(60, 90, 30, 30)
        })
    })

    describe('drawGrid', () => {
        it('should add a grid graphic to uiContainer', () => {
            const state = makeRendererState()
            const constants = makeConstants()

            drawGrid(state, constants)

            expect(state.uiContainer.addChild).toHaveBeenCalled()
        })

        it('should call moveTo and lineTo for each grid line', () => {
            const state = makeRendererState()
            const constants = makeConstants({
                BOARD_WIDTH: 10,
                BOARD_HEIGHT: 20,
            })

            drawGrid(state, constants)

            const MockGfx = vi.mocked(Graphics)
            const gfxInst =
                MockGfx.mock.results[MockGfx.mock.results.length - 1].value
            // 11 vertical + 21 horizontal = 32 pairs
            expect(gfxInst.moveTo).toHaveBeenCalled()
            expect(gfxInst.lineTo).toHaveBeenCalled()
        })
    })

    describe('draw', () => {
        it('should not redraw if needsRedraw is false', () => {
            const state = makeRendererState()
            const constants = makeConstants()
            const gameState = makeGameState({ needsRedraw: false })

            draw(state, gameState, constants)

            expect(state.boardContainer.removeChildren).not.toHaveBeenCalled()
        })

        it('should redraw and reset needsRedraw flag', () => {
            const state = makeRendererState()
            const constants = makeConstants()
            const gameState = makeGameState({ needsRedraw: true })

            draw(state, gameState, constants)

            expect(state.boardContainer.removeChildren).toHaveBeenCalled()
            expect(gameState.needsRedraw).toBe(false)
        })

        it('should draw current piece if present', () => {
            const state = makeRendererState()
            const constants = makeConstants({ BLOCK_SIZE: 30 })
            const piece: Piece = {
                type: 'I',
                shape: [[1, 1]],
                color: 0x00ffff,
                x: 0,
                y: 0,
            }
            const gameState = makeGameState({
                needsRedraw: true,
                currentPiece: piece,
            })

            draw(state, gameState, constants)

            expect(state.blockGraphics).toHaveLength(2)
        })

        it('should not draw piece when currentPiece is null', () => {
            const state = makeRendererState()
            const constants = makeConstants()
            const gameState = makeGameState({
                needsRedraw: true,
                currentPiece: null,
                board: Array.from({ length: 20 }, () => Array(10).fill(null)),
            })

            draw(state, gameState, constants)

            // Only grid gets drawn (via uiContainer), no blocks for pieces
            expect(state.blockGraphics).toHaveLength(0)
        })

        it('should draw board cells that have values', () => {
            const state = makeRendererState()
            const constants = makeConstants({ BLOCK_SIZE: 30 })
            const board: (number | null)[][] = Array.from({ length: 20 }, () =>
                Array(10).fill(null)
            )
            board[0][0] = 0x00ffff
            const gameState = makeGameState({ needsRedraw: true, board })

            draw(state, gameState, constants)

            expect(state.blockGraphics).toHaveLength(1)
        })
    })
})
