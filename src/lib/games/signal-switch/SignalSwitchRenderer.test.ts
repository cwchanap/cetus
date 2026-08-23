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
            'circle',
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
    createSignalSwitchRendererConfig,
    SignalSwitchRenderer,
} from './SignalSwitchRenderer'
import {
    SIGNAL_SWITCH_SIGNALS,
    createSignalSwitchConfig,
    type SignalSwitchState,
} from './types'

type MockGraphics = {
    clear: ReturnType<typeof vi.fn>
    rect: ReturnType<typeof vi.fn>
    fill: ReturnType<typeof vi.fn>
    stroke: ReturnType<typeof vi.fn>
    moveTo: ReturnType<typeof vi.fn>
    lineTo: ReturnType<typeof vi.fn>
    roundRect: ReturnType<typeof vi.fn>
    circle: ReturnType<typeof vi.fn>
    destroy: ReturnType<typeof vi.fn>
}

function graphicAt(index: number): MockGraphics {
    return vi.mocked(Graphics).mock.results[index]?.value as MockGraphics
}

const MARKER_RADIUS = 7
const GATE_MARKER_RADIUS = 9

function makeState(): SignalSwitchState {
    return {
        score: 0,
        timeRemaining: 90,
        isActive: true,
        isPaused: false,
        isGameOver: false,
        gameStarted: true,
        outcome: 'playing',
        activeLaneCount: 3,
        gateSignals: ['cyan', 'magenta', 'amber', 'cyan'],
        drones: [
            { id: 'drone-cyan', laneIndex: 0, signal: 'cyan', x: 200 },
            { id: 'drone-magenta', laneIndex: 1, signal: 'magenta', x: 400 },
            { id: 'drone-amber', laneIndex: 2, signal: 'amber', x: 600 },
        ],
        integrity: 3,
        safePasses: 0,
        crashes: 0,
        combo: 0,
        maxCombo: 0,
        droneSpeed: 140,
        spawnInterval: 3.2,
    }
}

