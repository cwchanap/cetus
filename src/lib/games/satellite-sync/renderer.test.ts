import { describe, it, expect, vi } from 'vitest'
import {
    buildLayout,
    pixelToWorld,
    pointerToSatellite,
    cleanup,
    render,
    setupScene,
    type RendererState,
} from './renderer'
import { polarToWorld } from './geometry'
import type { RuntimeSatellite, SatelliteSyncState } from './types'
import type { Application } from 'pixi.js'

vi.mock('pixi.js', () => {
    const mockApp = {
        canvas: document.createElement('canvas'),
        init: vi.fn().mockResolvedValue(undefined),
        stage: { addChild: vi.fn() },
        destroy: vi.fn(),
    }
    return {
        Application: vi.fn(() => mockApp),
        Graphics: vi.fn(function (this: unknown) {
            return {
                clear: vi.fn(),
                circle: vi.fn().mockReturnThis(),
                moveTo: vi.fn().mockReturnThis(),
                lineTo: vi.fn().mockReturnThis(),
                stroke: vi.fn().mockReturnThis(),
                fill: vi.fn().mockReturnThis(),
                destroy: vi.fn(),
            }
        }),
    }
})

describe('buildLayout', () => {
    it('centres the scene and scales to fit the outermost ring', () => {
        const layout = buildLayout(400, 400, 2)
        expect(layout.cx).toBe(200)
        expect(layout.cy).toBe(200)
        expect(layout.scale).toBeGreaterThan(0)
    })
})

describe('pixelToWorld / pointerToSatellite', () => {
    it('round-trips world -> pixel -> world', () => {
        const layout = buildLayout(400, 400, 2)
        const world = polarToWorld(0, 90)
        const px = layout.cx + world.x * layout.scale
        const py = layout.cy + world.y * layout.scale
        const back = pixelToWorld(px, py, layout)
        expect(back.x).toBeCloseTo(world.x, 5)
        expect(back.y).toBeCloseTo(world.y, 5)
    })

    it('finds the satellite under the pointer within grab radius', () => {
        const layout = buildLayout(400, 400, 2)
        const sat: RuntimeSatellite = {
            id: 'sat-0',
            ring: 0,
            angle: 0,
            color: 'cyan',
            aimAngle: 0,
            lockedTargetId: null,
            snapCandidateId: null,
        }
        const world = polarToWorld(sat.ring, sat.angle)
        const px = layout.cx + world.x * layout.scale
        const py = layout.cy + world.y * layout.scale
        expect(pointerToSatellite(px, py, [sat], layout)).toBe('sat-0')
    })

    it('returns null when no satellite is near', () => {
        const layout = buildLayout(400, 400, 2)
        const sat: RuntimeSatellite = {
            id: 'sat-0',
            ring: 0,
            angle: 0,
            color: 'cyan',
            aimAngle: 0,
            lockedTargetId: null,
            snapCandidateId: null,
        }
        expect(pointerToSatellite(5, 5, [sat], layout)).toBeNull()
    })
})

describe('cleanup', () => {
    it('destroys the pixi application with children and textures', () => {
        const destroy = vi.fn()
        const state = {
            app: { destroy },
            scene: {},
            layout: buildLayout(400, 400, 2),
        } as unknown as RendererState
        cleanup(state)
        expect(destroy).toHaveBeenCalledWith(true, {
            children: true,
            texture: true,
        })
    })
})

describe('render', () => {
    function makeScene() {
        const calls: string[] = []
        const chain = {
            circle: vi.fn().mockReturnThis(),
            moveTo: vi.fn().mockReturnThis(),
            lineTo: vi.fn().mockReturnThis(),
            stroke: vi.fn().mockReturnThis(),
            fill: vi.fn().mockReturnThis(),
        }
        const scene = {
            clear: vi.fn(() => calls.push('clear')),
            circle: vi.fn(() => chain),
            moveTo: vi.fn(() => chain),
            lineTo: vi.fn(() => chain),
            stroke: vi.fn(() => chain),
            fill: vi.fn(() => chain),
        }
        return { scene, chain }
    }

    function makeState(
        overrides: Partial<SatelliteSyncState> = {}
    ): SatelliteSyncState {
        return {
            levelIndex: 0,
            levelName: 'test',
            timeBudget: 60,
            timeRemaining: 60,
            satellites: [],
            targets: [],
            obstacles: [],
            combo: 0,
            multiplier: 1,
            score: 0,
            status: 'playing',
            ...overrides,
        }
    }

    it('draws obstacles from the state', () => {
        const { scene, chain } = makeScene()
        const layout = buildLayout(400, 400, 3)
        const state = makeState({
            obstacles: [
                {
                    id: 'obs-0',
                    ring: 1,
                    defAngle: 90,
                    currentAngle: 90,
                    radius: 0.3,
                    moving: null,
                },
            ],
        })
        render(
            { app: {} as never, scene, layout } as unknown as RendererState,
            state
        )
        // Obstacle body is drawn via scene.circle(...).fill(...) on the chain.
        expect(scene.circle).toHaveBeenCalled()
        expect(chain.fill).toHaveBeenCalled()
    })

    it('draws the snap-candidate halo for an unlocked target with a candidate', () => {
        const { scene, chain } = makeScene()
        const layout = buildLayout(400, 400, 2)
        const state = makeState({
            satellites: [
                {
                    id: 'sat-0',
                    ring: 0,
                    angle: 0,
                    color: 'cyan',
                    aimAngle: 0,
                    lockedTargetId: null,
                    snapCandidateId: 'target-0',
                },
            ],
            targets: [
                {
                    id: 'target-0',
                    ring: 1,
                    defAngle: 0,
                    currentAngle: 0,
                    color: 'cyan',
                    moving: null,
                    locked: false,
                    lockedBySatId: null,
                },
            ],
        })
        render(
            { app: {} as never, scene, layout } as unknown as RendererState,
            state
        )
        // The halo is an extra circle+stroke on top of the target body.
        // Each target draws at least two circles (fill + stroke); the
        // snap candidate adds a third.
        const circleCalls = scene.circle.mock.calls.length
        // 1 body + 1 ring + 1 satellite body + 1 satellite beam origin
        // + 1 snap halo = >= 5 circle calls.
        expect(circleCalls).toBeGreaterThanOrEqual(5)
        expect(chain.stroke).toHaveBeenCalled()
    })
})

describe('setupScene error path', () => {
    it('clears the container and rethrows when PixiJS init fails', async () => {
        const pixi = await import('pixi.js')
        vi.mocked(pixi.Application).mockImplementationOnce(
            () =>
                ({
                    init: vi.fn().mockRejectedValue(new Error('no webgl')),
                    canvas: document.createElement('canvas'),
                    stage: { addChild: vi.fn() },
                    destroy: vi.fn(),
                }) as unknown as Application
        )
        const container = document.createElement('div')
        // Pre-populate so the catch-block cleanup loop has children to remove.
        container.appendChild(document.createElement('div'))
        await expect(setupScene(container, 2)).rejects.toThrow(
            /Failed to initialize PixiJS/
        )
        expect(container.firstChild).toBeNull()
    })
})
