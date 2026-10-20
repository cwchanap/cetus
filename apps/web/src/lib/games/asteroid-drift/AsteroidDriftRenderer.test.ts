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
            'circle',
            'poly',
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
    ASTEROID_DRIFT_STAR_DOTS,
    AsteroidDriftRenderer,
    createAsteroidDriftRendererConfig,
} from './AsteroidDriftRenderer'
import {
    ASTEROID_DRIFT_RULES,
    createAsteroidDriftConfig,
    type AsteroidDriftState,
} from './types'

type MockGraphics = {
    clear: ReturnType<typeof vi.fn>
    rect: ReturnType<typeof vi.fn>
    fill: ReturnType<typeof vi.fn>
    stroke: ReturnType<typeof vi.fn>
    moveTo: ReturnType<typeof vi.fn>
    lineTo: ReturnType<typeof vi.fn>
    circle: ReturnType<typeof vi.fn>
    poly: ReturnType<typeof vi.fn>
    destroy: ReturnType<typeof vi.fn>
}

function graphicAt(index: number): MockGraphics {
    return vi.mocked(Graphics).mock.results[index]?.value as MockGraphics
}

const playerFixture = {
    x: 400,
    y: 240,
    velocityX: 120,
    velocityY: -90,
    radius: ASTEROID_DRIFT_RULES.playerRadius,
}

const asteroidFixtures = [
    {
        id: 'asteroid-near',
        x: 150,
        y: 120,
        velocityX: -140,
        velocityY: 20,
        radius: 24,
    },
    {
        id: 'asteroid-far',
        x: 620,
        y: 380,
        velocityX: -90,
        velocityY: -30,
        radius: 18,
    },
]

const orbFixture = {
    id: 'orb-1',
    x: 640,
    y: 96,
    radius: 12,
    ageSeconds: 1.5,
}

function makeState(
    overrides: Partial<AsteroidDriftState> = {}
): AsteroidDriftState {
    return {
        score: 240,
        timeRemaining: 82,
        isActive: true,
        isPaused: false,
        isGameOver: false,
        gameStarted: true,
        outcome: 'playing',
        player: playerFixture,
        asteroids: asteroidFixtures.map(asteroid => ({ ...asteroid })),
        energyOrb: orbFixture,
        orbsCollected: 2,
        ...overrides,
    }
}

function callOrderOf(
    mock: ReturnType<typeof vi.fn>,
    predicate: (args: unknown[]) => boolean
): number {
    const index = mock.mock.calls.findIndex(call => predicate(call))
    expect(index).toBeGreaterThanOrEqual(0)
    return mock.mock.invocationCallOrder[index]
}

