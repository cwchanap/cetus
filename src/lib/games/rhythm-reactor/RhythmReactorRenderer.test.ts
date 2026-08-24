import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('pixi.js', () => {
    const makeGraphics = () => {
        const graphic: Record<string, unknown> = {
            alpha: 1,
            x: 0,
            y: 0,
        }
        for (const method of [
            'clear',
            'rect',
            'fill',
            'stroke',
            'moveTo',
            'lineTo',
            'roundRect',
        ]) {
            graphic[method] = vi.fn(() => graphic)
        }
        graphic.destroy = vi.fn()
        return graphic
    }

    const makeApp = () => ({
        init: vi.fn().mockResolvedValue(undefined),
        canvas: document.createElement('canvas'),
        stage: {
            addChild: vi.fn(),
            removeChild: vi.fn(),
            removeChildren: vi.fn(),
        },
        renderer: { resize: vi.fn() },
        destroy: vi.fn(),
    })

    return {
        Application: vi.fn(makeApp),
        Graphics: vi.fn(makeGraphics),
        Container: vi.fn(() => ({
            addChild: vi.fn(),
            removeChild: vi.fn(),
            removeChildren: vi.fn(),
            destroy: vi.fn(),
        })),
        Sprite: vi.fn(() => ({ destroy: vi.fn(), texture: null })),
        Text: vi.fn(() => ({ text: '', destroy: vi.fn() })),
        Assets: { load: vi.fn() },
    }
})

import { Application, Graphics } from 'pixi.js'
import {
    createRhythmReactorRendererConfig,
    NOTE_HEIGHT,
    RhythmReactorRenderer,
} from './RhythmReactorRenderer'
import { createRhythmReactorConfig } from './RhythmReactorGame'
import type { RhythmReactorState } from './types'

type MockGraphics = {
    clear: ReturnType<typeof vi.fn>
    rect: ReturnType<typeof vi.fn>
    fill: ReturnType<typeof vi.fn>
    stroke: ReturnType<typeof vi.fn>
    moveTo: ReturnType<typeof vi.fn>
    lineTo: ReturnType<typeof vi.fn>
    roundRect: ReturnType<typeof vi.fn>
    destroy: ReturnType<typeof vi.fn>
}

function graphicAt(index: number): MockGraphics {
    return vi.mocked(Graphics).mock.results[index]?.value as MockGraphics
}

function makeState(
    overrides: Partial<RhythmReactorState> = {}
): RhythmReactorState {
    return {
        score: 0,
        timeRemaining: 60,
        isActive: true,
        isPaused: false,
        isGameOver: false,
        gameStarted: true,
        elapsedSeconds: 0,
        pendingNotes: [],
        perfectHits: 0,
        goodHits: 0,
        misses: 0,
        strayPresses: 0,
        combo: 0,
        maxCombo: 0,
        stability: 60,
        lastJudgment: null,
        ...overrides,
    }
}