describe('SignalSwitchRenderer', () => {
    let container: HTMLElement
    let renderer: SignalSwitchRenderer | undefined

    beforeEach(() => {
        container = document.createElement('div')
        container.id = 'signal-switch-canvas'
        document.body.appendChild(container)
        vi.clearAllMocks()
    })

    afterEach(() => {
        renderer?.destroy()
        container.remove()
    })

    it('builds the renderer config from the game config', () => {
        const config = createSignalSwitchConfig()
        const rendererConfig = createSignalSwitchRendererConfig(config)

        expect(rendererConfig).toMatchObject({
            type: 'canvas',
            container: '#signal-switch-canvas',
            width: config.canvasWidth,
            height: config.canvasHeight,
            gateX: config.gateX,
            laneCount: config.laneUnlockSeconds.length,
            droneWidth: config.droneWidth,
            droneHeight: config.droneHeight,
            responsive: false,
        })
    })

    it('creates one static lane layer and one dynamic scene layer', async () => {
        renderer = new SignalSwitchRenderer(
            createSignalSwitchRendererConfig(createSignalSwitchConfig())
        )

        await renderer.initialize()

        const app = vi.mocked(Application).mock.results[0]?.value as {
            stage: { addChild: ReturnType<typeof vi.fn> }
        }
        expect(vi.mocked(Graphics)).toHaveBeenCalledTimes(2)
        expect(app.stage.addChild).toHaveBeenCalledTimes(2)
        expect(app.stage.addChild).toHaveBeenNthCalledWith(1, graphicAt(0))
        expect(app.stage.addChild).toHaveBeenNthCalledWith(2, graphicAt(1))
        expect(graphicAt(0).rect).toHaveBeenCalled()
        expect(graphicAt(1).clear).not.toHaveBeenCalled()
    })

    it('derives lane heights from height / laneCount', async () => {
        const gameConfig = createSignalSwitchConfig()
        const rendererConfig = createSignalSwitchRendererConfig(gameConfig)
        renderer = new SignalSwitchRenderer(rendererConfig)
        await renderer.initialize()

        const lanes = graphicAt(0)
        const laneHeight =
            (rendererConfig.height ?? 0) / rendererConfig.laneCount
        const width = rendererConfig.width ?? 0

        expect(lanes.rect).toHaveBeenCalledWith(
            0,
            0,
            width,
            gameConfig.canvasHeight
        )
        const separators = lanes.moveTo.mock.calls.filter(
            call =>
                call[0] === 0 &&
                call[1] > 0 &&
                call[1] < gameConfig.canvasHeight
        )
        expect(separators).toEqual([
            [0, laneHeight],
            [0, laneHeight * 2],
            [0, laneHeight * 3],
        ])
        expect(lanes.lineTo.mock.calls).toContainEqual([width, laneHeight])
        expect(lanes.lineTo.mock.calls).toContainEqual([width, laneHeight * 3])
        expect(lanes.moveTo.mock.calls).toContainEqual([gameConfig.gateX, 0])
        expect(lanes.lineTo.mock.calls).toContainEqual([
            gameConfig.gateX,
            gameConfig.canvasHeight,
        ])
    })

    it('recomputes lane geometry for a three-lane board', async () => {
        const gameConfig = createSignalSwitchConfig({
            laneUnlockSeconds: [0, 15, 30],
        })
        renderer = new SignalSwitchRenderer(
            createSignalSwitchRendererConfig(gameConfig)
        )
        await renderer.initialize()

        const lanes = graphicAt(0)
        const laneHeight = gameConfig.canvasHeight / 3

        const separators = lanes.moveTo.mock.calls.filter(
            call => call[0] === 0 && call[1] > 0
        )
        expect(separators).toEqual([
            [0, laneHeight],
            [0, laneHeight * 2],
        ])
    })

    it('destroys game graphics and the pixi app idempotently', async () => {
        renderer = new SignalSwitchRenderer(
            createSignalSwitchRendererConfig(createSignalSwitchConfig())
        )
        await renderer.initialize()

        const lanes = graphicAt(0)
        const scene = graphicAt(1)
        const app = vi.mocked(Application).mock.results[0]?.value as {
            destroy: ReturnType<typeof vi.fn>
        }

        renderer.cleanup()
        renderer.cleanup()
        renderer.destroy()

        expect(lanes.destroy).toHaveBeenCalledTimes(1)
        expect(scene.destroy).toHaveBeenCalledTimes(1)
        expect(app.destroy).toHaveBeenCalledTimes(1)
        expect(renderer.isReady()).toBe(false)
    })

    it('renders circle, triangle, and diamond geometry with catalog colors', async () => {
        const gameConfig = createSignalSwitchConfig()
        renderer = new SignalSwitchRenderer(
            createSignalSwitchRendererConfig(gameConfig)
        )
        await renderer.initialize()

        renderer.render(makeState())

        const scene = graphicAt(1)
        const laneHeight =
            gameConfig.canvasHeight / gameConfig.laneUnlockSeconds.length

        expect(scene.clear).toHaveBeenCalled()
        expect(scene.circle).toHaveBeenCalledWith(
            200,
            laneHeight * 0.5,
            MARKER_RADIUS
        )

        const magentaY = laneHeight * 1.5
        expect(scene.moveTo.mock.calls).toContainEqual([
            400,
            magentaY - MARKER_RADIUS,
        ])
        expect(scene.lineTo.mock.calls).toContainEqual([
            400 + MARKER_RADIUS,
            magentaY + MARKER_RADIUS,
        ])
        expect(scene.lineTo.mock.calls).toContainEqual([
            400 - MARKER_RADIUS,
            magentaY + MARKER_RADIUS,
        ])
        expect(scene.lineTo.mock.calls).toContainEqual([
            400,
            magentaY - MARKER_RADIUS,
        ])

        const amberY = laneHeight * 2.5
        expect(scene.moveTo.mock.calls).toContainEqual([
            600,
            amberY - MARKER_RADIUS,
        ])
        expect(scene.lineTo.mock.calls).toContainEqual([
            600 + MARKER_RADIUS,
            amberY,
        ])
        expect(scene.lineTo.mock.calls).toContainEqual([
            600,
            amberY + MARKER_RADIUS,
        ])
        expect(scene.lineTo.mock.calls).toContainEqual([
            600 - MARKER_RADIUS,
            amberY,
        ])
        expect(scene.lineTo.mock.calls).toContainEqual([
            600,
            amberY - MARKER_RADIUS,
        ])

        expect(scene.fill.mock.calls).toContainEqual([
            { color: SIGNAL_SWITCH_SIGNALS.cyan.color, alpha: 0.9 },
        ])
        expect(scene.fill.mock.calls).toContainEqual([
            { color: SIGNAL_SWITCH_SIGNALS.magenta.color, alpha: 0.9 },
        ])
        expect(scene.fill.mock.calls).toContainEqual([
            { color: SIGNAL_SWITCH_SIGNALS.amber.color, alpha: 0.9 },
        ])
    })

    it('draws the live gate signal for every active lane at gateX', async () => {
        const gameConfig = createSignalSwitchConfig()
        const laneHeight =
            gameConfig.canvasHeight / gameConfig.laneUnlockSeconds.length
        renderer = new SignalSwitchRenderer(
            createSignalSwitchRendererConfig(gameConfig)
        )
        await renderer.initialize()

        const state = makeState()
        state.activeLaneCount = 2
        state.drones = []
        renderer.render(state)

        const scene = graphicAt(1)

        // Lane 0 gate is cyan: circle geometry at (gateX, lane center).
        expect(scene.circle).toHaveBeenCalledWith(
            gameConfig.gateX,
            laneHeight * 0.5,
            GATE_MARKER_RADIUS
        )
        // Lane 1 gate is magenta: triangle path at its lane center.
        const magentaGateY = laneHeight * 1.5
        expect(scene.moveTo.mock.calls).toContainEqual([
            gameConfig.gateX,
            magentaGateY - GATE_MARKER_RADIUS,
        ])
        expect(scene.lineTo.mock.calls).toContainEqual([
            gameConfig.gateX + GATE_MARKER_RADIUS,
            magentaGateY + GATE_MARKER_RADIUS,
        ])
        expect(scene.lineTo.mock.calls).toContainEqual([
            gameConfig.gateX - GATE_MARKER_RADIUS,
            magentaGateY + GATE_MARKER_RADIUS,
        ])
        expect(scene.lineTo.mock.calls).toContainEqual([
            gameConfig.gateX,
            magentaGateY - GATE_MARKER_RADIUS,
        ])

        expect(scene.fill.mock.calls).toContainEqual([
            { color: SIGNAL_SWITCH_SIGNALS.cyan.color, alpha: 0.9 },
        ])
        expect(scene.fill.mock.calls).toContainEqual([
            { color: SIGNAL_SWITCH_SIGNALS.magenta.color, alpha: 0.9 },
        ])
    })

    it('redraws a lane gate with new geometry and color when its signal changes', async () => {
        const gameConfig = createSignalSwitchConfig()
        const laneHeight =
            gameConfig.canvasHeight / gameConfig.laneUnlockSeconds.length
        const gateY = laneHeight * 0.5
        renderer = new SignalSwitchRenderer(
            createSignalSwitchRendererConfig(gameConfig)
        )
        await renderer.initialize()

        const state = makeState()
        state.activeLaneCount = 1
        state.drones = []
        renderer.render(state)

        const scene = graphicAt(1)

        // Cyan gate draws a circle, not a triangle.
        expect(
            scene.circle.mock.calls.filter(
                call =>
                    call[0] === gameConfig.gateX &&
                    call[1] === gateY &&
                    call[2] === GATE_MARKER_RADIUS
            )
        ).toHaveLength(1)
        expect(scene.moveTo.mock.calls).not.toContainEqual([
            gameConfig.gateX,
            gateY - GATE_MARKER_RADIUS,
        ])

        // Switching the same lane to magenta swaps in the triangle path
        // with the magenta catalog color on the next render.
        state.gateSignals[0] = 'magenta'
        renderer.render(state)

        expect(scene.moveTo.mock.calls).toContainEqual([
            gameConfig.gateX,
            gateY - GATE_MARKER_RADIUS,
        ])
        expect(scene.lineTo.mock.calls).toContainEqual([
            gameConfig.gateX + GATE_MARKER_RADIUS,
            gateY + GATE_MARKER_RADIUS,
        ])
        expect(scene.lineTo.mock.calls).toContainEqual([
            gameConfig.gateX - GATE_MARKER_RADIUS,
            gateY + GATE_MARKER_RADIUS,
        ])
        expect(scene.fill.mock.calls).toContainEqual([
            { color: SIGNAL_SWITCH_SIGNALS.magenta.color, alpha: 0.9 },
        ])
    })

    it('leaves locked lanes without any gate marker', async () => {
        const gameConfig = createSignalSwitchConfig()
        const laneHeight =
            gameConfig.canvasHeight / gameConfig.laneUnlockSeconds.length
        renderer = new SignalSwitchRenderer(
            createSignalSwitchRendererConfig(gameConfig)
        )
        await renderer.initialize()

        const state = makeState()
        state.activeLaneCount = 2
        state.drones = []
        renderer.render(state)

        const scene = graphicAt(1)
        const markerYs = [
            ...scene.circle.mock.calls.map(call => call[1]),
            ...scene.moveTo.mock.calls.map(call => call[1]),
        ]
        for (const y of markerYs) {
            expect(y).toBeLessThan(laneHeight * 2)
        }
    })

    it('shades locked lanes with a translucent full-lane overlay', async () => {
        const gameConfig = createSignalSwitchConfig()
        const laneHeight =
            gameConfig.canvasHeight / gameConfig.laneUnlockSeconds.length
        renderer = new SignalSwitchRenderer(
            createSignalSwitchRendererConfig(gameConfig)
        )
        await renderer.initialize()

        const state = makeState()
        state.activeLaneCount = 2
        renderer.render(state)

        const scene = graphicAt(1)
        for (const top of [laneHeight * 2, laneHeight * 3]) {
            const overlayIndex = scene.rect.mock.calls.findIndex(
                call =>
                    call[0] === 0 && call[1] === top && call[3] === laneHeight
            )
            expect(overlayIndex).toBeGreaterThanOrEqual(0)
            expect(scene.rect.mock.calls[overlayIndex]?.[2]).toBe(
                gameConfig.canvasWidth
            )

            const fillArgs = scene.fill.mock.calls[overlayIndex]?.[0] as {
                alpha?: number
            }
            expect(fillArgs?.alpha).toBeLessThan(1)
        }
    })

    it('draws drone bodies around their center x', async () => {
        const gameConfig = createSignalSwitchConfig()
        const laneHeight =
            gameConfig.canvasHeight / gameConfig.laneUnlockSeconds.length
        renderer = new SignalSwitchRenderer(
            createSignalSwitchRendererConfig(gameConfig)
        )
        await renderer.initialize()

        const state = makeState()
        state.activeLaneCount = 4
        state.drones = [{ id: 'drone-x', laneIndex: 1, signal: 'cyan', x: 500 }]
        renderer.render(state)

        const scene = graphicAt(1)
        const centerY = laneHeight * 1.5

        expect(scene.roundRect).toHaveBeenCalledWith(
            500 - gameConfig.droneWidth / 2,
            centerY - gameConfig.droneHeight / 2,
            gameConfig.droneWidth,
            gameConfig.droneHeight,
            6
        )
        expect(scene.circle).toHaveBeenCalledWith(500, centerY, MARKER_RADIUS)
    })
})
