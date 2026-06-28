import { describe, it, expect, vi } from 'vitest'
import {
    buildLayout,
    pixelToWorld,
    pointerToSatellite,
    cleanup,
    type RendererState,
} from './renderer'
import { polarToWorld } from './geometry'
import type { RuntimeSatellite } from './types'

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