describe('AsteroidDriftRenderer', () => {
    let container: HTMLElement
    let renderer: AsteroidDriftRenderer | undefined

    beforeEach(() => {
        container = document.createElement('div')
        container.id = 'asteroid-drift-canvas'
        document.body.appendChild(container)
        vi.clearAllMocks()
    })

    afterEach(() => {
        renderer?.destroy()
        container.remove()
    })

    it('creates one background layer and one entity layer in order', async () => {
        const gameConfig = createAsteroidDriftConfig()
        const rendererConfig = createAsteroidDriftRendererConfig(gameConfig)
        renderer = new AsteroidDriftRenderer(rendererConfig)

        await renderer.initialize()

        const app = vi.mocked(Application).mock.results[0]?.value as {
            stage: { addChild: ReturnType<typeof vi.fn> }
        }
        expect(rendererConfig).toEqual({
            type: 'canvas',
            container: '#asteroid-drift-canvas',
            width: 800,
            height: 480,
            responsive: false,
            backgroundColor: 0x020617,
            antialias: true,
        })
        expect(vi.mocked(Graphics)).toHaveBeenCalledTimes(2)
        expect(app.stage.addChild).toHaveBeenCalledTimes(2)
        expect(app.stage.addChild).toHaveBeenNthCalledWith(1, graphicAt(0))
        expect(app.stage.addChild).toHaveBeenNthCalledWith(2, graphicAt(1))
        expect(graphicAt(0).rect).toHaveBeenCalled()
    })

    it('draws the deterministic background once without consuming RNG', async () => {
        const rng = vi.fn()
        renderer = new AsteroidDriftRenderer(
            createAsteroidDriftRendererConfig(
                createAsteroidDriftConfig({ rng })
            )
        )
        await renderer.initialize()

        const background = graphicAt(0)
        const width = ASTEROID_DRIFT_RULES.canvasWidth
        const height = ASTEROID_DRIFT_RULES.canvasHeight

        expect(background.rect).toHaveBeenCalledWith(0, 0, width, height)
        expect(background.rect).toHaveBeenCalledWith(
            0.5,
            0.5,
            width - 1,
            height - 1
        )
        expect(background.circle).toHaveBeenCalledTimes(
            ASTEROID_DRIFT_STAR_DOTS.length
        )
        for (const dot of ASTEROID_DRIFT_STAR_DOTS) {
            expect(background.circle).toHaveBeenCalledWith(
                dot.x * width,
                dot.y * height,
                dot.r
            )
        }

        const rectCalls = background.rect.mock.calls.length
        const circleCalls = background.circle.mock.calls.length
        renderer.render(makeState())
        renderer.render(makeState())

        expect(background.rect.mock.calls.length).toBe(rectCalls)
        expect(background.circle.mock.calls.length).toBe(circleCalls)
        expect(background.clear).toHaveBeenCalledTimes(1)
        expect(graphicAt(1).clear).toHaveBeenCalledTimes(2)
        expect(rng).not.toHaveBeenCalled()
    })

    it('renders entities in orb, asteroids, ship order', async () => {
        renderer = new AsteroidDriftRenderer(
            createAsteroidDriftRendererConfig(createAsteroidDriftConfig())
        )
        await renderer.initialize()

        renderer.render(makeState())

        const entity = graphicAt(1)
        const orbOrder = callOrderOf(
            entity.circle,
            call =>
                call[0] === orbFixture.x &&
                call[1] === orbFixture.y &&
                call[2] === orbFixture.radius
        )
        const firstAsteroidOrder = callOrderOf(
            entity.circle,
            call =>
                call[0] === asteroidFixtures[0].x &&
                call[1] === asteroidFixtures[0].y &&
                call[2] === asteroidFixtures[0].radius
        )
        const secondAsteroidOrder = callOrderOf(
            entity.circle,
            call =>
                call[0] === asteroidFixtures[1].x &&
                call[1] === asteroidFixtures[1].y &&
                call[2] === asteroidFixtures[1].radius
        )
        const player = playerFixture
        const noseIndex = entity.moveTo.mock.calls.findIndex(
            ([x, y]) => Math.hypot(x - player.x, y - player.y) <= player.radius
        )
        expect(noseIndex).toBeGreaterThanOrEqual(0)
        const shipOrder = entity.moveTo.mock.invocationCallOrder[noseIndex]

        expect(orbOrder).toBeLessThan(firstAsteroidOrder)
        expect(firstAsteroidOrder).toBeLessThan(secondAsteroidOrder)
        expect(secondAsteroidOrder).toBeLessThan(shipOrder)
    })

    it('keeps every ship hull vertex within player radius along velocity heading', async () => {
        renderer = new AsteroidDriftRenderer(
            createAsteroidDriftRendererConfig(createAsteroidDriftConfig())
        )
        await renderer.initialize()

        renderer.render(makeState())

        const entity = graphicAt(1)
        const player = makeState().player
        const hullPathCalls = [
            ...entity.moveTo.mock.calls,
            ...entity.lineTo.mock.calls,
        ].filter(
            ([x, y]) =>
                Math.hypot(x - player.x, y - player.y) <= player.radius + 1e-9
        )
        // moveTo(nose) + lineTo x3 (closing back to the nose)
        expect(hullPathCalls).toHaveLength(4)

        const heading = Math.atan2(player.velocityY, player.velocityX)
        const nose = hullPathCalls[0] as [number, number]
        const noseAngle = Math.atan2(nose[1] - player.y, nose[0] - player.x)
        expect(noseAngle).toBeCloseTo(heading, 6)

        const seenVertices: string[] = []
        for (const call of hullPathCalls) {
            const [x, y] = call as [number, number]
            const distance = Math.hypot(x - player.x, y - player.y)
            expect(distance).toBeLessThanOrEqual(player.radius)
            expect(distance).toBeCloseTo(player.radius, 6)
            seenVertices.push(`${x},${y}`)
        }
        // Three distinct equilateral vertices; the fourth call closes the hull
        expect(new Set(seenVertices).size).toBe(3)
    })

    it('points the stationary ship right and scales hull with player radius', async () => {
        renderer = new AsteroidDriftRenderer(
            createAsteroidDriftRendererConfig(createAsteroidDriftConfig())
        )
        await renderer.initialize()

        const stationary = makeState({
            player: {
                x: 300,
                y: 200,
                velocityX: 0,
                velocityY: 0,
                radius: 25,
            },
        })
        renderer.render(stationary)

        const entity = graphicAt(1)
        const player = stationary.player
        expect(
            entity.moveTo.mock.calls.some(
                ([x, y]) =>
                    Math.abs(x - (player.x + player.radius)) < 1e-6 &&
                    y === player.y
            )
        ).toBe(true)
        const hullPathCalls = [
            ...entity.moveTo.mock.calls,
            ...entity.lineTo.mock.calls,
        ].filter(
            ([x, y]) =>
                Math.hypot(x - player.x, y - player.y) <= player.radius + 1e-9
        )
        expect(hullPathCalls).toHaveLength(4)
        for (const call of hullPathCalls) {
            const [x, y] = call as [number, number]
            expect(Math.hypot(x - player.x, y - player.y)).toBeCloseTo(
                player.radius,
                6
            )
        }
    })

    it('draws asteroid outer circles at exact model radii with craters inside', async () => {
        renderer = new AsteroidDriftRenderer(
            createAsteroidDriftRendererConfig(createAsteroidDriftConfig())
        )
        await renderer.initialize()

        const state = makeState()
        renderer.render(state)

        const entity = graphicAt(1)
        for (const asteroid of state.asteroids) {
            expect(entity.circle.mock.calls).toContainEqual([
                asteroid.x,
                asteroid.y,
                asteroid.radius,
            ])

            const craterCalls = entity.circle.mock.calls.filter(
                ([cx, cy, cr]) =>
                    (cx !== asteroid.x || cy !== asteroid.y) &&
                    Math.hypot(
                        (cx as number) - asteroid.x,
                        (cy as number) - asteroid.y
                    ) <= asteroid.radius &&
                    (cr as number) < asteroid.radius
            )
            expect(craterCalls.length).toBeGreaterThanOrEqual(2)
            for (const [cx, cy, cr] of craterCalls as number[][]) {
                expect(
                    Math.hypot(cx - asteroid.x, cy - asteroid.y) + cr
                ).toBeLessThanOrEqual(asteroid.radius)
            }
        }
    })

    it('draws the orb ring at exact radius with diamond and cross inside', async () => {
        renderer = new AsteroidDriftRenderer(
            createAsteroidDriftRendererConfig(createAsteroidDriftConfig())
        )
        await renderer.initialize()

        const state = makeState()
        renderer.render(state)

        const entity = graphicAt(1)
        const orb = orbFixture
        expect(entity.circle.mock.calls).toContainEqual([
            orb.x,
            orb.y,
            orb.radius,
        ])
        expect(entity.stroke.mock.calls).toContainEqual([
            { color: 0xfacc15, width: 2 },
        ])

        expect(entity.poly).toHaveBeenCalledTimes(1)
        const diamond = entity.poly.mock.calls[0][0] as number[]
        expect(diamond).toHaveLength(8)
        for (let i = 0; i < diamond.length; i += 2) {
            const distance = Math.hypot(
                diamond[i] - orb.x,
                diamond[i + 1] - orb.y
            )
            expect(distance).toBeLessThanOrEqual(orb.radius)
            expect(distance).toBeCloseTo(orb.radius / 2, 6)
        }

        const crossCalls = [
            ...entity.moveTo.mock.calls,
            ...entity.lineTo.mock.calls,
        ].filter(
            ([x, y]) => Math.hypot(x - orb.x, y - orb.y) <= orb.radius + 1e-9
        )
        expect(crossCalls).toHaveLength(4)
        for (const call of crossCalls) {
            const [x, y] = call as [number, number]
            const distance = Math.hypot(x - orb.x, y - orb.y)
            expect(distance).toBeLessThanOrEqual(orb.radius)
            expect(distance).toBeCloseTo(orb.radius * 0.3, 6)
        }
    })

    it('safely ignores invalid state and a missing orb', async () => {
        renderer = new AsteroidDriftRenderer(
            createAsteroidDriftRendererConfig(createAsteroidDriftConfig())
        )
        await renderer.initialize()

        const entity = graphicAt(1)
        const circleCalls = entity.circle.mock.calls.length
        const pathCalls =
            entity.moveTo.mock.calls.length + entity.lineTo.mock.calls.length

        expect(() => {
            renderer!.render(null)
            renderer!.render(undefined)
            renderer!.render({})
            renderer!.render(42)
        }).not.toThrow()
        expect(entity.circle.mock.calls.length).toBe(circleCalls)
        expect(
            entity.moveTo.mock.calls.length + entity.lineTo.mock.calls.length
        ).toBe(pathCalls)

        renderer.render(makeState({ energyOrb: null }))
        expect(entity.circle.mock.calls).not.toContainEqual([640, 96, 12])
        expect(entity.poly).not.toHaveBeenCalled()
        // asteroids and ship still render
        expect(entity.circle.mock.calls).toContainEqual([150, 120, 24])
        expect(
            entity.moveTo.mock.calls.some(
                ([x, y]) => Math.hypot(x - 400, y - 240) <= 16 + 1e-9
            )
        ).toBe(true)
    })

    it('cleans graphics and Pixi app idempotently', async () => {
        renderer = new AsteroidDriftRenderer(
            createAsteroidDriftRendererConfig(createAsteroidDriftConfig())
        )
        await renderer.initialize()

        const background = graphicAt(0)
        const entity = graphicAt(1)
        const app = vi.mocked(Application).mock.results[0]?.value as {
            destroy: ReturnType<typeof vi.fn>
        }

        renderer.cleanup()
        renderer.cleanup()
        renderer.destroy()

        expect(background.destroy).toHaveBeenCalledTimes(1)
        expect(entity.destroy).toHaveBeenCalledTimes(1)
        expect(app.destroy).toHaveBeenCalledTimes(1)
        expect(renderer.isReady()).toBe(false)
    })
})
