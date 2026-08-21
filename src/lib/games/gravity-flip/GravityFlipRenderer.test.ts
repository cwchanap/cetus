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
    createGravityFlipRendererConfig,
    GravityFlipRenderer,
} from './GravityFlipRenderer'
import { createGravityFlipConfig, type GravityFlipState } from './types'

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

function makeState(): GravityFlipState {
    return {
        score: 0,
        timeRemaining: 60,
        isActive: true,
        isPaused: false,
        isGameOver: false,
        gameStarted: true,
        outcome: 'playing',
        gravity: 'down',
        player: {
            x: 150,
            y: 270,
            velocityY: 0,
            size: 28,
        },
        hazards: [
            {
                id: 'floor-spike',
                kind: 'floor-spike',
                x: 100,
                y: 250,
                width: 52,
                height: 34,
                verticalVelocity: 0,
            },
            {
                id: 'ceiling-spike',
                kind: 'ceiling-spike',
                x: 200,
                y: 36,
                width: 52,
                height: 34,
                verticalVelocity: 0,
            },
            {
                id: 'floor-gap',
                kind: 'floor-gap',
                x: 300,
                y: 262,
                width: 90,
                height: 18,
                verticalVelocity: 0,
            },
            {
                id: 'ceiling-gap',
                kind: 'ceiling-gap',
                x: 400,
                y: 36,
                width: 90,
                height: 18,
                verticalVelocity: 0,
            },
            {
                id: 'mover',
                kind: 'mover',
                x: 520,
                y: 140,
                width: 40,
                height: 40,
                verticalVelocity: 180,
            },
        ],
        stars: [
            { id: 'star-floor', x: 620, y: 50, radius: 10 },
            { id: 'star-ceiling', x: 680, y: 270, radius: 10 },
        ],
        distance: 0,
        starsCollected: 0,
        flips: 0,
        worldSpeed: 220,
    }
}

describe('GravityFlipRenderer', () => {
    let container: HTMLElement
    let renderer: GravityFlipRenderer | undefined

    beforeEach(() => {
        container = document.createElement('div')
        container.id = 'gravity-flip-canvas'
        document.body.appendChild(container)
        vi.clearAllMocks()
    })

    afterEach(() => {
        renderer?.destroy()
        container.remove()
    })

    it('creates one corridor layer and one scene layer', async () => {
        const gameConfig = createGravityFlipConfig()
        const rendererConfig = createGravityFlipRendererConfig(gameConfig)
        renderer = new GravityFlipRenderer(rendererConfig)

        await renderer.initialize()

        const app = vi.mocked(Application).mock.results[0]?.value as {
            stage: { addChild: ReturnType<typeof vi.fn> }
        }
        expect(rendererConfig).toEqual({
            type: 'canvas',
            container: '#gravity-flip-canvas',
            width: 800,
            height: 320,
            responsive: false,
            backgroundColor: 0x020817,
            antialias: true,
        })
        expect(vi.mocked(Graphics)).toHaveBeenCalledTimes(2)
        expect(app.stage.addChild).toHaveBeenCalledTimes(2)
        expect(app.stage.addChild).toHaveBeenNthCalledWith(1, graphicAt(0))
        expect(app.stage.addChild).toHaveBeenNthCalledWith(2, graphicAt(1))
        expect(graphicAt(0).rect).toHaveBeenCalled()
    })

    it('draws spike, gap, and mover by descriptor.shape', async () => {
        renderer = new GravityFlipRenderer(
            createGravityFlipRendererConfig(createGravityFlipConfig())
        )
        await renderer.initialize()

        renderer.render(makeState())

        const scene = graphicAt(1)
        expect(scene.clear).toHaveBeenCalledTimes(1)
        expect(scene.moveTo).toHaveBeenCalled()
        expect(scene.rect).toHaveBeenCalled()
        expect(scene.roundRect).toHaveBeenCalled()
    })

    it('draws floor and ceiling forms from narrowed descriptor.surface', async () => {
        renderer = new GravityFlipRenderer(
            createGravityFlipRendererConfig(createGravityFlipConfig())
        )
        await renderer.initialize()

        renderer.render(makeState())

        const scene = graphicAt(1)
        expect(scene.moveTo.mock.calls).toContainEqual([100, 284])
        expect(scene.moveTo.mock.calls).toContainEqual([200, 36])
        expect(scene.lineTo.mock.calls).toContainEqual([390, 280])
        expect(scene.lineTo.mock.calls).toContainEqual([490, 36])
    })

    it('renders player and stars', async () => {
        renderer = new GravityFlipRenderer(
            createGravityFlipRendererConfig(createGravityFlipConfig())
        )
        await renderer.initialize()

        renderer.render(makeState())

        const scene = graphicAt(1)
        expect(scene.moveTo.mock.calls).toContainEqual([150, 256])
        expect(scene.moveTo.mock.calls).toContainEqual([620, 40])
        expect(scene.fill.mock.calls).toContainEqual([
            { color: 0x22d3ee, alpha: 0.9 },
        ])
        expect(scene.fill.mock.calls).toContainEqual([
            { color: 0xfacc15, alpha: 0.95 },
        ])
    })

    it('cleans graphics and Pixi app idempotently', async () => {
        renderer = new GravityFlipRenderer(
            createGravityFlipRendererConfig(createGravityFlipConfig())
        )
        await renderer.initialize()

        const corridor = graphicAt(0)
        const scene = graphicAt(1)
        const app = vi.mocked(Application).mock.results[0]?.value as {
            destroy: ReturnType<typeof vi.fn>
        }

        renderer.cleanup()
        renderer.cleanup()
        renderer.destroy()

        expect(corridor.destroy).toHaveBeenCalledTimes(1)
        expect(scene.destroy).toHaveBeenCalledTimes(1)
        expect(app.destroy).toHaveBeenCalledTimes(1)
        expect(renderer.isReady()).toBe(false)
    })
})
