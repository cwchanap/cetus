import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock pixi.js before imports
vi.mock('pixi.js', () => {
    const makeGraphics = () => {
        const g: Record<string, unknown> = {
            alpha: 1,
            x: 0,
            y: 0,
        }
        for (const m of [
            'clear',
            'rect',
            'fill',
            'stroke',
            'moveTo',
            'lineTo',
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
            value: { border: '', borderRadius: '' },
            writable: true,
        })
        const stage = makeContainer()
        return {
            init: vi.fn().mockResolvedValue(undefined),
            canvas,
            stage,
            destroy: vi.fn(),
            renderer: { resize: vi.fn() },
        }
    }

    return {
        Application: vi.fn(makeApp),
        Container: vi.fn(makeContainer),
        Graphics: vi.fn(makeGraphics),
        Assets: { load: vi.fn() },
        Text: vi.fn(),
        Sprite: vi.fn(),
        Texture: { EMPTY: {} },
    }
})

import { TetrisRenderer, createTetrisRendererConfig } from './TetrisRenderer'
import { DEFAULT_TETRIS_CONFIG } from './TetrisGame'
import type { TetrisState, Piece } from './types'
import { Graphics, Container } from 'pixi.js'

function makeRenderer(): TetrisRenderer {
    const config = createTetrisRendererConfig(
        DEFAULT_TETRIS_CONFIG,
        '#test-container'
    )
    return new TetrisRenderer(config)
}

function makePiece(overrides: Partial<Piece> = {}): Piece {
    return {
        type: 'I',
        shape: [[1, 1, 1, 1]],
        color: 0x00ffff,
        x: 3,
        y: 0,
        ...overrides,
    }
}

function makeState(overrides: Partial<TetrisState> = {}): TetrisState {
    const { boardWidth, boardHeight } = DEFAULT_TETRIS_CONFIG
    const board: (number | null)[][] = []
    for (let r = 0; r < boardHeight; r++) {
        board.push(new Array(boardWidth).fill(null))
    }
    return {
        score: 0,
        timeRemaining: DEFAULT_TETRIS_CONFIG.duration,
        isActive: true,
        isPaused: false,
        isGameOver: false,
        gameStarted: true,
        board,
        currentPiece: null,
        nextPiece: makePiece(),
        level: 1,
        lines: 0,
        dropTime: 0,
        dropInterval: 1000,
        stats: {
            pieces: 0,
            singles: 0,
            doubles: 0,
            triples: 0,
            tetrises: 0,
            consecutiveLineClears: 0,
        },
        needsRedraw: true,
        ...overrides,
    }
}

