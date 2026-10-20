import { describe, it, expect } from 'vitest'
import {
    ringRadius,
    polarToWorld,
    normalizeAngle,
    angleDiff,
    bearing,
    segmentIntersectsCircle,
    findLockableTarget,
} from './geometry'

describe('normalizeAngle', () => {
    it('wraps negative and >360 values to [0,360)', () => {
        expect(normalizeAngle(-90)).toBe(270)
        expect(normalizeAngle(360)).toBe(0)
        expect(normalizeAngle(450)).toBe(90)
        expect(normalizeAngle(0)).toBe(0)
    })
})

describe('angleDiff', () => {
    it('returns the smallest angular distance', () => {
        expect(angleDiff(10, 20)).toBe(10)
        expect(angleDiff(350, 10)).toBe(20)
        expect(angleDiff(0, 180)).toBe(180)
        expect(angleDiff(90, 270)).toBe(180)
    })
})

describe('ringRadius / polarToWorld', () => {
    it('places angle 0 at the top and 90 at the right', () => {
        const top = polarToWorld(0, 0)
        expect(top.x).toBeCloseTo(0)
        expect(top.y).toBeCloseTo(-ringRadius(0))

        const right = polarToWorld(0, 90)
        expect(right.x).toBeCloseTo(ringRadius(0))
        expect(right.y).toBeCloseTo(0)
    })

    it('increases radius with ring index', () => {
        expect(ringRadius(1)).toBeGreaterThan(ringRadius(0))
    })
})

describe('bearing', () => {
    it('points up (0) when target is directly above', () => {
        expect(bearing({ x: 0, y: 0 }, { x: 0, y: -1 })).toBeCloseTo(0)
    })

    it('points right (90) when target is to the right', () => {
        expect(bearing({ x: 0, y: 0 }, { x: 1, y: 0 })).toBeCloseTo(90)
    })

    it('points down (180) when target is directly below', () => {
        expect(bearing({ x: 0, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(180)
    })
})

describe('segmentIntersectsCircle', () => {
    it('detects a circle blocking the midpoint', () => {
        expect(
            segmentIntersectsCircle(
                { x: -2, y: 0 },
                { x: 2, y: 0 },
                { x: 0, y: 0 },
                0.5
            )
        ).toBe(true)
    })
    it('returns false when the circle is off the segment', () => {
        expect(
            segmentIntersectsCircle(
                { x: -2, y: 0 },
                { x: 2, y: 0 },
                { x: 0, y: 5 },
                0.5
            )
        ).toBe(false)
    })
    it('clamps to segment endpoints', () => {
        expect(
            segmentIntersectsCircle(
                { x: 0, y: 0 },
                { x: 1, y: 0 },
                { x: 5, y: 0 },
                0.5
            )
        ).toBe(false)
    })
})

describe('findLockableTarget', () => {
    const satWorld = { x: 0, y: 0 }
    const noObstacles: {
        ring: number
        currentAngle: number
        radius: number
    }[] = []

    it('locks when color matches and aim is within threshold', () => {
        const targets = [
            {
                id: 't1',
                ring: 1,
                currentAngle: 0,
                color: 'cyan' as const,
                locked: false,
            },
        ]
        const found = findLockableTarget(
            satWorld,
            'cyan',
            0,
            targets,
            noObstacles,
            8
        )
        expect(found?.id).toBe('t1')
    })

    it('skips targets of a different color', () => {
        const targets = [
            {
                id: 't1',
                ring: 1,
                currentAngle: 0,
                color: 'magenta' as const,
                locked: false,
            },
        ]
        expect(
            findLockableTarget(satWorld, 'cyan', 0, targets, noObstacles, 8)
        ).toBeNull()
    })

    it('skips already-locked targets', () => {
        const targets = [
            {
                id: 't1',
                ring: 1,
                currentAngle: 0,
                color: 'cyan' as const,
                locked: true,
            },
        ]
        expect(
            findLockableTarget(satWorld, 'cyan', 0, targets, noObstacles, 8)
        ).toBeNull()
    })

    it('skips targets whose path is blocked by an obstacle', () => {
        const targets = [
            {
                id: 't1',
                ring: 1,
                currentAngle: 0,
                color: 'cyan' as const,
                locked: false,
            },
        ]
        const obstacles = [{ ring: 1, currentAngle: 0, radius: 5 }]
        expect(
            findLockableTarget(satWorld, 'cyan', 0, targets, obstacles, 8)
        ).toBeNull()
    })
})