describe('RhythmReactorRenderer', () => {
    let container: HTMLElement
    let renderer: RhythmReactorRenderer | undefined

    beforeEach(() => {
        container = document.createElement('div')
        container.id = 'rhythm-reactor-canvas'
        document.body.appendChild(container)
        vi.clearAllMocks()
    })

    afterEach(() => {
        renderer?.destroy()
        container.remove()
    })

    it('builds the renderer config from the game config', () => {
        const config = createRhythmReactorConfig()
        const rendererConfig = createRhythmReactorRendererConfig(config)

        expect(rendererConfig).toMatchObject({
            width: 800,
            height: 420,
            laneCount: 4,
            approachSeconds: config.approachSeconds,
            noteSpawnY: config.noteSpawnY,
            hitLineY: config.hitLineY,
        })
    })

    it('creates exactly one static graphic and one dynamic graphic', async () => {
        renderer = new RhythmReactorRenderer(
            createRhythmReactorRendererConfig(createRhythmReactorConfig())
        )

        await renderer.initialize()

        const app = vi.mocked(Application).mock.results[0]?.value as {
            stage: { addChild: ReturnType<typeof vi.fn> }
        }
        expect(vi.mocked(Graphics)).toHaveBeenCalledTimes(2)
        expect(app.stage.addChild).toHaveBeenCalledTimes(2)
        expect(app.stage.addChild).toHaveBeenNthCalledWith(1, graphicAt(0))
        expect(app.stage.addChild).toHaveBeenNthCalledWith(2, graphicAt(1))
    })

    it('draws four lane regions, separators, a spawn guide, and one hit line', async () => {
        const config = createRhythmReactorConfig()
        renderer = new RhythmReactorRenderer(
            createRhythmReactorRendererConfig(config)
        )
        await renderer.initialize()

        const staticGraphic = graphicAt(0)
        const laneWidth = config.canvasWidth / config.laneCount

        expect(staticGraphic.rect).toHaveBeenCalledTimes(5)
        expect(staticGraphic.rect.mock.calls.slice(1)).toEqual([
            [0, 0, laneWidth, config.canvasHeight],
            [laneWidth, 0, laneWidth, config.canvasHeight],
            [laneWidth * 2, 0, laneWidth, config.canvasHeight],
            [laneWidth * 3, 0, laneWidth, config.canvasHeight],
        ])

        expect(staticGraphic.moveTo.mock.calls).toEqual([
            [laneWidth, 0],
            [laneWidth * 2, 0],
            [laneWidth * 3, 0],
            [0, config.noteSpawnY],
            [0, config.hitLineY],
        ])
        expect(staticGraphic.lineTo.mock.calls).toEqual([
            [laneWidth, config.canvasHeight],
            [laneWidth * 2, config.canvasHeight],
            [laneWidth * 3, config.canvasHeight],
            [config.canvasWidth, config.noteSpawnY],
            [config.canvasWidth, config.hitLineY],
        ])
    })

    it('does not draw a note farther than the approach horizon', async () => {
        renderer = new RhythmReactorRenderer(
            createRhythmReactorRendererConfig(createRhythmReactorConfig())
        )
        await renderer.initialize()

        renderer.render(
            makeState({
                pendingNotes: [
                    { id: 'far', laneIndex: 0, hitTimeSeconds: 2.01 },
                ],
            })
        )

        expect(graphicAt(1).roundRect).not.toHaveBeenCalled()
    })

    it('draws a note at the approach horizon on the spawn line', async () => {
        const config = createRhythmReactorConfig()
        renderer = new RhythmReactorRenderer(
            createRhythmReactorRendererConfig(config)
        )
        await renderer.initialize()

        renderer.render(
            makeState({
                pendingNotes: [
                    { id: 'spawn', laneIndex: 1, hitTimeSeconds: 2 },
                ],
            })
        )

        expect(graphicAt(1).roundRect.mock.calls[0]?.[1]).toBe(
            config.noteSpawnY - NOTE_HEIGHT / 2
        )
    })

    it('draws a note at hit time centered on the hit line', async () => {
        const config = createRhythmReactorConfig()
        renderer = new RhythmReactorRenderer(
            createRhythmReactorRendererConfig(config)
        )
        await renderer.initialize()

        renderer.render(
            makeState({
                elapsedSeconds: 2,
                pendingNotes: [{ id: 'hit', laneIndex: 2, hitTimeSeconds: 2 }],
            })
        )

        const rectY = graphicAt(1).roundRect.mock.calls[0]?.[1]
        expect(rectY).toBe(config.hitLineY - NOTE_HEIGHT / 2)
        expect(rectY + NOTE_HEIGHT / 2).toBe(config.hitLineY)
    })

    it('lets a pending note in the late Miss window render below the hit line', async () => {
        const config = createRhythmReactorConfig()
        renderer = new RhythmReactorRenderer(
            createRhythmReactorRendererConfig(config)
        )
        await renderer.initialize()

        renderer.render(
            makeState({
                elapsedSeconds: 2.2,
                pendingNotes: [{ id: 'late', laneIndex: 3, hitTimeSeconds: 2 }],
            })
        )

        const rectY = graphicAt(1).roundRect.mock.calls[0]?.[1]
        expect(rectY + NOTE_HEIGHT / 2).toBeGreaterThan(config.hitLineY)
    })

    it('draws the stability indicator from the current stability', async () => {
        renderer = new RhythmReactorRenderer(
            createRhythmReactorRendererConfig(createRhythmReactorConfig())
        )
        await renderer.initialize()

        renderer.render(makeState({ stability: 25 }))

        expect(graphicAt(1).rect.mock.calls).toContainEqual([20, 16, 25, 8])
    })

    it('destroys local graphics before the base Pixi resources', async () => {
        renderer = new RhythmReactorRenderer(
            createRhythmReactorRendererConfig(createRhythmReactorConfig())
        )
        await renderer.initialize()

        const staticGraphic = graphicAt(0)
        const dynamicGraphic = graphicAt(1)
        const app = vi.mocked(Application).mock.results[0]?.value as {
            destroy: ReturnType<typeof vi.fn>
        }

        renderer.cleanup()
        renderer.cleanup()
        renderer.destroy()

        expect(staticGraphic.destroy).toHaveBeenCalledTimes(1)
        expect(dynamicGraphic.destroy).toHaveBeenCalledTimes(1)
        expect(app.destroy).toHaveBeenCalledTimes(1)
        expect(
            Math.max(
                staticGraphic.destroy.mock.invocationCallOrder[0],
                dynamicGraphic.destroy.mock.invocationCallOrder[0]
            )
        ).toBeLessThan(app.destroy.mock.invocationCallOrder[0])
        expect(renderer.isReady()).toBe(false)
    })
})