describe('TetrisRenderer', () => {
    let container: HTMLElement

    beforeEach(() => {
        container = document.createElement('div')
        container.id = 'test-container'
        document.body.appendChild(container)
        vi.clearAllMocks()
    })

    afterEach(() => {
        document.body.removeChild(container)
    })

    describe('setup', () => {
        it('initializes and creates board/ui containers on the stage', async () => {
            const renderer = makeRenderer()
            await renderer.initialize()
            const app = renderer.getApp()
            expect(app).not.toBeNull()
            // stage.addChild called for boardContainer + uiContainer
            expect(app!.stage.addChild).toHaveBeenCalledTimes(2)
            renderer.cleanup()
        })

        it('throws when app is not available after setup', async () => {
            const renderer = makeRenderer()
            vi.spyOn(renderer, 'getApp').mockReturnValue(null)
            await expect(renderer.initialize()).rejects.toThrow(
                'app not available after setup'
            )
            renderer.cleanup()
        })
    })

    describe('render', () => {
        it('does nothing when needsRedraw is false', async () => {
            const renderer = makeRenderer()
            await renderer.initialize()
            // setup draws the grid (1 Graphics). Clear mock calls so we can
            // assert render itself creates no new Graphics.
            vi.mocked(Graphics).mockClear()
            renderer.render(makeState({ needsRedraw: false }))
            expect(vi.mocked(Graphics)).not.toHaveBeenCalled()
            renderer.cleanup()
        })

        it('draws placed board blocks when needsRedraw is true', async () => {
            const renderer = makeRenderer()
            await renderer.initialize()
            const state = makeState()
            // Place two blocks on the board
            state.board[19][0] = 0xff0000
            state.board[19][1] = 0x00ff00
            vi.mocked(Graphics).mockClear()
            renderer.render(state)
            // Two blocks → two Graphics objects created during render
            expect(vi.mocked(Graphics)).toHaveBeenCalledTimes(2)
            renderer.cleanup()
        })

        it('draws the current piece blocks', async () => {
            const renderer = makeRenderer()
            await renderer.initialize()
            const piece = makePiece({ x: 3, y: 5 })
            vi.mocked(Graphics).mockClear()
            renderer.render(makeState({ currentPiece: piece }))
            // I-piece has 4 filled cells → 4 Graphics objects
            expect(vi.mocked(Graphics)).toHaveBeenCalledTimes(4)
            renderer.cleanup()
        })

        it('clears the board before drawing a new frame', async () => {
            const renderer = makeRenderer()
            await renderer.initialize()
            const state = makeState()
            state.board[19][0] = 0xff0000
            renderer.render(state)
            // Render again — clearBoard should remove previous children first
            const boardContainer = vi.mocked(Container).mock.results[0]
                .value as {
                removeChildren: ReturnType<typeof vi.fn>
            }
            const beforeClear = boardContainer.removeChildren.mock.calls.length
            renderer.render(state)
            expect(
                boardContainer.removeChildren.mock.calls.length
            ).toBeGreaterThan(beforeClear)
            renderer.cleanup()
        })

        it('does not throw on an empty board with no current piece', async () => {
            const renderer = makeRenderer()
            await renderer.initialize()
            expect(() =>
                renderer.render(makeState({ currentPiece: null }))
            ).not.toThrow()
            renderer.cleanup()
        })
    })

    describe('renderGame invalid state guards', () => {
        it('returns early when state is null', async () => {
            const renderer = makeRenderer()
            await renderer.initialize()
            vi.mocked(Graphics).mockClear()
            expect(() => renderer.render(null)).not.toThrow()
            expect(vi.mocked(Graphics)).not.toHaveBeenCalled()
            renderer.cleanup()
        })

        it('returns early when state is a non-object', async () => {
            const renderer = makeRenderer()
            await renderer.initialize()
            vi.mocked(Graphics).mockClear()
            expect(() => renderer.render('not-a-state')).not.toThrow()
            expect(vi.mocked(Graphics)).not.toHaveBeenCalled()
            renderer.cleanup()
        })

        it('returns early when state is missing required fields', async () => {
            const renderer = makeRenderer()
            await renderer.initialize()
            vi.mocked(Graphics).mockClear()
            expect(() => renderer.render({})).not.toThrow()
            expect(vi.mocked(Graphics)).not.toHaveBeenCalled()
            renderer.cleanup()
        })

        it('returns early when board is not an array', async () => {
            const renderer = makeRenderer()
            await renderer.initialize()
            vi.mocked(Graphics).mockClear()
            expect(() =>
                renderer.render({
                    board: 'nope',
                    needsRedraw: true,
                    currentPiece: null,
                })
            ).not.toThrow()
            expect(vi.mocked(Graphics)).not.toHaveBeenCalled()
            renderer.cleanup()
        })
    })

    describe('cleanup', () => {
        it('destroys containers on cleanup', async () => {
            const renderer = makeRenderer()
            await renderer.initialize()
            const createdContainers = vi
                .mocked(Container)
                .mock.results.map(r => r.value)
            renderer.cleanup()
            createdContainers.forEach(c => {
                expect(c.destroy).toHaveBeenCalledWith({ children: true })
            })
        })

        it('does not throw when cleanup is called without initialization', () => {
            const renderer = makeRenderer()
            expect(() => renderer.cleanup()).not.toThrow()
        })
    })

    describe('createTetrisRendererConfig', () => {
        it('builds a renderer config from a game config', () => {
            const cfg = createTetrisRendererConfig(
                DEFAULT_TETRIS_CONFIG,
                '#game-container'
            )
            expect(cfg.container).toBe('#game-container')
            expect(cfg.width).toBe(DEFAULT_TETRIS_CONFIG.gameWidth)
            expect(cfg.height).toBe(DEFAULT_TETRIS_CONFIG.gameHeight)
            expect(cfg.boardWidth).toBe(DEFAULT_TETRIS_CONFIG.boardWidth)
            expect(cfg.boardHeight).toBe(DEFAULT_TETRIS_CONFIG.boardHeight)
            expect(cfg.blockSize).toBe(DEFAULT_TETRIS_CONFIG.blockSize)
            expect(cfg.gridColor).toBe(DEFAULT_TETRIS_CONFIG.gridColor)
            expect(cfg.backgroundColor).toBe(
                DEFAULT_TETRIS_CONFIG.backgroundColor
            )
        })
    })
})
